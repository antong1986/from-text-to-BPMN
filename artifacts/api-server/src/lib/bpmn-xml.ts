import { BpmnModdle } from "bpmn-moddle";

const moddle = new BpmnModdle();

export type BpmnSourceLanguage = "en" | "ru";

export function detectBpmnSourceLanguage(text: string): BpmnSourceLanguage {
  const cyrillicCount = [...text.matchAll(/\p{Script=Cyrillic}/gu)].length;
  const latinCount = [...text.matchAll(/\p{Script=Latin}/gu)].length;
  return cyrillicCount > latinCount ? "ru" : "en";
}

export function buildBpmnSourceLanguageInstruction(language: BpmnSourceLanguage): string {
  return language === "en"
    ? "ЯЗЫКОВОЙ РЕЖИМ: ENGLISH. Исходное описание на английском. Все видимые текстовые подписи BPMN должны быть на английском: названия событий, задач и шлюзов, а также подписи и условия потоков. Не оставляй русские подписи. Сохраняй смысл и структуру процесса; переводи только текстовые подписи."
    : "ЯЗЫКОВОЙ РЕЖИМ: РУССКИЙ. Исходное описание на русском. Все видимые текстовые подписи BPMN должны быть на русском: названия событий, задач и шлюзов, а также подписи и условия потоков. Не оставляй английские подписи. Сохраняй смысл и структуру процесса; переводи только текстовые подписи.";
}

function labelUsesWrongLanguage(label: string, language: BpmnSourceLanguage): boolean {
  const letters = [...label].filter((character) => /\p{L}/u.test(character));
  if (letters.length < 4) return false;
  const wrongScriptCount = letters.filter((character) =>
    language === "en"
      ? /\p{Script=Cyrillic}/u.test(character)
      : /\p{Script=Latin}/u.test(character),
  ).length;
  return wrongScriptCount / letters.length >= 0.5;
}

export function hasBpmnLabelsInWrongLanguage(
  labels: string[],
  language: BpmnSourceLanguage,
): boolean {
  return labels.some((label) => labelUsesWrongLanguage(label, language));
}

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

