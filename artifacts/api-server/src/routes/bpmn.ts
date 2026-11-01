import { Router, type IRouter } from "express";
import { checkBPMNLimits, consumeBPMNGeneration, sendPaymentRequired } from "../middlewares/bpmn-limits";
import {
  buildBpmnCorrectionPrompt,
  buildBpmnSourceLanguageInstruction,
  cleanAssistantXml,
  correctStraightMainAxisWaypoints,
  detectBpmnSourceLanguage,
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
ЯЗЫКОВАЯ ЛОКАЛИЗАЦИЯ — ОБЯЗАТЕЛЬНО: определи язык исходного описания процесса и на нём пиши все текстовые подписи модели: имена задач и шлюзов, названия событий и подписи условий sequenceFlow. Для запроса на русском используй русский, для запроса на английском — английский. Не переводи и не меняй BPMN-теги, атрибуты, namespace, id или структуру XML. Локализация не должна менять правила и значения координат X/Y.
Для визуального отображения в bpmn-js обязательно добавь BPMNDiagram, BPMNPlane, BPMNShape с dc:Bounds для каждого события, задачи и шлюза, а также BPMNEdge с di:waypoint для каждого sequenceFlow. Координаты X и Y должны быть числовыми. Размещай узлы слева направо.

КЛАССИФИКАЦИЯ ЗАДАЧ — ОБЯЗАТЕЛЬНО для каждой задачи выбери конкретный тип по исполнителю и действию:
- bpmn:userTask — работу выполняет человек: физическая обработка товара, ручная проверка, принятие решения, согласование, подготовка документов сотрудником.
- bpmn:serviceTask — работу выполняет система автоматически: API/интеграция, вычисление, изменение данных, автоматическая отправка уведомления, генерация документа или запуск фоновой службы.
- Если описание допускает оба толкования, определи исполнителя по контексту процесса и формулировке действия; не используй тип по умолчанию.
- Запрещены generic bpmn:Task и любые другие типы задач, кроме bpmn:UserTask и bpmn:ServiceTask. Не пропускай классификацию ни для одной задачи.

BPMN СТРУКТУРНАЯ ВАЛИДАЦИЯ — ОБЯЗАТЕЛЬНО проверь граф до вывода XML:
1. XOR MERGE альтернативных потоков. Если два или более альтернативных пути сходятся перед одной задачей, не подключай их напрямую к задаче. Сведи все альтернативы в один сходящийся Exclusive Gateway (XOR Merge), затем проведи ровно один sequenceFlow из этого шлюза в задачу. Не используй для этого Parallel Gateway.
2. AND BALANCE параллельных потоков. Для каждого расходящегося Parallel Gateway создай один соответствующий сходящийся Parallel Gateway. Каждая ветка, запущенная этим split-шлюзом, обязана прийти в этот join-шлюз; запрещено обходить его, завершать ветку раньше него, направлять ветку в XOR Merge или смешивать с альтернативными потоками. После синхронизации продолжай процесс одной исходящей веткой. Проверь соответствие входящих веток и шлюза-соединения.
3. Защита от тупиков и циклов. У каждой Task и каждого Gateway должен быть минимум один входящий и один исходящий sequenceFlow. Исключения относятся только к Start Event (нет входящих потоков) и End Event (нет исходящих потоков). Каждый узел должен быть достижим от Start Event и иметь путь к End Event. Не создавай изолированные бесконечные циклы: у каждого цикла должен быть явный выход, ведущий к конечному событию.
4. Проверка токенов. Проследи путь от Start Event до End Event по правилам BPMN: XOR выбирает ровно одну ветку, Parallel split активирует все ветки, Parallel join ждёт их все. Не допускай веток, которые зависают, повторно синхронизируют один токен или приводят к тупику.

ГЕОМЕТРИЯ BPMN DI — ЖЁСТКИЙ АЛГОРИТМ МАТРИЧНОЙ СЕТКИ:
1. ОСНОВНОЙ ПОТОК: располагай последовательные узлы слева направо с шагом ровно 160 px по центрам. Центр Start Event — (100, 200), следующий узел — (260, 200), следующий — (420, 200), далее продолжай с тем же шагом. Центральная горизонтальная линия всегда Y=200. Координаты сетки X/Y обозначают центры узлов; для BPMNShape вычисли dc:Bounds как x=centerX-width/2 и y=centerY-height/2. Не сдвигай узлы с сетки, чтобы исправить маршрут: выбирай свободный столбец или ряд сетки.
2. ПАРАЛЛЕЛЬНЫЕ ВЕТКИ: для ветвей одного AND-шлюза назначай центрам блоков отдельные ряды: верхний Y=50, центральный Y=200, нижний Y=350. Разнос по Y — ровно 150 px. Каждый дочерний блок размещай минимум на 80 px правее правой границы шлюза. Если ветвей больше трёх, используй дополнительные ряды с шагом не менее 150 px. Применяй ту же сетку к вложенным ветвлениям.
3. ТРЁХТОЧЕЧНЫЙ МАРШРУТ ВЕТВЛЕНИЯ: для прямой ветки из шлюза в соседний ряд используй ровно три waypoint: выход с границы шлюза, точка поворота в свободном вертикальном коридоре и вход на границе целевого блока. Для нижней ветки в примере с центром шлюза (420, 200), шлюзом 40×40 и левой границей задачи X=580 на линии Y=350 точки должны быть ровно (440, 200) → (440, 350) → (580, 350). Для верхней ветки используй аналогичную схему с Y=50. Координаты waypoint всегда должны лежать на границах источника/цели либо на свободном коридоре между ними; никогда не размещай waypoint внутри блока.
4. СВОБОДНЫЙ КОРИДОР: размещай узлы на рядах и столбцах так, чтобы каждый прямой участок маршрута проходил вне границ и подписей всех посторонних блоков. Если коридор занят, перемести блок на следующий свободный столбец или ряд матричной сетки до построения стрелки. Не прокладывай BPMNEdge через блоки, не накладывай стрелки друг на друга и не пересекай другие маршруты.
5. ОРТОГОНАЛЬНОСТЬ И ПРОВЕРКА: все сегменты BPMNEdge должны быть строго горизонтальными или вертикальными; соседние waypoint меняют только одну координату. Между изломами чередуй направление сегментов, без диагоналей, нулевых и повторяющихся отрезков. Для прямого потока одного ряда используй горизонтальную линию между границами узлов. Для каждой ветки повторно проверь, что три точки лежат на границах источника/цели и что маршрут не пересекает ни одного постороннего блока. Если проверка не проходит, сначала переставь узел на свободную позицию сетки, затем пересчитай waypoint.
Перед выводом проверь, что каждый sequenceFlow имеет корректные sourceRef/targetRef и соответствующую BPMNEdge с минимум двумя waypoint, каждая задача/шлюз — BPMNShape с корректными bounds, все координаты числовые, отступы и маршруты соответствуют матричному алгоритму.

Сначала построй и проверь структуру и координаты, затем верни только XML. Если описание короткое, сохраняй его смысл и не добавляй лишние шаги.`;

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
  const sourceLanguage = detectBpmnSourceLanguage(textPrompt);
  const localizedSystemPrompt = `${BPMN_XML_SYSTEM_PROMPT}\n\n${buildBpmnSourceLanguageInstruction(sourceLanguage)}`;

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
      const extractedXml = extractAssistantXml(payload) ?? "";
      const xml = await correctStraightMainAxisWaypoints(extractedXml);
      return { xml, validation: await validateBpmnXml(xml, sourceLanguage) };
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
      { role: "system", content: localizedSystemPrompt },
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
        { role: "system", content: localizedSystemPrompt },
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
    sendPaymentRequired(res, req.bpmnLimitMode);
    return;
  }

  res.type("application/xml").send(result.xml);
});

export default router;
