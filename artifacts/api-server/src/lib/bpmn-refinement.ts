export interface RefinementGraph {
  nodes: Array<{id:string;type:string;name:string}>;
  edges: Array<{from:string;to:string;condition?:string}>;
}

export type RefinementIssue = "invalid-graph" | "removed-node" | "removed-flow" | "unchanged";

function canonicalGraph(graph: RefinementGraph): string {
  return JSON.stringify({
    nodes: [...graph.nodes]
      .map((node) => ({id:node.id,type:node.type,name:node.name}))
      .sort((a,b) => a.id.localeCompare(b.id)),
    edges: [...graph.edges]
      .map((edge) => ({from:edge.from,to:edge.to,condition:edge.condition ?? ""}))
      .sort((a,b) => `${a.from}:${a.to}:${a.condition}`.localeCompare(`${b.from}:${b.to}:${b.condition}`)),
  });
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
