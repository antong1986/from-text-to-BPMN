import { Router, type IRouter } from "express";
import { checkBPMNLimits, consumeBPMNGeneration, sendPaymentRequired } from "../middlewares/bpmn-limits";
import {
  buildBpmnCorrectionPrompt,
  cleanAssistantXml,
  validateBpmnXml,
} from "../lib/bpmn-xml";
import { fetchWithRetry } from "../lib/fetch-with-retry";

const router: IRouter = Router();
const OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1";
const OPENROUTER_MODEL = "google/gemini-2.5-flash";
const MAX_PROMPT_LENGTH = 60_000;

const BPMN_XML_SYSTEM_PROMPT = `Ты — эксперт по BPMN 2.0 и компилятор описаний процессов в BPMN XML для bpmn-js.
Верни только сырой, корректный, импортируемый XML: первый непустой символ должен начинать тег <bpmn:definitions, а документ должен завершаться </bpmn:definitions>. Не добавляй XML-декларацию, markdown, тройные кавычки, пояснения или текст до/после XML.
Используй BPMN namespace http://www.omg.org/spec/BPMN/20100524/MODEL и пространства имён bpmndi, dc и di. Создай один bpmn:process, начальное и конечные события, задачи и шлюзы по смыслу описания, уникальные id и все необходимые sequenceFlow. Каждая ссылка sourceRef/targetRef должна вести на существующий элемент процесса.
Для визуального отображения в bpmn-js обязательно добавь BPMNDiagram, BPMNPlane, BPMNShape с dc:Bounds для каждого события, задачи и шлюза, а также BPMNEdge с di:waypoint для каждого sequenceFlow. Размещай узлы слева направо, развилки и циклы прокладывай ломанными под углом 90 градусов. Если описание короткое, сохраняй его смысл и не добавляй лишние шаги.`;

function extractAssistantXml(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") return null;
  const choices = (payload as {
    choices?: Array<{ message?: { content?: unknown } }>;
  }).choices;
  const content = choices?.[0]?.message?.content;
  if (typeof content !== "string") return null;
  return cleanAssistantXml(content);
}

router.post("/bpmn/generate", checkBPMNLimits, async (req, res): Promise<void> => {
  const textPrompt =
    req.body && typeof req.body.textPrompt === "string"
      ? req.body.textPrompt.trim()
      : "";
  if (!textPrompt || textPrompt.length > MAX_PROMPT_LENGTH) {
    res.status(400).json({
      error: `textPrompt must contain between 1 and ${MAX_PROMPT_LENGTH} characters.`,
    });
    return;
  }

  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    res.status(503).json({ error: "OPENROUTER_API_KEY не настроен в Secrets проекта." });
    return;
  }

  const model = OPENROUTER_MODEL;
  const requestModel = (
    messages: Array<{ role: "system" | "user"; content: string }>,
    phase: "initial" | "self-correction",
  ) => fetchWithRetry(`${OPENROUTER_BASE_URL}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      ...(process.env.APP_URL ? { "HTTP-Referer": process.env.APP_URL } : {}),
      "X-Title": "Text-to-BPMN Studio",
    },
    body: JSON.stringify({
      model,
      temperature: 0.1,
      max_tokens: 12000,
      messages,
    }),
  }, {
    totalTimeoutMs: 180_000,
    attemptTimeoutMs: 120_000,
    initialRetryDelayMs: 5_000,
    maxRetryDelayMs: 30_000,
    onRetry: (attempt, status) => req.log.warn(
      { model, phase, attempt, status },
      "Retrying a transient OpenRouter failure",
    ),
  });

  const getValidatedXml = async (response: Response) => {
    try {
      const payload: unknown = await response.json();
      const xml = extractAssistantXml(payload) ?? "";
      return { xml, validation: await validateBpmnXml(xml) };
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      return {
        xml: "",
        validation: {
          valid: false,
          reason: `Ответ OpenRouter не удалось разобрать как JSON: ${detail.slice(0, 300)}`,
        },
      };
    }
  };

  const logValidationFailure = (attempt: 1 | 2, reason: string) => {
    console.log(JSON.stringify({
      event: "bpmn_xml_validation_failed",
      model,
      attempt,
      reason,
    }));
  };

  const sendProviderError = (response: Response): void => {
    req.log.warn({ model, status: response.status }, "OpenRouter returned an error after retry attempts");
    res.status(response.status === 429 ? 503 : 502).json({
      error: response.status === 429
        ? "OpenRouter продолжает ограничивать запросы после повторных попыток. Проверьте квоту модели и повторите запрос позже."
        : "OpenRouter не смог построить диаграмму. Проверьте настройки модели и API-ключ.",
    });
  };

  let response: Response;
  try {
    response = await requestModel([
      { role: "system", content: BPMN_XML_SYSTEM_PROMPT },
      { role: "user", content: textPrompt },
    ], "initial");
  } catch (error) {
    req.log.warn(
      {
        model,
        error: error instanceof Error ? error.message : "network request failed",
      },
      "OpenRouter request failed after retry attempts",
    );
    res.status(503).json({
      error: "OpenRouter не ответил после повторных попыток. Проверьте доступность модели и повторите запрос позже.",
    });
    return;
  }

  if (!response.ok) {
    sendProviderError(response);
    return;
  }

  let result = await getValidatedXml(response);
  if (!result.validation.valid) {
    const firstError = result.validation.reason ?? "Неизвестная ошибка BPMN XML.";
    logValidationFailure(1, firstError);
    req.log.warn({ model, attempt: 1, validationError: firstError }, "BPMN XML validation failed");

    const correctionPrompt = buildBpmnCorrectionPrompt(textPrompt, result.xml, firstError);
    try {
      response = await requestModel([
        { role: "system", content: BPMN_XML_SYSTEM_PROMPT },
        { role: "user", content: correctionPrompt },
      ], "self-correction");
    } catch (error) {
      req.log.warn(
        {
          model,
          error: error instanceof Error ? error.message : "network request failed",
        },
        "OpenRouter self-correction request failed after retry attempts",
      );
      res.status(503).json({
        error: "OpenRouter не ответил на автоматическую попытку исправления. Повторите запрос позже.",
      });
      return;
    }

    if (!response.ok) {
      sendProviderError(response);
      return;
    }

    result = await getValidatedXml(response);
    if (!result.validation.valid) {
      const secondError = result.validation.reason ?? "Неизвестная ошибка BPMN XML.";
      logValidationFailure(2, secondError);
      req.log.warn({ model, attempt: 2, validationError: secondError }, "BPMN XML self-correction failed");
      res.status(502).json({
        error: `Модель не вернула корректный BPMN XML даже после автоматического исправления. Причина: ${secondError}`,
      });
      return;
    }
  }

  if (!(await consumeBPMNGeneration(req))) {
    sendPaymentRequired(res);
    return;
  }

  res.type("application/xml").send(result.xml);
});

export default router;
