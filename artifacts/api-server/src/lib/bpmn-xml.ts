import { BpmnModdle } from "bpmn-moddle";

const moddle = new BpmnModdle();

export function stripXmlMarkdownFences(value: string): string {
  return value
    .trim()
    .replace(/^```(?:xml)?\s*/i, "")
    .replace(/\s*```$/, "")
    .trim();
}

export async function isCompleteBpmnXml(xml: string): Promise<boolean> {
  if (!xml.startsWith("<bpmn:definitions") || !xml.endsWith("</bpmn:definitions>")) {
    return false;
  }

  try {
    const { rootElement } = await moddle.fromXML(xml);
    if (rootElement.$type !== "bpmn:Definitions") return false;

    const process = rootElement.rootElements?.find(
      (element) => element.$type === "bpmn:Process",
    );
    if (!process) return false;

    const flowElements = process.flowElements ?? [];
    const flowNodes = flowElements.filter((element) =>
      element.$type !== "bpmn:SequenceFlow",
    );
    const nodeIds = new Set(flowNodes.map((element) => element.id).filter(
      (id): id is string => Boolean(id),
    ));
    const hasStart = flowNodes.some((element) => element.$type === "bpmn:StartEvent");
    const hasEnd = flowNodes.some((element) => element.$type === "bpmn:EndEvent");
    const sequenceFlows = flowElements.filter(
      (element) => element.$type === "bpmn:SequenceFlow",
    );
    const referencesResolve = sequenceFlows.length > 0 && sequenceFlows.every((flow) =>
        Boolean(flow.sourceRef?.id && nodeIds.has(flow.sourceRef.id)) &&
        Boolean(flow.targetRef?.id && nodeIds.has(flow.targetRef.id)),
      );
    const diagram = rootElement.diagrams?.find(
      (element) => element.$type === "bpmndi:BPMNDiagram",
    );
    const planeElements = diagram?.plane?.planeElement ?? [];
    const shapedNodeIds = new Set(
      planeElements
        .filter((element) => element.$type === "bpmndi:BPMNShape")
        .map((element) => element.bpmnElement?.id)
        .filter((id): id is string => Boolean(id)),
    );
    const hasEveryNodeShape = [...nodeIds].every((id) => shapedNodeIds.has(id));
    const edgedFlowIds = new Set(
      planeElements
        .filter((element) => element.$type === "bpmndi:BPMNEdge")
        .map((element) => element.bpmnElement?.id)
        .filter((id): id is string => Boolean(id)),
    );
    const allFlowsHaveDiagramEdges = sequenceFlows.every(
      (flow) => Boolean(flow.id && edgedFlowIds.has(flow.id)),
    );

    return flowNodes.length > 1 && hasStart && hasEnd && referencesResolve &&
      hasEveryNodeShape && allFlowsHaveDiagramEdges;
  } catch {
    return false;
  }
}
