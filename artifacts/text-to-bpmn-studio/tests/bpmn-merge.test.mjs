import test from 'node:test';
import assert from 'node:assert/strict';
import { mergeGraphs, generateBpmnXmlFromJson } from '../src/utils/bpmnBuilder.ts';

const sample = {
  nodes: [
    { id: 'start', type: 'start', name: 'Начало' },
    { id: 'task', type: 'userTask', name: 'Уточнить заказ' },
    { id: 'decision', type: 'gateway', name: 'Речь распознана?' },
    { id: 'save', type: 'serviceTask', name: 'Сохранить в БД' },
    { id: 'end', type: 'end', name: 'Готово' },
  ],
  edges: [
    { from: 'start', to: 'task' },
    { from: 'task', to: 'decision' },
    { from: 'decision', to: 'task', condition: 'Нет' },
    { from: 'decision', to: 'save', condition: 'Да' },
    { from: 'save', to: 'end' },
  ],
};

test('ten successive generations keep unique IDs and produce XML', () => {
  let graph = structuredClone(sample);
  for (let i = 1; i <= 10; i++) {
    graph = mergeGraphs(graph, sample);
    const ids = new Set(graph.nodes.map(n => n.id));
    assert.equal(ids.size, graph.nodes.length);
    assert.equal(graph.nodes.length, sample.nodes.length + i * (sample.nodes.length - 1));
    assert.ok(graph.edges.every(e => ids.has(e.from) && ids.has(e.to)));
    assert.match(generateBpmnXmlFromJson(graph), /<bpmn:definitions/);
  }
});

test('merge avoids IDs already named next_* and does not mutate input graphs', () => {
  const base = structuredClone(sample);
  base.nodes[1].id = 'next_2';
  base.edges = base.edges.map(e => ({ ...e, from: e.from === 'task' ? 'next_2' : e.from, to: e.to === 'task' ? 'next_2' : e.to }));
  const before = structuredClone(base);
  const nextBefore = structuredClone(sample);
  const result = mergeGraphs(base, sample);
  assert.equal(new Set(result.nodes.map(n => n.id)).size, result.nodes.length);
  assert.deepEqual(base, before);
  assert.deepEqual(sample, nextBefore);
  assert.doesNotThrow(() => generateBpmnXmlFromJson(result));
});
