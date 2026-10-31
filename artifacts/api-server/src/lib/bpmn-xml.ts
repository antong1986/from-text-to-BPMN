import { BpmnModdle } from "bpmn-moddle";

const moddle = new BpmnModdle();

export function cleanAssistantXml(value: string): string {
  let cleaned = value
    .trim()
    .replace(/^```(?:xml)?\s*/i, "")
    .replace(/\s*```$/, "")
    .trim();

  // Model responses sometimes add an intro, XML declaration, or trailing note.
  // Keep only the BPMN definitions document when its root tag is present.
  const rootMatch = /<(?:[A-Za-z_][\w.-]*:)?definitions\b/i.exec(cleaned);
  if (rootMatch) {
    cleaned = cleaned.slice(rootMatch.index);
    const closingMatch = /<\/(?:[A-Za-z_][\w.-]*:)?definitions\s*>/i.exec(cleaned);
    if (closingMatch) {
      cleaned = cleaned.slice(0, closingMatch.index + closingMatch[0].length);
    }
  } else {
    cleaned = cleaned.replace(
      /^(?:вот\s+(?:(?:ваш|твой)\s+)?(?:корректный\s+)?|here(?:'s| is)\s+)?(?:bpmn\s*)?xml(?:[-\s]+код)?\s*:\s*/i,
      "",
    );
  }

  return cleaned.trim();
}

export interface BpmnXmlValidationResult {
  valid: boolean;
  reason: string | null;
}

function invalid(reason: string): BpmnXmlValidationResult {
  return { valid: false, reason };
}

export async function validateBpmnXml(xml: string): Promise<BpmnXmlValidationResult> {
  if (!xml.trim()) {
    return invalid("Ответ модели не содержит XML-код.");
  }
  if (!xml.startsWith("<bpmn:definitions")) {
    return invalid("Отсутствует корневой тег <bpmn:definitions> в начале документа.");
  }
  if (!xml.endsWith("</bpmn:definitions>")) {
    return invalid("Отсутствует закрывающий тег </bpmn:definitions>; XML может быть обрезан.");
  }

  let rootElement: Awaited<ReturnType<typeof moddle.fromXML>>["rootElement"];
  try {
    ({ rootElement } = await moddle.fromXML(xml));
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    return invalid(`Ошибка парсинга синтаксиса XML: ${detail.slice(0, 300)}`);
  }

  if (rootElement.$type !== "bpmn:Definitions") {
    return invalid(`Неверный корневой элемент: ожидался bpmn:Definitions, получен ${rootElement.$type}.`);
  }

  const process = rootElement.rootElements?.find(
    (element) => element.$type === "bpmn:Process",
  );
  if (!process) {
    return invalid("Не найден блок bpmn:Process.");
  }

  const flowElements = process.flowElements ?? [];
  const flowNodes = flowElements.filter((element) =>
    element.$type !== "bpmn:SequenceFlow",
  );
  const allowedTaskTypes = new Set(["bpmn:UserTask", "bpmn:ServiceTask"]);
  const unclassifiedTask = flowNodes.find((element) => {
    const type = element.$type;
    return typeof type === "string" &&
      type.endsWith("Task") &&
      !allowedTaskTypes.has(type);
  });
  if (unclassifiedTask) {
    return invalid(
      `Задача "${unclassifiedTask.id ?? "(без id)"}" имеет тип ${unclassifiedTask.$type}; допустимы только bpmn:UserTask и bpmn:ServiceTask.`,
    );
  }
  if (flowNodes.length <= 1) {
    return invalid("В bpmn:Process должно быть больше одного узла.");
  }

  const nodeIds = new Set(flowNodes.map((element) => element.id).filter(
    (id): id is string => Boolean(id),
  ));
  if (!flowNodes.some((element) => element.$type === "bpmn:StartEvent")) {
    return invalid("Не найдено начальное событие bpmn:StartEvent.");
  }
  if (!flowNodes.some((element) => element.$type === "bpmn:EndEvent")) {
    return invalid("Не найдено конечное событие bpmn:EndEvent.");
  }

  const sequenceFlows = flowElements.filter(
    (element) => element.$type === "bpmn:SequenceFlow",
  );
  if (sequenceFlows.length === 0) {
    return invalid("Не найдено ни одного bpmn:SequenceFlow.");
  }
  const unresolvedFlow = sequenceFlows.find((flow) =>
    !flow.sourceRef?.id || !nodeIds.has(flow.sourceRef.id) ||
    !flow.targetRef?.id || !nodeIds.has(flow.targetRef.id),
  );
  if (unresolvedFlow) {
    return invalid(`У bpmn:SequenceFlow "${unresolvedFlow.id ?? "(без id)"}" не разрешается sourceRef или targetRef.`);
  }

  const diagram = rootElement.diagrams?.find(
    (element) => element.$type === "bpmndi:BPMNDiagram",
  );
  if (!diagram) {
    return invalid("Не найден блок BPMNDiagram.");
  }
  const plane = diagram.plane;
  if (!plane) {
    return invalid("Не найден блок BPMNPlane внутри BPMNDiagram.");
  }
  const planeElements = plane.planeElement ?? [];
  const shapedNodeIds = new Set(
    planeElements
      .filter((element) => element.$type === "bpmndi:BPMNShape")
      .map((element) => element.bpmnElement?.id)
      .filter((id): id is string => Boolean(id)),
  );
  const missingShapeId = [...nodeIds].find((id) => !shapedNodeIds.has(id));
  if (missingShapeId) {
    return invalid(`Не найден BPMNShape для элемента процесса "${missingShapeId}".`);
  }

  const edgedFlowIds = new Set(
    planeElements
      .filter((element) => element.$type === "bpmndi:BPMNEdge")
      .map((element) => element.bpmnElement?.id)
      .filter((id): id is string => Boolean(id)),
  );
  const missingEdgeFlow = sequenceFlows.find(
    (flow) => !flow.id || !edgedFlowIds.has(flow.id),
  );
  if (missingEdgeFlow) {
    return invalid(`Не найден BPMNEdge для sequenceFlow "${missingEdgeFlow.id ?? "(без id)"}".`);
  }

  return { valid: true, reason: null };
}

export async function isCompleteBpmnXml(xml: string): Promise<boolean> {
  return (await validateBpmnXml(xml)).valid;
}

export function buildBpmnCorrectionPrompt(
  processText: string,
  previousXml: string,
  validationError: string,
): string {
  const xmlContent = previousXml || "(модель не вернула текстовый XML)";
  return `Твой предыдущий XML-код не прошел валидацию из-за ошибки: ${validationError}.
Исправь структуру и верни ИСКЛЮЧИТЕЛЬНО чистый, валидный BPMN 2.0 XML код без лишних слов.

Исходное описание процесса:
${processText}

Первый XML, который нужно исправить:
${xmlContent}`;
}
