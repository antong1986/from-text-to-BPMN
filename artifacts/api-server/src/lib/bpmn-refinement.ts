export interface RefinementGraph {
  nodes: Array<{id:string;type:string;name:string;gatewayType?:"exclusive"|"parallel"}>;
  edges: Array<{from:string;to:string;condition?:string}>;
}

export type RefinementIssue = "invalid-graph" | "removed-node" | "removed-flow" | "unchanged" | "invalid-gateway-structure";

function canonicalGraph(graph: RefinementGraph): string {
  return JSON.stringify({
    nodes: [...graph.nodes]
      .map((node) => ({id:node.id,type:node.type,name:node.name,gatewayType:node.type==="gateway"?(node.gatewayType??"exclusive"):null}))
      .sort((a,b) => a.id.localeCompare(b.id)),
    edges: [...graph.edges]
      .map((edge) => ({from:edge.from,to:edge.to,condition:edge.condition ?? ""}))
      .sort((a,b) => `${a.from}:${a.to}:${a.condition}`.localeCompare(`${b.from}:${b.to}:${b.condition}`)),
  });
}

function hasValidGatewayStructure(graph: RefinementGraph): boolean {
  const nodes = new Map(graph.nodes.map((node) => [node.id,node]));
  const incoming = new Map<string,Array<{from:string;to:string;condition?:string}>>();
  const outgoing = new Map<string,Array<{from:string;to:string;condition?:string}>>();
  graph.edges.forEach((edge) => {
    incoming.set(edge.to,[...(incoming.get(edge.to)??[]),edge]);
    outgoing.set(edge.from,[...(outgoing.get(edge.from)??[]),edge]);
  });

  for (const node of graph.nodes) {
    const inCount = incoming.get(node.id)?.length??0;
    const outCount = outgoing.get(node.id)?.length??0;
    if ((node.type==="userTask"||node.type==="serviceTask")&&inCount>1) return false;
    if (node.type==="gateway"&&(node.gatewayType??"exclusive")!=="parallel"&&inCount>1&&outCount!==1) return false;
    if (node.type==="gateway"&&(node.gatewayType??"exclusive")==="parallel"&&
      !((inCount===1&&outCount>=2)||(inCount>=2&&outCount===1))) return false;
  }

  const parallelSplits = graph.nodes.filter((node) =>
    node.type==="gateway"&&node.gatewayType==="parallel"&&
    incoming.get(node.id)?.length===1&&(outgoing.get(node.id)?.length??0)>=2,
  );
  const parallelJoins = graph.nodes.filter((node) =>
    node.type==="gateway"&&node.gatewayType==="parallel"&&
    (incoming.get(node.id)?.length??0)>=2&&outgoing.get(node.id)?.length===1,
  );
  const matchedJoins = new Set<string>();

  const everyPathReachesJoin = (start:string,joinId:string,visiting=new Set<string>()):boolean => {
    if(start===joinId)return true;
    if(visiting.has(start))return false;
    const node=nodes.get(start);
    if(!node||node.type==="end")return false;
    const inCount=incoming.get(start)?.length??0;
    if(node.type==="gateway"&&(node.gatewayType??"exclusive")!=="parallel"&&inCount>1)return false;
    const edges=outgoing.get(start)??[];
    if(!edges.length)return false;
    visiting.add(start);
    const reaches=edges.every((edge)=>everyPathReachesJoin(edge.to,joinId,visiting));
    visiting.delete(start);
    return reaches;
  };

  for (const split of parallelSplits) {
    const branches=outgoing.get(split.id)??[];
    const candidates=parallelJoins.filter((join)=>
      incoming.get(join.id)?.length===branches.length&&
      branches.every((branch)=>everyPathReachesJoin(branch.to,join.id)),
    );
    if(candidates.length!==1||matchedJoins.has(candidates[0].id))return false;
    matchedJoins.add(candidates[0].id);
  }

  return matchedJoins.size===parallelJoins.length;
}

/**
 * Refined graphs may rewire flows to insert requested actions, but must keep
 * every original node and must remain a valid graph.
 */
export function getRefinementIssue(
  previous: RefinementGraph,
  updated: RefinementGraph,
): RefinementIssue | null {
  const updatedIds = new Set(updated.nodes.map((node) => node.id));
  if (updatedIds.size !== updated.nodes.length ||
    updated.edges.some((edge) => !updatedIds.has(edge.from) || !updatedIds.has(edge.to))) {
    return "invalid-graph";
  }

  const updatedNodes = new Map(updated.nodes.map((node) => [node.id,node]));
  if (previous.nodes.some((node) => {
    const candidate = updatedNodes.get(node.id);
    return !candidate || candidate.type !== node.type;
  })) {
    return "removed-node";
  }
  if(previous.nodes.some((node)=>{
    const candidate=updatedNodes.get(node.id);
    return node.type==="gateway"&&candidate?.type==="gateway"&&
      (candidate.gatewayType??"exclusive")!==(node.gatewayType??"exclusive");
  }))return "invalid-gateway-structure";
  if(!hasValidGatewayStructure(updated))return "invalid-gateway-structure";

  const flowsFrom = new Map<string, Array<{to:string;condition?:string}>>();
  updated.edges.forEach((edge) => {
    flowsFrom.set(edge.from,[...(flowsFrom.get(edge.from) ?? []),edge]);
  });
  const reaches = (start:string,target:string,condition?:string) => {
    const queue = [start], visited = new Set<string>();
    while (queue.length) {
      const current = queue.shift()!;
      if (current === target && (current !== start || visited.has(start))) return true;
      if (visited.has(current)) continue;
      visited.add(current);
      for (const edge of flowsFrom.get(current) ?? []) {
        if (current === start && condition && edge.condition !== condition) continue;
        queue.push(edge.to);
      }
    }
    return false;
  };
  if (previous.edges.some((edge) => !reaches(edge.from,edge.to,edge.condition))) {
    return "removed-flow";
  }

  return canonicalGraph(previous) === canonicalGraph(updated) ? "unchanged" : null;
}
