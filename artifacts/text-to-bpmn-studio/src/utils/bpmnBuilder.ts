import type { BpmnEdge, BpmnGraph, BpmnNode } from '@workspace/api-client-react';
import { BRANCH_ROW_HEIGHT, LOOP_CLEARANCE, LOOP_LANE_GAP, routeFlow, type NodeBounds } from './bpmnRouting.ts';

const typeTag: Record<BpmnNode['type'], string> = {
  start: 'startEvent', end: 'endEvent', userTask: 'userTask', serviceTask: 'serviceTask', gateway: 'exclusiveGateway',
};
const escape = (value: string) => value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function validate(graph: BpmnGraph): void {
  if (!graph || !Array.isArray(graph.nodes) || !graph.nodes.length || !Array.isArray(graph.edges)) throw new Error('Граф процесса пуст или имеет неверный формат.');
  const ids = new Set(graph.nodes.map(n => n.id));
  if (ids.size !== graph.nodes.length) throw new Error('Идентификаторы узлов должны быть уникальны.');
  graph.edges.forEach(e => { if (!ids.has(e.from) || !ids.has(e.to)) throw new Error('Связь ссылается на отсутствующий узел.'); });
}

export function generateBpmnXmlFromJson(graph: BpmnGraph): string {
  validate(graph);
  const nodes = graph.nodes;
  const edgeIds = graph.edges.map((_, i) => `Flow_${i + 1}`);
  const width = (n: BpmnNode) => n.type === 'start' || n.type === 'end' ? 36 : n.type === 'gateway' ? 50 : 110;
  const height = (n: BpmnNode) => n.type === 'start' || n.type === 'end' ? 36 : n.type === 'gateway' ? 50 : 78;
  const byId = new Map(nodes.map((n, i) => [n.id, `Node_${i + 1}`]));
  const outgoing = new Map<string, string[]>(), incoming = new Map<string, string[]>();
  graph.edges.forEach((e, i) => {
    outgoing.set(e.from, [...(outgoing.get(e.from) ?? []), edgeIds[i]]);
    incoming.set(e.to, [...(incoming.get(e.to) ?? []), edgeIds[i]]);
  });
  const positions = new Map<string, {x:number;y:number}>();
  const visited = new Set<string>();
  const place = (id: string, x: number, row: number) => {
    if (visited.has(id)) return; visited.add(id); positions.set(id, { x, y: 150 + row * BRANCH_ROW_HEIGHT });
    const outs = graph.edges.filter(e => e.from === id);
    outs.forEach((e, i) => place(e.to, x + 190, outs.length > 1 && i > 0 ? row + i : row));
  };
  const start = nodes.find(n => n.type === 'start') ?? nodes[0];
  place(start.id, 100, 0);
  nodes.forEach((n, i) => { if (!positions.has(n.id)) positions.set(n.id, { x: 100 + i * 190, y: 150 }); });
  const nodeById = new Map(nodes.map(n => [n.id, n]));
  const loopCount = graph.edges.filter(e => positions.get(e.to)!.x <= positions.get(e.from)!.x).length;
  const minTop = Math.min(...nodes.map(n => positions.get(n.id)!.y - height(n) / 2));
  const topPadding = Math.max(0, 20 + LOOP_CLEARANCE + Math.max(0, loopCount - 1) * LOOP_LANE_GAP - minTop);
  if (topPadding) positions.forEach(p => { p.y += topPadding; });
  const diagramTop = minTop + topPadding;
  const bounds = new Map<string, NodeBounds>(nodes.map(n => {
    const p = positions.get(n.id)!;
    return [n.id, {x: p.x, y: p.y - height(n) / 2, width: width(n), height: height(n)}];
  }));
  const shapeXml = nodes.map((n, i) => {
    const b = bounds.get(n.id)!;
    return `<bpmndi:BPMNShape id="Node_${i + 1}_di" bpmnElement="Node_${i + 1}"${n.type === 'gateway' ? ' isMarkerVisible="true"' : ''}><dc:Bounds x="${b.x}" y="${b.y}" width="${b.width}" height="${b.height}" /></bpmndi:BPMNShape>`;
  }).join('\n');
  let loopLane = 0;
  const edgeXml = graph.edges.map((e, i) => {
    const from = bounds.get(e.from)!, to = bounds.get(e.to)!;
    const isReturn = to.x <= from.x;
    const loopY = diagramTop - LOOP_CLEARANCE - (isReturn ? loopLane++ : 0) * LOOP_LANE_GAP;
    const lowerGatewayBranch = nodeById.get(e.from)!.type === 'gateway' &&
      to.y + to.height / 2 > from.y + from.height / 2;
    const points = routeFlow(from, to, loopY, lowerGatewayBranch, e.from === e.to);
    return `<bpmndi:BPMNEdge id="${edgeIds[i]}_di" bpmnElement="${edgeIds[i]}">${points.map(([x,y]) => `<di:waypoint x="${x}" y="${y}" />`).join('')}</bpmndi:BPMNEdge>`;
  }).join('\n');
  const elementXml = nodes.map((n, i) => {
    const tag = typeTag[n.type], id = `Node_${i + 1}`, inner = [
      ...(incoming.get(n.id) ?? []).map(x => `<bpmn:incoming>${x}</bpmn:incoming>`),
      ...(outgoing.get(n.id) ?? []).map(x => `<bpmn:outgoing>${x}</bpmn:outgoing>`),
    ];
    return `<bpmn:${tag} id="${id}" name="${escape(n.name || (n.type === 'start' ? 'Начало' : n.type === 'end' ? 'Завершение' : n.type === 'gateway' ? 'Условие' : 'Действие'))}">${inner.join('')}</bpmn:${tag}>`;
  }).join('\n');
  const flows = graph.edges.map((e,i) => `<bpmn:sequenceFlow id="${edgeIds[i]}"${e.condition ? ` name="${escape(e.condition)}"` : ''} sourceRef="${byId.get(e.from)}" targetRef="${byId.get(e.to)}" />`).join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI" xmlns:dc="http://www.omg.org/spec/DD/20100524/DC" xmlns:di="http://www.omg.org/spec/DD/20100524/DI" id="Definitions_1" targetNamespace="http://bpmn.io/schema/bpmn">
<bpmn:process id="Process_1" isExecutable="false">${elementXml}${flows}</bpmn:process>
<bpmndi:BPMNDiagram id="BPMNDiagram_1"><bpmndi:BPMNPlane id="BPMNPlane_1" bpmnElement="Process_1">${shapeXml}${edgeXml}</bpmndi:BPMNPlane></bpmndi:BPMNDiagram></bpmn:definitions>`;
}

export function extractGraphFromXml(xml: string): BpmnGraph {
  const doc = new DOMParser().parseFromString(xml, 'application/xml');
  if (doc.getElementsByTagName('parsererror').length) throw new Error('XML диаграммы повреждён.');
  const nodes: BpmnNode[] = [], idMap = new Map<string,string>();
  const mapType: Record<string,BpmnNode['type']> = { startEvent:'start',endEvent:'end',userTask:'userTask',serviceTask:'serviceTask',task:'userTask',exclusiveGateway:'gateway',intermediateThrowEvent:'serviceTask' };
  Array.from(doc.getElementsByTagName('*')).forEach(el => {
    const type = mapType[el.localName], xmlId = el.getAttribute('id');
    if (!type || !xmlId) return;
    const id = `n${nodes.length + 1}`; idMap.set(xmlId,id); nodes.push({ id,type,name:el.getAttribute('name') ?? '' });
  });
  const edges: BpmnEdge[] = [];
  Array.from(doc.getElementsByTagName('*')).forEach(el => {
    if (el.localName !== 'sequenceFlow') return;
    const from=idMap.get(el.getAttribute('sourceRef') ?? ''),to=idMap.get(el.getAttribute('targetRef') ?? '');
    if (from && to) edges.push({ from,to,...(el.getAttribute('name') ? {condition:el.getAttribute('name')!} : {}) });
  });
  return {nodes,edges};
}

export function mergeGraphs(base: BpmnGraph, next: BpmnGraph): BpmnGraph {
  if (!base.nodes.length) return next;
  validate(base);
  validate(next);
  const oldNodes = base.nodes.map(n => ({...n})), oldEdges = [...base.edges];
  const terminals = oldNodes.filter(n => n.type === 'end');
  terminals.forEach(n => { n.type = 'userTask'; });
  const skip = next.nodes.find(n => n.type === 'start');
  const usedIds = new Set(base.nodes.map(n => n.id));
  let sequence = 1;
  const nodeIds = new Map(next.nodes.map(n => {
    while (usedIds.has(`next_${sequence}`)) sequence++;
    const id = `next_${sequence++}`;
    usedIds.add(id);
    return [n.id, id];
  }));
  const addNodes = next.nodes.filter(n => n !== skip).map(n => ({...n,id:nodeIds.get(n.id)!}));
  const entry = next.edges.find(e => e.from === skip?.id)?.to;
  const links: BpmnEdge[] = terminals.length && entry ? terminals.map(n => ({from:n.id,to:nodeIds.get(entry)!})) : [];
  const addEdges = next.edges.filter(e => e.from !== skip?.id).map(e => ({...e,from:nodeIds.get(e.from)!,to:nodeIds.get(e.to)!}));
  return {nodes:[...oldNodes,...addNodes],edges:[...oldEdges,...links,...addEdges]};
}
