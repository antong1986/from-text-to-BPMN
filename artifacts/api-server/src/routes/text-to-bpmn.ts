import { Router, type IRouter, type Request } from "express";
import { extname } from "node:path";
import multer from "multer";
import { fetchWithRetry } from "../lib/fetch-with-retry";
import { BPMN_RESPONSE_FORMAT } from "../lib/bpmn-response-format";
import { getRefinementIssue } from "../lib/bpmn-refinement";
import { parseBpmnGraph, parseBpmnRefinement } from "../lib/parse-bpmn-graph";
import { extractAndFilterText } from "../lib/document-preparser";
import {
  GenerateBpmnBody,
  GenerateBpmnResponse,
  UploadDocumentResponse,
  RefineBpmnBody,
  RefineBpmnResponse,
  GenerateSpecBody,
  GenerateSpecResponse,
} from "@workspace/api-zod";
import {
  buildBpmnSourceLanguageInstruction,
  detectBpmnSourceLanguage,
  hasBpmnLabelsInWrongLanguage,
} from "../lib/bpmn-xml";
import {
  BPMN_GRAPH_SYSTEM_PROMPT,
  BPMN_REFINEMENT_SYSTEM_PROMPT,
  BPMN_SPEC_SYSTEM_PROMPT,
} from "../lib/text-to-bpmn-prompts";
import {
  checkBPMNLimits,
  consumeBPMNGeneration,
  sendPaymentRequired,
} from "../middlewares/bpmn-limits";

const router: IRouter = Router();

const DEFAULT_AI_BASE_URL =
  "https://generativelanguage.googleapis.com/v1beta/openai";
