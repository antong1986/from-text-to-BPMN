import { Router, type IRouter } from "express";
import { checkBPMNLimits, consumeBPMNGeneration, sendPaymentRequired } from "../middlewares/bpmn-limits";
import { isCompleteBpmnXml, stripXmlMarkdownFences } from "../lib/bpmn-xml";
import { fetchWithRetry } from "../lib/fetch-with-retry";

const router: IRouter = Router();
const OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1";
const OPENROUTER_MODEL = "openrouter/free";
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
  return stripXmlMarkdownFences(content);
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

  let response: Response;
  const model = process.env.OPENROUTER_MODEL || OPENROUTER_MODEL;
  try {
    response = await fetchWithRetry(`${OPENROUTER_BASE_URL}/chat/completions`, {
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
        messages: [
          { role: "system", content: BPMN_XML_SYSTEM_PROMPT },
          { role: "user", content: textPrompt },
        ],
      }),
    }, {
      totalTimeoutMs: 180_000,
      attemptTimeoutMs: 120_000,
      initialRetryDelayMs: 5_000,
      maxRetryDelayMs: 30_000,
      onRetry: (attempt, status) => req.log.warn(
        { model, attempt, status },
        "Retrying a transient OpenRouter failure",
      ),
    });
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
    req.log.warn({ model, status: response.status }, "OpenRouter returned an error after retry attempts");
    res.status(response.status === 429 ? 503 : 502).json({
      error: response.status === 429
        ? "OpenRouter продолжает ограничивать запросы после повторных попыток. Проверьте квоту модели и повторите запрос позже."
        : "OpenRouter не смог построить диаграмму. Проверьте настройки модели и API-ключ.",
    });
    return;
  }

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    req.log.warn("OpenRouter returned an unreadable response");
    res.status(502).json({ error: "OpenRouter вернул ответ в неизвестном формате." });
    return;
  }

  const xml = extractAssistantXml(payload);
  if (!xml || !(await isCompleteBpmnXml(xml))) {
    req.log.warn("OpenRouter response did not contain a complete BPMN XML document");
    res.status(502).json({ error: "Модель не вернула корректный BPMN XML. Попробуйте повторить запрос." });
    return;
  }

  if (!(await consumeBPMNGeneration(req))) {
    sendPaymentRequired(res);
    return;
  }

  res.type("application/xml").send(xml);
});

export default router;