export async function validateBpmnXml(
  xml: string,
  expectedLanguage?: BpmnSourceLanguage,
): Promise<BpmnXmlValidationResult> {
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

  const shapeBoundsByNodeId = new Map<string, { x: number; y: number; width: number; height: number }>();
  for (const shape of planeElements.filter((element) => element.$type === "bpmndi:BPMNShape")) {
    const shapeData = shape as unknown as {
      bpmnElement?: { id?: string };
      bounds?: { x: number; y: number; width: number; height: number };
    };
    const nodeId = shapeData.bpmnElement?.id;
    const bounds = shapeData.bounds;
    if (!nodeId || !bounds ||
      ![bounds.x, bounds.y, bounds.width, bounds.height].every(Number.isFinite) ||
      bounds.width <= 0 || bounds.height <= 0) {
      return invalid(`BPMNShape "${nodeId ?? "(без элемента)"}" имеет некорректные dc:Bounds.`);
    }
    shapeBoundsByNodeId.set(nodeId, {
      x: bounds.x,
      y: bounds.y,
      width: bounds.width,
      height: bounds.height,
    });
  }

  const edgeByFlowId = new Map(
    planeElements
      .filter((element) => element.$type === "bpmndi:BPMNEdge")
      .map((element) => [element.bpmnElement?.id, element] as const),
  );
  for (const flow of sequenceFlows) {
    const flowId = flow.id ?? "(без id)";
    const edge = edgeByFlowId.get(flow.id) as unknown as
      | { waypoint?: Array<{ x: number; y: number }> }
      | undefined;
    const waypoints = edge?.waypoint ?? [];
    if (waypoints.length < 2) {
      return invalid(`BPMNEdge для sequenceFlow "${flowId}" должен содержать минимум две точки waypoint.`);
    }
    const points = waypoints.map((point) => ({ x: point.x, y: point.y }));
    let previousOrientation: "horizontal" | "vertical" | null = null;
    for (let index = 0; index < points.length; index++) {
      const point = points[index];
      if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) {
        return invalid(`BPMNEdge для sequenceFlow "${flowId}" содержит нечисловой waypoint.`);
      }
      if (index === 0) continue;
      const previous = points[index - 1];
      const sameX = point.x === previous.x;
      const sameY = point.y === previous.y;
      if (sameX === sameY) {
        return invalid(sameX
          ? `BPMNEdge для sequenceFlow "${flowId}" содержит нулевой или повторяющийся сегмент.`
          : `BPMNEdge для sequenceFlow "${flowId}" содержит диагональный сегмент.`);
      }
      const orientation = sameY ? "horizontal" : "vertical";
      if (orientation === previousOrientation) {
        return invalid(`BPMNEdge для sequenceFlow "${flowId}" нарушает чередование горизонтальных и вертикальных сегментов.`);
      }
      previousOrientation = orientation;
    }
    const sourceId = flow.sourceRef?.id;
    const targetId = flow.targetRef?.id;
    for (const [nodeId, bounds] of shapeBoundsByNodeId) {
      if (nodeId === sourceId || nodeId === targetId) continue;
      const right = bounds.x + bounds.width;
      const bottom = bounds.y + bounds.height;
      for (let index = 1; index < points.length; index++) {
        const a = points[index - 1];
        const b = points[index];
        const crosses = a.y === b.y
          ? a.y >= bounds.y && a.y <= bottom &&
            Math.max(a.x, b.x) >= bounds.x && Math.min(a.x, b.x) <= right
          : a.x >= bounds.x && a.x <= right &&
            Math.max(a.y, b.y) >= bounds.y && Math.min(a.y, b.y) <= bottom;
        if (crosses) {
          return invalid(`BPMNEdge для sequenceFlow "${flowId}" пересекает или касается BPMNShape "${nodeId}".`);
        }
      }
    }
  }

  const outgoingByNodeId = new Map<string, typeof sequenceFlows>();
  for (const flow of sequenceFlows) {
    const sourceId = flow.sourceRef?.id;
    if (!sourceId) continue;
    outgoingByNodeId.set(sourceId, [...(outgoingByNodeId.get(sourceId) ?? []), flow]);
  }
  for (const gateway of flowNodes.filter((element) =>
    typeof element.$type === "string" && element.$type.endsWith("Gateway"),
  )) {
    const gatewayId = gateway.id;
    const gatewayBounds = gatewayId ? shapeBoundsByNodeId.get(gatewayId) : undefined;
    const forwardTargets = (gatewayId ? outgoingByNodeId.get(gatewayId) ?? [] : [])
      .map((flow) => flow.targetRef?.id)
      .filter((id): id is string => Boolean(id))
      .map((id) => ({ id, bounds: shapeBoundsByNodeId.get(id) }))
      .filter((target): target is { id: string; bounds: { x: number; y: number; width: number; height: number } } =>
        Boolean(gatewayBounds && target.bounds && target.bounds.x > gatewayBounds.x),
      );
    if (!gatewayId || !gatewayBounds || forwardTargets.length < 2) continue;
    for (const target of forwardTargets) {
      const gap = target.bounds.x - (gatewayBounds.x + gatewayBounds.width);
      if (gap < 80) {
        return invalid(`Ветка из Gateway "${gatewayId}" расположена ближе 80 px к его правой границе.`);
      }
    }
    const orderedTargets = [...forwardTargets].sort((a, b) => a.bounds.y - b.bounds.y);
    for (let index = 1; index < orderedTargets.length; index++) {
      const previous = orderedTargets[index - 1].bounds;
      const current = orderedTargets[index].bounds;
      const verticalGap = Math.abs(
        current.y + current.height / 2 - (previous.y + previous.height / 2),
      );
      if (verticalGap < 120) {
        return invalid(`Ветки Gateway "${gatewayId}" должны быть разнесены по Y минимум на 120 px.`);
      }
    }
  }

  if (expectedLanguage) {
    const labels = flowElements
      .map((element) => (element as unknown as { name?: unknown }).name)
      .filter((label): label is string => typeof label === "string" && label.trim().length > 0);

    if (hasBpmnLabelsInWrongLanguage(labels, expectedLanguage)) {
      return invalid(expectedLanguage === "en"
        ? "В BPMN найдены русские подписи, хотя исходное описание написано на английском."
        : "В BPMN найдены английские подписи, хотя исходное описание написано на русском.");
    }
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
