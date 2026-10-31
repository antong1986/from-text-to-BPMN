import type { BpmnGraph, BpmnNode } from '@workspace/api-client-react';

const defaultNames: Record<BpmnNode['type'], string> = {
  start: 'Start',
  end: 'End',
  userTask: 'User task',
  serviceTask: 'Service task',
  gateway: 'Gateway',
};

function parseValue(value: unknown): unknown {
  if (typeof value !== 'string') return value;
  // Clean before JSON.parse; support both raw graph JSON and a string-valued graph.
  const cleaned = value.replace(/```(?:json)?/gi, '').trim();
  const start = cleaned.indexOf('{'), end = cleaned.lastIndexOf('}');
  if (start < 0 || end < start) throw new Error('Ответ не содержит JSON-граф.');
  return JSON.parse(cleaned.slice(start, end + 1));
}

export function parseGeneratedGraph(response: unknown): BpmnGraph {
  const envelope = parseValue(response);
  const graph = parseValue(envelope && typeof envelope === 'object' && 'graph' in envelope
    ? envelope.graph : envelope);
  if (!graph || typeof graph !== 'object' || !('nodes' in graph) ||
    !('edges' in graph) || !Array.isArray(graph.nodes) || !Array.isArray(graph.edges)) {
    throw new Error('Граф не содержит nodes и edges.');
  }
  const nodes = graph.nodes.map((node: unknown): BpmnNode => {
    if (!node || typeof node !== 'object') throw new Error('Неверный узел.');
    const n = node as Record<string, unknown>;
    if (typeof n.id !== 'string' || !n.id.trim() ||
      typeof n.type !== 'string' || !Object.hasOwn(defaultNames, n.type)) {
      throw new Error('Неверный id или тип узла.');
    }
    const type = n.type as BpmnNode['type'];
    return { id: n.id, type, name: typeof n.name === 'string' && n.name.trim()
      ? n.name : n.id.trim() || defaultNames[type] };
  });
  const ids = new Set(nodes.map(n => n.id));
  if (!nodes.length || ids.size !== nodes.length) throw new Error('Пустой граф или повторяющиеся id.');
  const edges = graph.edges.map((edge: unknown) => {
    if (!edge || typeof edge !== 'object') throw new Error('Неверная связь.');
    const e = edge as Record<string, unknown>;
    if (typeof e.from !== 'string' || typeof e.to !== 'string' ||
      !ids.has(e.from) || !ids.has(e.to)) throw new Error('Связь ссылается на отсутствующий узел.');
    return { from: e.from, to: e.to,
      ...(typeof e.condition === 'string' ? { condition: e.condition } : {}) };
  });
  return { nodes, edges };
}
