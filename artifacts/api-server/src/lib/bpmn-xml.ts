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

const straightMainAxisTaskTypes = new Set(["bpmn:UserTask", "bpmn:ServiceTask"]);

type ShapeBounds = { x: number; y: number; width: number; height: number };
type BpmnPoint = { x: number; y: number };

const gatewayIdentifierPattern = /(?:exclusive|parallel|inclusive)?gateway/i;
const straightMainAxisNodeIdPattern =
  /^(?:task|serviceTask|userTask|gateway|exclusiveGateway|parallelGateway|inclusiveGateway)(?:_|$)/i;

function isGatewayNode(type: string | undefined, id: string | undefined): boolean {
  return gatewayIdentifierPattern.test(type ?? "") ||
    gatewayIdentifierPattern.test(id ?? "");
}

function isStraightMainAxisNodeType(
  type: string | undefined,
  id: string | undefined,
): boolean {
  return Boolean(
    (type && straightMainAxisTaskTypes.has(type)) ||
      isGatewayNode(type, id) ||
      straightMainAxisNodeIdPattern.test(id ?? ""),
  );
}

function segmentIntersectsBounds(
  start: BpmnPoint,
  end: BpmnPoint,
  bounds: ShapeBounds,
): boolean {
  const right = bounds.x + bounds.width;
  const bottom = bounds.y + bounds.height;
  return start.y === end.y
    ? start.y >= bounds.y &&
        start.y <= bottom &&
        Math.max(start.x, end.x) >= bounds.x &&
        Math.min(start.x, end.x) <= right
    : start.x >= bounds.x &&
        start.x <= right &&
        Math.max(start.y, end.y) >= bounds.y &&
        Math.min(start.y, end.y) <= bottom;
}

/**
 * Replace model-authored routes for unobstructed, same-row Task/Gateway flows
 * with a direct boundary-to-boundary segment. If another shape blocks that
 * line, route around it on a clear orthogonal lane before strict validation.
 */
