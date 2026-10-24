import type { BpmnEdge, BpmnGraph, BpmnNode } from '@workspace/api-client-react';
import { BRANCH_ROW_HEIGHT, LOOP_CLEARANCE, LOOP_LANE_GAP, routeFlow, type NodeBounds } from './bpmnRouting.ts';

const BPMN_NS = 'http://www.omg.org/spec/BPMN/20100524/MODEL';
const BPMNDI_NS = 'http://www.omg.org/spec/BPMN/20100524/DI';
const DC_NS = 'http://www.omg.org/spec/DD/20100524/DC';
const DI_NS = 'http://www.omg.org/spec/DD/20100524/DI';
const typeTag: Record<BpmnNode['type'], string> = {
  start: 'startEvent', end: 'endEvent', userTask: 'userTask', serviceTask: 'serviceTask', gateway: 'exclusiveGateway',
};
const graphTypeByBpmnElement: Record<string,BpmnNode['type']> = {
  startEvent:'start',
  endEvent:'end',
  task:'userTask',
  userTask:'userTask',
  manualTask:'userTask',
  receiveTask:'userTask',
  serviceTask:'serviceTask',
  sendTask:'serviceTask',
  scriptTask:'serviceTask',
  businessRuleTask:'serviceTask',
  exclusiveGateway:'gateway',
  parallelGateway:'gateway',
  eventBasedGateway:'gateway',
  inclusiveGateway:'gateway',
  complexGateway:'gateway',
  intermediateThrowEvent:'serviceTask',
  intermediateCatchEvent:'serviceTask',
};
const escape = (value: string) => value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function validate(graph: BpmnGraph): void {
  if (!graph || !Array.isArray(graph.nodes) || !graph.nodes.length || !Array.isArray(graph.edges)) throw new Error('Граф процесса пуст или имеет неверный формат.');
  const ids = new Set(graph.nodes.map(n => n.id));
  if (ids.size !== graph.nodes.length) throw new Error('Идентификаторы узлов должны быть уникальны.');
  graph.edges.forEach(e => { if (!ids.has(e.from) || !ids.has(e.to)) throw new Error('Связь ссылается на отсутствующий узел.'); });
}

