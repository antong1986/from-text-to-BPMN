import { Router, type IRouter, type Request } from "express";
import { fetchGeminiWithRetry } from "../lib/gemini-request";
import {
  GenerateBpmnBody,
  GenerateBpmnResponse,
  GenerateSpecBody,
  GenerateSpecResponse,
} from "@workspace/api-zod";
import {
  BPMN_GRAPH_SYSTEM_PROMPT,
  BPMN_SPEC_SYSTEM_PROMPT,
} from "../lib/text-to-bpmn-prompts";

const router: IRouter = Router();

const DEFAULT_AI_BASE_URL =
  "https://generativelanguage.googleapis.com/v1beta/openai";
const DEFAULT_AI_MODEL_NAME = "gemini-3.6-flash";
const MAX_TOKENS = 16384;

type ChatMessage = { role: "system" | "user"; content: string };
type ModelResult =
  | { content: string }
  | { error: string; status: number };

function getAiBaseUrl(): string {
  return (process.env.AI_BASE_URL || DEFAULT_AI_BASE_URL).replace(/\/+$/, "");
}

function getAiModelName(): string {
  return process.env.AI_MODEL_NAME || DEFAULT_AI_MODEL_NAME;
}

async function callModel(
  messages: ChatMessage[],
  req: Request,
): Promise<ModelResult> {
  const apiKey = process.env.AI_API_KEY;
  if (!apiKey) {
    return {
      status: 503,
      error: "AI_API_KEY is not configured in the app's Secrets.",
    };
  }

  const model = getAiModelName();
  let response: Response;

  try {
    response = await fetchGeminiWithRetry(`${getAiBaseUrl()}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        max_tokens: MAX_TOKENS,
        messages,
      }),
    }, {
      onRetry: (attempt, status) => req.log.warn(
        { model, attempt, status }, "Retrying a transient Gemini failure",
      ),
    });
  } catch (error) {
    req.log.warn(
      { model, error: error instanceof Error ? error.message : "request failed" },
      "Gemini request could not be completed",
    );
    return {
      status: 502,
      error: "Не удалось дождаться ответа Gemini после повторных попыток. Описание сохранено — попробуйте ещё раз немного позже.",
    };
  }

  if (!response.ok) {
    req.log.warn({ model, status: response.status }, "Gemini returned an error");
    return {
      status: 502,
      error: response.status === 429
        ? "Достигнут лимит запросов Gemini. Описание сохранено — повторите запрос позже или проверьте квоту Google."
        : response.status >= 500
          ? "Gemini временно недоступен. Автоматические повторные попытки не помогли. Описание сохранено — попробуйте немного позже."
          : response.status === 401 || response.status === 403
            ? "Gemini отклонил доступ. Администратору нужно проверить ключ API и разрешения Google."
            : response.status === 400
              ? "Gemini отклонил запрос. Возможно, описание превышает ограничения модели; попробуйте разделить процесс на части."
              : "Gemini отклонил запрос. Администратору нужно проверить настройки модели.",
    };
  }

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    req.log.warn({ model }, "Gemini returned an unreadable response");
    return { status: 502, error: "Gemini returned an invalid response." };
  }

  const content = (
    payload as {
      choices?: Array<{ message?: { content?: unknown } }>;
    }
  )?.choices?.[0]?.message?.content;

  const finishReason = (payload as {
    choices?: Array<{ finish_reason?: string }>;
  })?.choices?.[0]?.finish_reason;
  if (finishReason === "length") {
    return {
      status: 502,
      error: "Ответ Gemini превысил лимит длины и был обрезан. Разделите процесс на части. Исходное описание сохранено.",
    };
  }

  if (typeof content !== "string" || !content.trim()) {
    req.log.warn({ model }, "Gemini response did not contain text");
    return { status: 502, error: "Gemini returned an empty response." };
  }

  return { content };
}

function parseJsonObject(text: string): unknown | null {
  const cleaned = text.replace(/```[a-z]*\s*/gi, "").trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start < 0 || end < start) return null;

  try {
    return JSON.parse(cleaned.slice(start, end + 1));
  } catch {
    return null;
  }
}

router.post("/generate", async (req, res): Promise<void> => {
  const input = GenerateBpmnBody.safeParse(req.body);
  if (!input.success) {
    res.status(400).json({ error: "A non-empty description is required." });
    return;
  }

  const result = await callModel(
    [
      { role: "system", content: BPMN_GRAPH_SYSTEM_PROMPT },
      { role: "user", content: input.data.description.trim() },
    ],
    req,
  );
  if ("error" in result) {
    res.status(result.status).json({ error: result.error });
    return;
  }

  const graph = parseJsonObject(result.content);
  if (!graph) {
    req.log.warn({ model: getAiModelName() }, "Gemini response was not a JSON graph");
    res.status(502).json({ error: "Gemini did not return a valid BPMN graph." });
    return;
  }

  const output = GenerateBpmnResponse.safeParse({ graph });
  if (!output.success) {
    req.log.warn(
      { model: getAiModelName(), validation: output.error.message },
      "Gemini graph did not match the BPMN contract",
    );
    res.status(502).json({ error: "Gemini returned a graph in an invalid format." });
    return;
  }

  res.json(output.data);
});

router.post("/generate-spec", async (req, res): Promise<void> => {
  const input = GenerateSpecBody.safeParse(req.body);
  if (!input.success) {
    res.status(400).json({ error: "A valid BPMN graph is required." });
    return;
  }

  const result = await callModel(
    [
      { role: "system", content: BPMN_SPEC_SYSTEM_PROMPT },
      {
        role: "user",
        content: `JSON-граф процесса:\n${JSON.stringify(input.data.graph, null, 2)}`,
      },
    ],
    req,
  );
  if ("error" in result) {
    res.status(result.status).json({ error: result.error });
    return;
  }

  const spec = result.content
    .replace(/^\s*```[a-z]*\n?/i, "")
    .replace(/```\s*$/, "")
    .trim();
  if (!spec) {
    res.status(502).json({ error: "Gemini returned an empty specification." });
    return;
  }

  const output = GenerateSpecResponse.safeParse({ spec });
  if (!output.success) {
    res.status(502).json({ error: "Gemini returned a specification in an invalid format." });
    return;
  }

  res.json(output.data);
});

export default router;
