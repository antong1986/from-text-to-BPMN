import test from 'node:test';
import assert from 'node:assert/strict';
import {
  generateBpmnXmlFromJson,
  mergeGraphs,
  mergeRefinementGraphs,
} from '../src/utils/bpmnBuilder.ts';

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

test('chat refinement preserves manually added elements and unrelated branches', () => {
  const base = {
    nodes: [
      { id:'start',type:'start',name:'Начало' },
      { id:'manual_check',type:'userTask',name:'Моя ручная проверка' },
      { id:'decision',type:'gateway',name:'Есть товар?' },
      { id:'finish',type:'end',name:'Готово' },
    ],
    edges: [
      { from:'start',to:'manual_check' },
      { from:'manual_check',to:'decision' },
      { from:'decision',to:'finish',condition:'Да' },
      { from:'decision',to:'manual_check',condition:'Нет' },
    ],
  };
  const refined = {
    nodes: [
      ...base.nodes,
      { id:'return_to_stock',type:'serviceTask',name:'Вернуть на склад' },
    ],
    edges: [
      { from:'start',to:'manual_check' },
      { from:'manual_check',to:'decision' },
      { from:'decision',to:'return_to_stock',condition:'Да' },
      { from:'return_to_stock',to:'finish' },
      { from:'decision',to:'manual_check',condition:'Нет' },
    ],
  };

  const merged = mergeRefinementGraphs(base,refined);
  assert.deepEqual(merged.nodes.find(node=>node.id==='manual_check'),base.nodes[1]);
  assert.ok(merged.nodes.some(node=>node.id==='return_to_stock'));
  assert.ok(merged.edges.some(edge=>edge.from==='decision'&&edge.to==='return_to_stock'&&edge.condition==='Да'));
  assert.ok(merged.edges.some(edge=>edge.from==='return_to_stock'&&edge.to==='finish'));
  assert.ok(merged.edges.some(edge=>edge.from==='decision'&&edge.to==='manual_check'&&edge.condition==='Нет'));
  assert.equal(merged.edges.some(edge=>edge.from==='decision'&&edge.to==='finish'&&edge.condition==='Да'),false);
});

test('refinement XML generation keeps existing node bounds and avoids overlapping additions', () => {
  const graph = {
    nodes: [
      { id:'start',type:'start',name:'Начало' },
      { id:'new_task',type:'userTask',name:'Новая задача' },
      { id:'end',type:'end',name:'Завершение' },
    ],
    edges: [{from:'start',to:'new_task'},{from:'new_task',to:'end'}],
  };
  const layout = new Map([
    ['start',{x:100,y:100,width:36,height:36}],
    ['end',{x:300,y:100,width:36,height:36}],
  ]);

  const xml = generateBpmnXmlFromJson(graph,layout);
  assert.match(xml,/<dc:Bounds x="100" y="100" width="36" height="36" \/>/);
  assert.match(xml,/<dc:Bounds x="300" y="100" width="36" height="36" \/>/);
  assert.match(xml,/<dc:Bounds x="290" y="[^1]/);
});
