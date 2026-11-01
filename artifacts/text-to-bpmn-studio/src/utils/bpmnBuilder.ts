import type { BpmnEdge, BpmnGraph, BpmnNode } from '@workspace/api-client-react';
import {
  BRANCH_ROW_HEIGHT,
  LOOP_CLEARANCE,
  LOOP_LANE_GAP,
  MIN_GATEWAY_BRANCH_GAP,
  routeFlow,
  type NodeBounds,
} from './bpmnRouting.ts';
import type { Language } from '../i18n';

const BPMN_NS = 'http://www.omg.org/spec/BPMN/20100524/MODEL';
const BPMNDI_NS = 'http://www.omg.org/spec/BPMN/20100524/DI';
const DC_NS = 'http://www.omg.org/spec/DD/20100524/DC';
const DI_NS = 'http://www.omg.org/spec/DD/20100524/DI';
const typeTag: Record<BpmnNode['type'], string> = {
  start: 'startEvent', end: 'endEvent', intermediateEvent:'intermediateCatchEvent',
  userTask: 'userTask', serviceTask: 'serviceTask', gateway: 'exclusiveGateway',
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
  intermediateThrowEvent:'intermediateEvent',
  intermediateCatchEvent:'intermediateEvent',
};
const fallbackNodeNames:Record<Language,Record<BpmnNode['type'],string>>={
  en:{start:'Start',end:'End',intermediateEvent:'Intermediate event',userTask:'User task',serviceTask:'Service task',gateway:'Gateway'},
  ru:{start:'Начало',end:'Завершение',intermediateEvent:'Промежуточное событие',userTask:'Действие пользователя',serviceTask:'Автоматическое действие',gateway:'Условие'},
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
  language: Language = 'en',
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
  const outgoingNodeIds=new Map<string,string[]>();
  graph.edges.forEach(edge=>{
    outgoingNodeIds.set(edge.from,[...(outgoingNodeIds.get(edge.from)??[]),edge.to]);
  });
  const shiftSubtree=(rootId:string,dx:number,dy:number,protectedId:string)=>{
    const pending=[rootId],shifted=new Set<string>();
    while(pending.length) {
      const id=pending.shift()!;
      if(id===protectedId||shifted.has(id))continue;
      shifted.add(id);
      const nodeBounds=bounds.get(id);
      if(nodeBounds) {
        nodeBounds.x+=dx;
        nodeBounds.y+=dy;
      }
      pending.push(...(outgoingNodeIds.get(id)??[]));
    }
  };
  nodes.filter(node=>node.type==='gateway').forEach(gateway=>{
    const gatewayBounds=bounds.get(gateway.id)!;
    const branchTargets=[...new Set(outgoingNodeIds.get(gateway.id)??[])]
      .map(id=>({id,bounds:bounds.get(id)!}))
      .filter(target=>target.bounds.x>gatewayBounds.x);
    branchTargets.forEach(target=>{
      const requiredX=gatewayBounds.x+gatewayBounds.width+MIN_GATEWAY_BRANCH_GAP;
      if(target.bounds.x<requiredX) {
        shiftSubtree(target.id,requiredX-target.bounds.x,0,gateway.id);
      }
    });
    const byVerticalPosition=[...branchTargets].sort((a,b)=>a.bounds.y-b.bounds.y);
    for(let index=1;index<byVerticalPosition.length;index++) {
      const previous=byVerticalPosition[index-1].bounds;
      const current=byVerticalPosition[index].bounds;
      const verticalDistance=current.y+current.height/2-(previous.y+previous.height/2);
      if(verticalDistance<120) {
        shiftSubtree(byVerticalPosition[index].id,0,120-verticalDistance,gateway.id);
      }
    }
  });
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
    const obstacles=[...bounds.entries()]
      .filter(([nodeId])=>nodeId!==e.from&&nodeId!==e.to)
      .map(([,nodeBounds])=>nodeBounds);
    const points = routeFlow(from, to, loopY, lowerGatewayBranch, e.from === e.to, {obstacles});
    return `<bpmndi:BPMNEdge id="${edgeIds[i]}_di" bpmnElement="${edgeIds[i]}">${points.map(([x,y]) => `<di:waypoint x="${x}" y="${y}" />`).join('')}</bpmndi:BPMNEdge>`;
  }).join('\n');
  const elementXml = nodes.map((n, i) => {
    const tag = n.type === 'gateway'
      ? n.gatewayType === 'parallel' ? 'parallelGateway' : 'exclusiveGateway'
      : n.type === 'intermediateEvent'
        ? n.eventType === 'throw' ? 'intermediateThrowEvent' : 'intermediateCatchEvent'
      : typeTag[n.type];
    const id = `Node_${i + 1}`, inner = [
      ...(incoming.get(n.id) ?? []).map(x => `<bpmn:incoming>${x}</bpmn:incoming>`),
      ...(outgoing.get(n.id) ?? []).map(x => `<bpmn:outgoing>${x}</bpmn:outgoing>`),
    ];
    return `<bpmn:${tag} id="${id}" name="${escape(n.name || fallbackNodeNames[language][n.type])}">${inner.join('')}</bpmn:${tag}>`;
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
      ...(element.localName === 'parallelGateway'
        ? {gatewayType:'parallel'}
        : element.localName === 'exclusiveGateway'
          ? {gatewayType:'exclusive'}
          : {}),
      ...(element.localName === 'intermediateThrowEvent'
        ? {eventType:'throw'}
        : element.localName === 'intermediateCatchEvent'
          ? {eventType:'catch'}
          : {}),
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

export function calculateRefinementLayoutOverrides(
  baseGraph:BpmnGraph,
  mergedGraph:BpmnGraph,
  baseBounds:ReadonlyMap<string,NodeBounds>,
):Map<string,NodeBounds> {
  const layout=new Map([...baseBounds].map(([id,bounds])=>[id,{...bounds}]));
  const baseIds=new Set(baseGraph.nodes.map(node=>node.id));
  const addedIds=new Set(mergedGraph.nodes.filter(node=>!baseIds.has(node.id)).map(node=>node.id));
  if(!addedIds.size)return layout;

  const outgoing=new Map<string,Array<{from:string;to:string;condition?:string}>>();
  mergedGraph.edges.forEach(edge=>outgoing.set(edge.from,[...(outgoing.get(edge.from)??[]),edge]));
  const countAddedNodesOnPath=(current:string,target:string,visiting=new Set<string>()):number|null=>{
    if(current===target)return 0;
    if(visiting.has(current))return null;
    visiting.add(current);
    let max:number|null=null;
    for(const edge of outgoing.get(current)??[]) {
      const next=countAddedNodesOnPath(edge.to,target,visiting);
      if(next!==null)max=Math.max(max??0,next+(addedIds.has(edge.to)?1:0));
    }
    visiting.delete(current);
    return max;
  };

  for(const oldEdge of baseGraph.edges) {
    const directFlowRemains=mergedGraph.edges.some(edge=>
      edge.from===oldEdge.from&&edge.to===oldEdge.to&&edge.condition===oldEdge.condition,
    );
    if(directFlowRemains)continue;
    const insertions=countAddedNodesOnPath(oldEdge.from,oldEdge.to);
    const targetBounds=baseBounds.get(oldEdge.to);
    if(!insertions||!targetBounds)continue;

    const shift=190*insertions;
    const queue=[oldEdge.to],visited=new Set<string>();
    while(queue.length) {
      const current=queue.shift()!;
      if(visited.has(current))continue;
      visited.add(current);
      const bounds=layout.get(current);
      if(baseIds.has(current)&&bounds&&bounds.x>=targetBounds.x) {
        layout.set(current,{...bounds,x:bounds.x+shift});
      }
      for(const edge of outgoing.get(current)??[])queue.push(edge.to);
    }
  }
  return layout;
}

export function extractGraphFromXml(xml: string): BpmnGraph {
  return extractBpmnXmlModel(xml).graph;
}

function sameEdge(left:BpmnEdge,right:BpmnEdge):boolean {
  return left.from===right.from&&left.to===right.to&&(left.condition??'')===(right.condition??'');
}

function graphPathExists(graph:BpmnGraph,start:string,target:string):boolean {
  const queue=[start],visited=new Set<string>();
  while(queue.length) {
    const current=queue.shift()!;
    if(current===target)return true;
    if(visited.has(current))continue;
    visited.add(current);
    graph.edges.filter(edge=>edge.from===current).forEach(edge=>queue.push(edge.to));
  }
  return false;
}

export function mergeRefinementGraphs(base:BpmnGraph,refined:BpmnGraph):BpmnGraph {
  validate(base);
  validate(refined);
  const refinedById=new Map(refined.nodes.map(node=>[node.id,node]));
  const nodes=base.nodes.map(node=>{
    const refinement=refinedById.get(node.id);
    return {
      ...node,
      ...(refinement?.name?{name:refinement.name}:{}),
      ...(node.type==='gateway'&&refinement?.gatewayType?{gatewayType:refinement.gatewayType}:{}),
      ...(node.type==='intermediateEvent'&&refinement?.eventType?{eventType:refinement.eventType}:{}),
    };
  });
  const nodeIds=new Set(nodes.map(node=>node.id));
  refined.nodes.filter(node=>!nodeIds.has(node.id)).forEach(node=>nodes.push({...node}));

  const edges=base.edges.map(edge=>({...edge}));
  const consumedRefinements=new Set<number>();
  base.edges.forEach((baseEdge,index)=>{
    const exactIndex=refined.edges.findIndex((edge,i)=>!consumedRefinements.has(i)&&sameEdge(baseEdge,edge));
    if(exactIndex>=0) {
      consumedRefinements.add(exactIndex);
      return;
    }
    const sameEndpointsIndex=refined.edges.findIndex((edge,i)=>
      !consumedRefinements.has(i)&&edge.from===baseEdge.from&&edge.to===baseEdge.to,
    );
    if(sameEndpointsIndex>=0) {
      edges[index]={from:baseEdge.from,to:baseEdge.to,...(refined.edges[sameEndpointsIndex].condition?{condition:refined.edges[sameEndpointsIndex].condition}:{})};
      consumedRefinements.add(sameEndpointsIndex);
      return;
    }
    const insertedNodeIndex=refined.edges.findIndex((edge,i)=>
      !consumedRefinements.has(i)&&edge.from===baseEdge.from&&edge.to!==baseEdge.to&&
      (edge.condition??'')===(baseEdge.condition??'')&&graphPathExists(refined,edge.to,baseEdge.to),
    );
    if(insertedNodeIndex>=0) {
      const insertedEdge=refined.edges[insertedNodeIndex];
      edges[index]={from:baseEdge.from,to:insertedEdge.to,...(insertedEdge.condition??baseEdge.condition?{condition:insertedEdge.condition??baseEdge.condition}:{})};
      consumedRefinements.add(insertedNodeIndex);
    }
  });
  refined.edges.forEach((edge,index)=>{
    if(consumedRefinements.has(index)||edges.some(existing=>sameEdge(existing,edge)))return;
    edges.push({...edge});
  });
  return {nodes,edges};
}

function findBpmnElement(root:Element,localName:string,id:string):Element|undefined {
  return Array.from(root.getElementsByTagNameNS(BPMN_NS,localName)).find(element=>element.getAttribute('id')===id);
}

function findDiElement(root:Element,localName:string,attribute:string,value:string):Element|undefined {
  return Array.from(root.getElementsByTagNameNS(BPMNDI_NS,localName)).find(element=>element.getAttribute(attribute)===value);
}

function childElements(element:Element):Element[] {
  return Array.from(element.childNodes).filter(child=>child.nodeType===1) as Element[];
}

function makeUniqueId(preferred:string,used:Set<string>):string {
  const normalized=preferred.replace(/[^A-Za-z0-9_.-]/g,'_');
  const base=/^[A-Za-z_]/.test(normalized)?normalized:`Bpmn_${normalized}`;
  let result=base,index=1;
  while(used.has(result))result=`${base}_${index++}`;
  used.add(result);
  return result;
}

function setFlowCondition(flow:Element,condition:string|undefined):void {
  if(condition)flow.setAttribute('name',condition);
  else flow.removeAttribute('name');
}

function copyCandidateWaypoints(doc:XMLDocument,target:Element,candidate:Element):void {
  Array.from(target.getElementsByTagNameNS(DI_NS,'waypoint')).forEach(waypoint=>waypoint.parentNode?.removeChild(waypoint));
  Array.from(candidate.getElementsByTagNameNS(DI_NS,'waypoint')).forEach(waypoint=>{
    target.appendChild(doc.importNode(waypoint,true));
  });
}

function copyCandidateBounds(target:Element,candidate:Element):void {
  const targetBounds=target.getElementsByTagNameNS(DC_NS,'Bounds')[0];
  const candidateBounds=candidate.getElementsByTagNameNS(DC_NS,'Bounds')[0];
  if(!targetBounds||!candidateBounds)return;
  ['x','y','width','height'].forEach(attribute=>{
    const value=candidateBounds.getAttribute(attribute);
    if(value)targetBounds.setAttribute(attribute,value);
  });
}

function insertFlowReference(doc:XMLDocument,element:Element,kind:'incoming'|'outgoing',flowId:string):void {
  const reference=doc.createElementNS(BPMN_NS,`bpmn:${kind}`);
  reference.textContent=flowId;
  const firstNonReference=childElements(element).find(child=>child.localName!=='incoming'&&child.localName!=='outgoing');
  element.insertBefore(reference,firstNonReference??null);
}

export function mergeRefinementXml(
  xml:string,
  baseModel:BpmnXmlModel,
  refinedGraph:BpmnGraph,
  layoutOverrides:ReadonlyMap<string,NodeBounds>=baseModel.bounds,
):string {
  const mergedGraph=mergeRefinementGraphs(baseModel.graph,refinedGraph);
  const refinedLayout=calculateRefinementLayoutOverrides(baseModel.graph,mergedGraph,layoutOverrides);
  const doc=parseXmlDocument(xml);
  const process=Array.from(doc.getElementsByTagNameNS(BPMN_NS,'process'))[0];
  const plane=Array.from(doc.getElementsByTagNameNS(BPMNDI_NS,'BPMNPlane'))[0];
  if(!process||!plane)throw new Error('В XML не найдены элементы процесса или диаграммы BPMN.');

  const candidateDoc=parseXmlDocument(generateBpmnXmlFromJson(mergedGraph,refinedLayout));
  const candidateProcess=Array.from(candidateDoc.getElementsByTagNameNS(BPMN_NS,'process'))[0];
  const candidatePlane=Array.from(candidateDoc.getElementsByTagNameNS(BPMNDI_NS,'BPMNPlane'))[0];
  if(!candidateProcess||!candidatePlane)throw new Error('Не удалось подготовить XML для уточнения диаграммы.');

  const usedIds=new Set(Array.from(doc.getElementsByTagName('*')).map(element=>element.getAttribute('id')).filter(Boolean) as string[]);
  const graphToXmlId=new Map(baseModel.nodeXmlIds);
  const graphToElement=new Map<string,Element>();
  graphToXmlId.forEach((xmlId,graphId)=>{
    const element=Array.from(process.getElementsByTagName('*')).find(candidate=>candidate.namespaceURI===BPMN_NS&&candidate.getAttribute('id')===xmlId);
    if(element)graphToElement.set(graphId,element);
  });
  const candidateNodeXmlIds=new Map(mergedGraph.nodes.map((node,index)=>[node.id,`Node_${index+1}`]));
  mergedGraph.nodes.forEach(node=>{
    if(graphToXmlId.has(node.id)) {
      const existing=graphToElement.get(node.id);
      if(existing&&node.name&&existing.getAttribute('name')!==node.name)existing.setAttribute('name',node.name);
      return;
    }
    const candidateId=candidateNodeXmlIds.get(node.id)!;
    const candidateNode=findBpmnElement(candidateProcess,'*',candidateId) ??
      Array.from(candidateProcess.getElementsByTagName('*')).find(element=>element.namespaceURI===BPMN_NS&&element.getAttribute('id')===candidateId);
    if(!candidateNode)throw new Error(`Не удалось создать узел ${node.id}.`);
    const xmlId=makeUniqueId(node.id,usedIds);
    const created=doc.importNode(candidateNode,true) as Element;
    created.setAttribute('id',xmlId);
    childElements(created).filter(child=>child.localName==='incoming'||child.localName==='outgoing').forEach(child=>child.parentNode?.removeChild(child));
    process.appendChild(created);
    graphToXmlId.set(node.id,xmlId);
    graphToElement.set(node.id,created);

    const candidateShape=findDiElement(candidatePlane,'BPMNShape','bpmnElement',candidateId);
    if(candidateShape) {
      const shape=doc.importNode(candidateShape,true) as Element;
      shape.setAttribute('id',makeUniqueId(`${xmlId}_di`,usedIds));
      shape.setAttribute('bpmnElement',xmlId);
      plane.appendChild(shape);
    }
  });

  mergedGraph.nodes.forEach(node=>{
    const xmlId=graphToXmlId.get(node.id);
    const candidateId=candidateNodeXmlIds.get(node.id);
    if(!xmlId||!candidateId)return;
    const targetShape=findDiElement(plane,'BPMNShape','bpmnElement',xmlId);
    const candidateShape=findDiElement(candidatePlane,'BPMNShape','bpmnElement',candidateId);
    if(targetShape&&candidateShape)copyCandidateBounds(targetShape,candidateShape);
  });

  const candidateFlowIds=new Map(mergedGraph.edges.map((_,index)=>[index,`Flow_${index+1}`]));
  const flowIdsByGraphIndex=new Map<number,string>();
  const managedFlowIds=new Set(baseModel.edgeXmlIds);
  baseModel.graph.edges.forEach((oldEdge,index)=>{
    const flowId=baseModel.edgeXmlIds[index];
    const flow=Array.from(process.getElementsByTagNameNS(BPMN_NS,'sequenceFlow')).find(element=>element.getAttribute('id')===flowId);
    if(!flow)return;
    const nextEdge=mergedGraph.edges[index];
    const nextSource=graphToXmlId.get(nextEdge.from),nextTarget=graphToXmlId.get(nextEdge.to);
    if(!nextSource||!nextTarget)throw new Error('Связь уточнения ссылается на неизвестный узел.');
    flow.setAttribute('sourceRef',nextSource);
    flow.setAttribute('targetRef',nextTarget);
    setFlowCondition(flow,nextEdge.condition);
    flowIdsByGraphIndex.set(index,flowId);
    const currentDi=findDiElement(plane,'BPMNEdge','bpmnElement',flowId);
    const candidateDi=findDiElement(candidatePlane,'BPMNEdge','bpmnElement',candidateFlowIds.get(index)!);
    if(currentDi&&candidateDi)copyCandidateWaypoints(doc,currentDi,candidateDi);
  });

  mergedGraph.edges.forEach((edge,index)=>{
    if(flowIdsByGraphIndex.has(index))return;
    const candidateId=candidateFlowIds.get(index)!;
    const candidateFlow=Array.from(candidateProcess.getElementsByTagNameNS(BPMN_NS,'sequenceFlow')).find(element=>element.getAttribute('id')===candidateId);
    if(!candidateFlow)throw new Error(`Не удалось создать поток ${index+1}.`);
    const sourceRef=graphToXmlId.get(edge.from),targetRef=graphToXmlId.get(edge.to);
    if(!sourceRef||!targetRef)throw new Error('Связь уточнения ссылается на неизвестный узел.');
    const flowId=makeUniqueId(candidateId,usedIds);
    const flow=doc.importNode(candidateFlow,true) as Element;
    flow.setAttribute('id',flowId);
    flow.setAttribute('sourceRef',sourceRef);
    flow.setAttribute('targetRef',targetRef);
    setFlowCondition(flow,edge.condition);
    process.appendChild(flow);
    flowIdsByGraphIndex.set(index,flowId);
    managedFlowIds.add(flowId);

    const candidateDi=findDiElement(candidatePlane,'BPMNEdge','bpmnElement',candidateId);
    if(candidateDi) {
      const di=doc.importNode(candidateDi,true) as Element;
      di.setAttribute('id',makeUniqueId(`${flowId}_di`,usedIds));
      di.setAttribute('bpmnElement',flowId);
      plane.appendChild(di);
    }
  });

  graphToElement.forEach(element=>{
    childElements(element).filter(child=>
      (child.localName==='incoming'||child.localName==='outgoing')&&managedFlowIds.has(child.textContent?.trim()??''),
    ).forEach(child=>child.parentNode?.removeChild(child));
  });
  mergedGraph.edges.forEach((edge,index)=>{
    const flowId=flowIdsByGraphIndex.get(index);
    const source=graphToElement.get(edge.from),target=graphToElement.get(edge.to);
    if(!flowId||!source||!target)throw new Error('Не удалось восстановить входящие и исходящие связи.');
    insertFlowReference(doc,source,'outgoing',flowId);
    insertFlowReference(doc,target,'incoming',flowId);
  });
  return new XMLSerializer().serializeToString(doc);
}

export function stackGraphBelow(
  baseGraph:BpmnGraph,
  nextGraph:BpmnGraph,
  baseBounds:ReadonlyMap<string,NodeBounds>,
  nextBounds:ReadonlyMap<string,NodeBounds>,
  baseBottom:number,
  verticalGap=160,
):{graph:BpmnGraph;layoutOverrides:Map<string,NodeBounds>} {
  validate(baseGraph);
  validate(nextGraph);
  if(!Number.isFinite(baseBottom))throw new Error('Не удалось определить нижнюю границу существующей схемы.');

  const usedIds=new Set(baseGraph.nodes.map(node=>node.id));
  let batch=1;
  let remappedIds=new Map<string,string>();
  while(true) {
    remappedIds=new Map(nextGraph.nodes.map(node=>[node.id,`description_${batch}_${node.id}`]));
    if([...remappedIds.values()].every(id=>!usedIds.has(id)))break;
    batch++;
  }

  const sourceBounds=nextGraph.nodes.map(node=>nextBounds.get(node.id));
  if(sourceBounds.some(bounds=>!bounds))throw new Error('Не удалось определить расположение нового процесса.');
  const nextTop=Math.min(...sourceBounds.map(bounds=>bounds!.y));
  const verticalOffset=baseBottom+verticalGap-nextTop;
  const layoutOverrides=new Map(baseBounds);
  nextGraph.nodes.forEach(node=>{
    const bounds=nextBounds.get(node.id)!;
    layoutOverrides.set(remappedIds.get(node.id)!,{...bounds,y:bounds.y+verticalOffset});
  });

  return {
    graph:{
      nodes:[
        ...baseGraph.nodes.map(node=>({...node})),
        ...nextGraph.nodes.map(node=>({...node,id:remappedIds.get(node.id)!})),
      ],
      edges:[
        ...baseGraph.edges.map(edge=>({...edge})),
        ...nextGraph.edges.map(edge=>({
          ...edge,
          from:remappedIds.get(edge.from)!,
          to:remappedIds.get(edge.to)!,
        })),
      ],
    },
    layoutOverrides,
  };
}

function getShapeBoundsByElementId(xml:string):Map<string,NodeBounds> {
  const doc=parseXmlDocument(xml);
  const result=new Map<string,NodeBounds>();
  Array.from(doc.getElementsByTagNameNS(BPMNDI_NS,'BPMNShape')).forEach(shape=>{
    const elementId=shape.getAttribute('bpmnElement');
    const bounds=shape.getElementsByTagNameNS(DC_NS,'Bounds')[0];
    if(!elementId||!bounds)return;
    const x=Number(bounds.getAttribute('x')),y=Number(bounds.getAttribute('y'));
    const width=Number(bounds.getAttribute('width')),height=Number(bounds.getAttribute('height'));
    if([x,y,width,height].every(Number.isFinite))result.set(elementId,{x,y,width,height});
  });
  return result;
}

export function appendGraphBelowXml(xml:string,nextGraph:BpmnGraph):{graph:BpmnGraph;xml:string} {
  const baseModel=extractBpmnXmlModel(xml);
  if(!baseModel.graph.nodes.length) {
    return {graph:nextGraph,xml:generateBpmnXmlFromJson(nextGraph)};
  }

  const nextXml=generateBpmnXmlFromJson(nextGraph);
  const nextShapeBounds=getShapeBoundsByElementId(nextXml);
  const nextBounds=new Map(nextGraph.nodes.map((node,index)=>{
    const bounds=nextShapeBounds.get(`Node_${index+1}`);
    if(!bounds)throw new Error(`Не удалось определить расположение узла ${node.id}.`);
    return [node.id,bounds];
  }));
  const existingShapeBounds=getShapeBoundsByElementId(xml);
  const baseBottom=Math.max(...[...existingShapeBounds.values()].map(bounds=>bounds.y+bounds.height));
  const stacked=stackGraphBelow(
    baseModel.graph,
    nextGraph,
    baseModel.bounds,
    nextBounds,
    Number.isFinite(baseBottom)?baseBottom:Math.max(...[...baseModel.bounds.values()].map(bounds=>bounds.y+bounds.height)),
  );
  return {
    graph:stacked.graph,
    xml:mergeRefinementXml(xml,baseModel,stacked.graph,stacked.layoutOverrides),
  };
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