export async function correctStraightMainAxisWaypoints(xml: string): Promise<string> {
  let rootElement: Awaited<ReturnType<typeof moddle.fromXML>>["rootElement"];
  try {
    ({ rootElement } = await moddle.fromXML(xml));
  } catch {
    // Preserve malformed XML so validateBpmnXml can return the precise parse
    // error instead of hiding it behind this best-effort geometry correction.
    return xml;
  }

  const process = rootElement.rootElements?.find(
    (element) => element.$type === "bpmn:Process",
  );
  const diagram = rootElement.diagrams?.find(
    (element) => element.$type === "bpmndi:BPMNDiagram",
  );
  const planeElements = diagram?.plane?.planeElement ?? [];
  if (!process || planeElements.length === 0) return xml;

  const flowElements = process.flowElements ?? [];
  const nodesById = new Map(
    flowElements
      .filter((element) => element.$type !== "bpmn:SequenceFlow" && element.id)
      .map((element) => [element.id as string, element] as const),
  );
  const boundsByNodeId = new Map<string, ShapeBounds>();
  let changed = false;
  for (const shape of planeElements.filter(
    (element) => element.$type === "bpmndi:BPMNShape",
  )) {
    const shapeData = shape as unknown as {
      bpmnElement?: { id?: string };
      bounds?: { x?: number; y?: number; width?: number; height?: number };
    };
    const nodeId = shapeData.bpmnElement?.id;
    const bounds = shapeData.bounds;
    if (!nodeId || !bounds || !Number.isFinite(bounds.x) || !Number.isFinite(bounds.y)) {
      continue;
    }

    const isGateway = isGatewayNode(nodesById.get(nodeId)?.$type, nodeId);
    const width = Number.isFinite(bounds.width) && bounds.width! > 0
      ? bounds.width!
      : isGateway
        ? 50
        : undefined;
    const height = Number.isFinite(bounds.height) && bounds.height! > 0
      ? bounds.height!
      : isGateway
        ? 50
        : undefined;
    if (width === undefined || height === undefined) continue;
    if (bounds.width !== width || bounds.height !== height) {
      bounds.width = width;
      bounds.height = height;
      changed = true;
    }
    boundsByNodeId.set(nodeId, {
      x: bounds.x!,
      y: bounds.y!,
      width,
      height,
    });
  }

  const edgesByFlowId = new Map<string, {
    bpmnElement?: { id?: string };
    waypoint?: Array<{ x: number; y: number }>;
  }>();
  for (const element of planeElements.filter(
    (item) => item.$type === "bpmndi:BPMNEdge",
  )) {
    const edge = element as unknown as {
      bpmnElement?: { id?: string };
      waypoint?: Array<{ x: number; y: number }>;
    };
    if (edge.bpmnElement?.id) {
      edgesByFlowId.set(edge.bpmnElement.id, edge);
    }
  }

  for (const flow of flowElements.filter(
    (element) => element.$type === "bpmn:SequenceFlow",
  )) {
    const sourceId = flow.sourceRef?.id;
    const targetId = flow.targetRef?.id;
    const source = sourceId ? nodesById.get(sourceId) : undefined;
    const target = targetId ? nodesById.get(targetId) : undefined;
    const sourceType = source?.$type;
    const targetType = target?.$type;
    if (
      !source ||
      !target ||
      !sourceType ||
      !targetType ||
      !isStraightMainAxisNodeType(sourceType, sourceId) ||
      !isStraightMainAxisNodeType(targetType, targetId)
    ) {
      continue;
    }

    const sourceBounds = sourceId ? boundsByNodeId.get(sourceId) : undefined;
    const targetBounds = targetId ? boundsByNodeId.get(targetId) : undefined;
    const flowId = flow.id;
    const edge = flowId ? edgesByFlowId.get(flowId) : undefined;
    if (!sourceBounds || !targetBounds || !edge) continue;

    const sourceCenterY = sourceBounds.y + sourceBounds.height / 2;
    const targetCenterY = targetBounds.y + targetBounds.height / 2;
    const startX = sourceBounds.x + sourceBounds.width;
    const endX = targetBounds.x;
    const targetPointX = endX - 2;
    if (sourceCenterY !== targetCenterY || startX >= targetPointX) continue;

    const unrelatedShapes = [...boundsByNodeId].filter(([nodeId]) =>
      nodeId !== sourceId && nodeId !== targetId,
    );
    const sourcePoint = { x: startX, y: sourceCenterY };
    const targetPoint = { x: targetPointX, y: targetCenterY };
    const corridorBlocked = unrelatedShapes.some(([, bounds]) =>
      segmentIntersectsBounds(sourcePoint, targetPoint, bounds),
    );

    let nextWaypoints: BpmnPoint[] = [sourcePoint, targetPoint];
    if (corridorBlocked) {
      const minY = Math.min(...unrelatedShapes.map(([, bounds]) => bounds.y));
      const maxBottom = Math.max(
        ...unrelatedShapes.map(([, bounds]) => bounds.y + bounds.height),
      );
      const laneYs = [Math.max(0, minY - 24), maxBottom + 24];
      const clearLane = laneYs.find((laneY) => {
        if (laneY === sourceCenterY) return false;
        const route = [
          sourcePoint,
          { x: startX, y: laneY },
          { x: targetPointX, y: laneY },
          targetPoint,
        ];
        return unrelatedShapes.every(([, bounds]) =>
          route.slice(1).every((point, index) =>
            !segmentIntersectsBounds(route[index], point, bounds),
          ),
        );
      });
      if (clearLane === undefined) continue;
      nextWaypoints = [
        sourcePoint,
        { x: startX, y: clearLane },
        { x: targetPointX, y: clearLane },
        targetPoint,
      ];
    }

    const currentWaypoints = edge.waypoint ?? [];
    if (
      currentWaypoints.length === nextWaypoints.length &&
      currentWaypoints.every(
        (point, index) =>
          point.x === nextWaypoints[index].x &&
          point.y === nextWaypoints[index].y,
      )
    ) {
      continue;
    }

    const mutableModdle = moddle as unknown as {
      create(type: string, properties: { x: number; y: number }): unknown;
    };
    edge.waypoint = nextWaypoints.map((point) =>
      mutableModdle.create("dc:Point", point),
    ) as Array<{ x: number; y: number }>;
    changed = true;
  }

  if (!changed) return xml;
  const mutableModdle = moddle as unknown as {
    toXML(
      element: unknown,
      options: { format: boolean },
    ): Promise<{ xml: string }>;
  };
  try {
    const serializedXml = (await mutableModdle.toXML(rootElement, { format: true })).xml;
    return cleanAssistantXml(serializedXml);
  } catch {
    return xml;
  }
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