const DEFAULT_AI_MODEL_NAME = "gemini-3.6-flash";
const MAX_TOKENS = 16384;
const MAX_DOCUMENT_BYTES = 5 * 1024 * 1024;

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
  graphOutput = false,
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
    response = await fetchWithRetry(`${getAiBaseUrl()}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        max_tokens: MAX_TOKENS,
        messages,
        ...(graphOutput ? {
          response_format: BPMN_RESPONSE_FORMAT,
          reasoning_effort: "low",
        } : {}),
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

type GeneratedGraph = ReturnType<typeof GenerateBpmnResponse.parse>["graph"];

async function generateGraphFromDescription(
  description: string,
  req: Request,
): Promise<{graph:GeneratedGraph}|{error:string;status:number}> {
  const sourceLanguage = detectBpmnSourceLanguage(description);
  const systemPrompt = `${BPMN_GRAPH_SYSTEM_PROMPT}\n\n${buildBpmnSourceLanguageInstruction(sourceLanguage)}`;
  const result = await callModel(
    [
      {
        role: "system",
        content: systemPrompt,
      },
      { role: "user", content: description.trim() },
    ],
    req,
    true,
  );
  if ("error" in result) return result;

  let graph: unknown;
  try {
    graph = parseBpmnGraph(result.content);
  } catch {
    req.log.warn({ model: getAiModelName() }, "Gemini response was not a JSON graph");
    return {status:502,error:"Gemini did not return a valid BPMN graph."};
  }

  const output = GenerateBpmnResponse.safeParse({graph});
  if (!output.success) {
    req.log.warn(
      { model: getAiModelName(), validation: output.error.message },
      "Gemini graph did not match the BPMN contract",
    );
    return {status:502,error:"Gemini returned a graph in an invalid format."};
  }
  const initialGraph = output.data.graph;
  const getLabels = (candidate: GeneratedGraph) => [
    ...candidate.nodes.map((node) => node.name),
    ...candidate.edges.map((edge) => edge.condition ?? ""),
  ];
  if (!hasBpmnLabelsInWrongLanguage(getLabels(initialGraph), sourceLanguage)) {
    return {graph:initialGraph};
  }

  req.log.warn(
    {model:getAiModelName(),sourceLanguage},
    "Gemini graph labels did not match the source description language; requesting one correction",
  );
  const correctionText = sourceLanguage === "en"
    ? `The process description is in English, but the graph contains Russian labels. Translate every node name and branch condition into English. Preserve the graph structure, ids, node types, and meaning. Return only the corrected JSON graph.\n\nDescription:\n${description}\n\nGraph to correct:\n${JSON.stringify(initialGraph)}`
    : `Описание процесса написано на русском, но в графе есть английские подписи. Переведи все названия узлов и условия веток на русский. Сохрани структуру графа, id, типы узлов и смысл. Верни только исправленный JSON-граф.\n\nОписание:\n${description}\n\nГраф для исправления:\n${JSON.stringify(initialGraph)}`;
  const correction = await callModel(
    [
      {role:"system",content:systemPrompt},
      {role:"user",content:correctionText},
    ],
    req,
    true,
  );
  if ("error" in correction) return correction;

  let correctedGraph: unknown;
  try {
    correctedGraph = parseBpmnGraph(correction.content);
  } catch {
    req.log.warn({model:getAiModelName()},"Gemini language correction was not a JSON graph");
    return {status:502,error:"Gemini did not return a valid BPMN graph."};
  }
  const correctedOutput = GenerateBpmnResponse.safeParse({graph:correctedGraph});
  if (!correctedOutput.success) {
    req.log.warn(
      {model:getAiModelName(),validation:correctedOutput.error.message},
      "Gemini language correction did not match the BPMN contract",
    );
    return {status:502,error:"Gemini returned a graph in an invalid format."};
  }
  if (hasBpmnLabelsInWrongLanguage(getLabels(correctedOutput.data.graph),sourceLanguage)) {
    return {status:502,error:"Язык подписей BPMN не соответствует языку исходного описания."};
  }
  return {graph:correctedOutput.data.graph};
}

const documentUpload = multer({
  storage: multer.memoryStorage(),
  limits: {fileSize:MAX_DOCUMENT_BYTES,files:1,fields:0,parts:1},
  fileFilter(_req,file,callback) {
    const extension = extname(file.originalname).toLowerCase();
    callback(null,extension === ".docx" || extension === ".txt");
  },
});

function receiveDocument(req:Request,res:import("express").Response,next:import("express").NextFunction):void {
  documentUpload.single("file")(req,res,(error:unknown) => {
    if (!error) {
      next();
      return;
    }
    if (error instanceof multer.MulterError && error.code === "LIMIT_FILE_SIZE") {
      res.status(413).json({error:"Файл слишком большой. Максимальный размер — 5 МБ."});
      return;
    }
    req.log.warn(
      {error:error instanceof Error ? error.message : "upload failed"},
      "Document upload could not be parsed",
    );
    res.status(400).json({error:"Не удалось принять файл. Загрузите документ .docx или .txt."});
  });
}

router.post("/generate", checkBPMNLimits, async (req, res): Promise<void> => {
  const input = GenerateBpmnBody.safeParse(req.body);
  if (!input.success) {
    res.status(400).json({ error: "A non-empty description is required." });
    return;
  }

  const result = await generateGraphFromDescription(input.data.description,req);
  if ("error" in result) {
    res.status(result.status).json({ error: result.error });
    return;
  }

  if (!(await consumeBPMNGeneration(req))) {
    sendPaymentRequired(res, req.bpmnLimitMode);
    return;
  }
  res.json(GenerateBpmnResponse.parse(result));
});

router.post("/upload-document",checkBPMNLimits,receiveDocument,async(req,res):Promise<void> => {
  const file=req.file;
  if(!file) {
    res.status(400).json({error:"Выберите файл .docx или .txt для импорта."});
    return;
  }

  let description:string;
  try {
    description=await extractAndFilterText(file.buffer,extname(file.originalname));
  } catch(error) {
    req.log.warn(
      {extension:extname(file.originalname),error:error instanceof Error ? error.message : "document parse failed"},
      "Uploaded document did not contain readable process text",
    );
    res.status(400).json({
      error:error instanceof Error && error.message === "The document does not contain readable text."
        ? "В документе не найден читаемый текст."
        : "Не удалось прочитать документ. Проверьте формат и целостность файла.",
    });
    return;
  }

  const generated=await generateGraphFromDescription(description,req);
  if("error" in generated) {
    res.status(generated.status).json({error:generated.error});
    return;
  }

  const output=UploadDocumentResponse.safeParse({description,graph:generated.graph});
  if(!output.success) {
    req.log.error({validation:output.error.message},"Document upload response failed contract validation");
    res.status(500).json({error:"Не удалось обработать документ."});
    return;
  }
  if (!(await consumeBPMNGeneration(req))) {
    sendPaymentRequired(res, req.bpmnLimitMode);
    return;
  }
  res.json(output.data);
});

router.post("/refine", checkBPMNLimits, async (req, res): Promise<void> => {
  const input = RefineBpmnBody.safeParse(req.body);
  if (!input.success) {
    res.status(400).json({ error: "A description, clarification, and BPMN graph are required." });
    return;
  }

  const previousGraph = input.data.graph;
  const sourceLanguage = detectBpmnSourceLanguage(input.data.description);
  const result = await callModel(
    [
      {
        role: "system",
        content: `${BPMN_REFINEMENT_SYSTEM_PROMPT}\n\n${buildBpmnSourceLanguageInstruction(sourceLanguage)}`,
      },
      {
        role: "user",
        content: JSON.stringify({
          description: input.data.description.trim(),
          clarification: input.data.answer.trim(),
          currentGraph: previousGraph,
        }),
      },
    ],
    req,
    true,
  );
  if ("error" in result) {
    res.status(result.status).json({ error: result.error });
    return;
  }

  let refinement: { graph: unknown; message: string };
  try {
    refinement = parseBpmnRefinement(result.content);
  } catch {
    req.log.warn({ model: getAiModelName() }, "Gemini response was not a valid BPMN refinement");
    res.status(502).json({ error: "Gemini did not return a valid BPMN graph update." });
    return;
  }

  const output = RefineBpmnResponse.safeParse(refinement);
  if (!output.success) {
    req.log.warn(
      { model: getAiModelName(), validation: output.error.message },
      "Gemini refinement did not match the BPMN contract",
    );
    res.status(502).json({ error: "Gemini returned a graph update in an invalid format." });
    return;
  }

  const updatedGraph = output.data.graph;
  const refinementIssue = getRefinementIssue(previousGraph, updatedGraph);
  if (refinementIssue === "removed-node") {
    res.status(422).json({
      error: "Уточнение не сохранило исходные элементы схемы. Повторите ответ или уточните, какую ветвь изменить.",
    });
    return;
  }
  if (refinementIssue === "invalid-graph") {
    res.status(422).json({ error: "Уточнение создало некорректные связи. Исходная диаграмма сохранена." });
    return;
  }
  if (refinementIssue === "removed-flow") {
    res.status(422).json({
      error: "Уточнение нарушило существующую ветвь процесса. Диаграмма сохранена без изменений.",
    });
    return;
  }
  if (refinementIssue === "unchanged") {
    res.status(422).json({
      error: "Модель не внесла изменение в диаграмму. Попробуйте описать, на каком шаге должна появиться новая ветвь или действие.",
    });
    return;
  }

  if (!(await consumeBPMNGeneration(req))) {
    sendPaymentRequired(res, req.bpmnLimitMode);
    return;
  }
  res.json(output.data);
});

router.post("/generate-spec", checkBPMNLimits, async (req, res): Promise<void> => {
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

  if (!(await consumeBPMNGeneration(req))) {
    sendPaymentRequired(res, req.bpmnLimitMode);
    return;
  }
  res.json(output.data);
});

export default router;