export function generateBpmnXmlFromJson(
  graph: BpmnGraph,
  layoutOverrides?: ReadonlyMap<string,NodeBounds>,
): string {
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
  const generatedBounds = new Map<string, NodeBounds>(nodes.map(n => {
    const p = positions.get(n.id)!;
    return [n.id, {x: p.x, y: p.y - height(n) / 2, width: width(n), height: height(n)}];
  }));
  const bounds = new Map<string,NodeBounds>();
  if (layoutOverrides?.size) {
    const overlaps = (a:NodeBounds,b:NodeBounds) =>
      a.x < b.x + b.width + 24 && a.x + a.width + 24 > b.x &&
      a.y < b.y + b.height + 24 && a.y + a.height + 24 > b.y;
    nodes.forEach(node => {
      const existing=layoutOverrides.get(node.id);
      if(existing)bounds.set(node.id,{...existing});
    });
    nodes.forEach(node => {
      if(bounds.has(node.id))return;
      let candidate={...generatedBounds.get(node.id)!};
      let attempts=0;
      while([...bounds.values()].some(placed=>overlaps(candidate,placed))&&attempts<40) {
        candidate={...candidate,y:candidate.y+BRANCH_ROW_HEIGHT};
        attempts++;
      }
      bounds.set(node.id,candidate);
    });
  } else {
    generatedBounds.forEach((value,key)=>bounds.set(key,value));
  }
  const diagramTop = Math.min(...[...bounds.values()].map(node=>node.y));
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

export type BpmnXmlModel = {
  graph:BpmnGraph;
  nodeXmlIds:Map<string,string>;
  edgeXmlIds:string[];
  bounds:Map<string,NodeBounds>;
};

function parseXmlDocument(xml:string):XMLDocument {
  const doc=new DOMParser().parseFromString(xml,'application/xml');
  if(doc.getElementsByTagName('parsererror').length)throw new Error('XML диаграммы повреждён.');
  return doc;
}

export function extractBpmnXmlModel(xml:string):BpmnXmlModel {
  const doc=parseXmlDocument(xml);
  const process=Array.from(doc.getElementsByTagNameNS(BPMN_NS,'process'))[0];
  if(!process)throw new Error('В XML не найден процесс BPMN.');
  const nodes:BpmnNode[]=[];
  const graphIdByXmlId=new Map<string,string>();
  const nodeXmlIds=new Map<string,string>();
  const flowNodes=Array.from(process.getElementsByTagName('*')).filter(element=>
    element.namespaceURI===BPMN_NS&&graphTypeByBpmnElement[element.localName]&&element.getAttribute('id'),
  );
  flowNodes.forEach(element=>{
    const xmlId=element.getAttribute('id')!;
    const id=`n${nodes.length+1}`;
    graphIdByXmlId.set(xmlId,id);
    nodeXmlIds.set(id,xmlId);
    nodes.push({
      id,
      type:graphTypeByBpmnElement[element.localName],
      name:element.getAttribute('name')??'',
    });
  });
  const edges:BpmnEdge[]=[];
  const edgeXmlIds:string[]=[];
  Array.from(process.getElementsByTagNameNS(BPMN_NS,'sequenceFlow')).forEach(flow=>{
    const from=graphIdByXmlId.get(flow.getAttribute('sourceRef')??'');
    const to=graphIdByXmlId.get(flow.getAttribute('targetRef')??'');
    const id=flow.getAttribute('id');
    if(!from||!to||!id)return;
    edges.push({from,to,...(flow.getAttribute('name')?{condition:flow.getAttribute('name')!}:{})});
    edgeXmlIds.push(id);
  });
  const bounds=new Map<string,NodeBounds>();
  Array.from(doc.getElementsByTagNameNS(BPMNDI_NS,'BPMNShape')).forEach(shape=>{
    const graphId=graphIdByXmlId.get(shape.getAttribute('bpmnElement')??'');
    const element=Array.from(shape.getElementsByTagNameNS(DC_NS,'Bounds'))[0];
    if(!graphId||!element)return;
    const x=Number(element.getAttribute('x')),y=Number(element.getAttribute('y'));
    const width=Number(element.getAttribute('width')),height=Number(element.getAttribute('height'));
    if([x,y,width,height].every(Number.isFinite))bounds.set(graphId,{x,y,width,height});
  });
  return {graph:{nodes,edges},nodeXmlIds,edgeXmlIds,bounds};
}

export function extractGraphFromXml(xml: string): BpmnGraph {
  return extractBpmnXmlModel(xml).graph;
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

export function applyClarificationToGraph(base: BpmnGraph, answer: string): BpmnGraph {
  validate(base);
  const requestsNotification =
    /(?:отправ[\p{L}]*|посыл[\p{L}]*|направ[\p{L}]*|notify|send)\s+(?:клиенту\s+)?(?:уведом[\p{L}]*|сообщени[\p{L}]*|письм[\p{L}]*|notification|message)/iu.test(answer) ||
    /(?:уведом[\p{L}]*|notification)\s+(?:клиенту\s+)?(?:нужн[\p{L}]*|отправ[\p{L}]*|посыл[\p{L}]*)/iu.test(answer);
  const rejectsNotification =
    /не\s+(?:нужно\s+)?(?:отправ[\p{L}]*|посыл[\p{L}]*|направ[\p{L}]*|уведом[\p{L}]*)/iu.test(answer);

  if (!requestsNotification || rejectsNotification) {
    return {nodes: base.nodes.map(node => ({...node})), edges: base.edges.map(edge => ({...edge}))};
  }

  const terminals = base.nodes.filter(node => node.type === 'end');
  if (!terminals.length) {
    return {nodes: base.nodes.map(node => ({...node})), edges: base.edges.map(edge => ({...edge}))};
  }

  const nodes = base.nodes.map(node => ({...node}));
  const edges = base.edges.map(edge => ({...edge}));
  const usedIds = new Set(nodes.map(node => node.id));
  let notificationIndex = 1;

  terminals.forEach(terminal => {
    const incomingEdges = edges.filter(edge => edge.to === terminal.id);
    if (!incomingEdges.length) return;

    let notificationId = `clarification_notification_${notificationIndex++}`;
    while (usedIds.has(notificationId)) {
      notificationId = `clarification_notification_${notificationIndex++}`;
    }
    usedIds.add(notificationId);
    nodes.push({id: notificationId, type: 'serviceTask', name: 'Отправить уведомление клиенту'});

    incomingEdges.forEach(edge => { edge.to = notificationId; });
    edges.push({from: notificationId, to: terminal.id});
  });

  return {nodes, edges};
}
