import test from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateRefinementLayoutOverrides,
  generateBpmnXmlFromJson,
  mergeGraphs,
  mergeRefinementGraphs,
  stackGraphBelow,
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

test('chat refinement retains parallel gateway semantics in the merged graph', () => {
  const base = {
    nodes:[
      {id:'start',type:'start',name:'Начало'},
      {id:'split',type:'gateway',gatewayType:'parallel',name:'Разделить поток'},
      {id:'task',type:'userTask',name:'Проверить'},
      {id:'join',type:'gateway',gatewayType:'parallel',name:'Объединить поток'},
      {id:'end',type:'end',name:'Завершение'},
    ],
    edges:[
      {from:'start',to:'split'},
      {from:'split',to:'task'},
      {from:'task',to:'join'},
      {from:'join',to:'end'},
    ],
  };
  const refined = {
    nodes:[
      ...base.nodes,
      {id:'automatic',type:'serviceTask',name:'Сохранить результат'},
      {id:'second',type:'userTask',name:'Подтвердить результат'},
    ],
    edges:[
      {from:'start',to:'split'},
      {from:'split',to:'task'},
      {from:'split',to:'second'},
      {from:'task',to:'automatic'},
      {from:'automatic',to:'join'},
      {from:'second',to:'join'},
      {from:'join',to:'end'},
    ],
  };
  const merged=mergeRefinementGraphs(base,refined);
  assert.deepEqual(
    merged.nodes.filter(node=>node.gatewayType==='parallel').map(node=>node.id),
    ['split','join'],
  );
});

test('refinement layout opens a horizontal slot and moves downstream nodes', () => {
  const base={
    nodes:[
      {id:'start',type:'start',name:'Start'},
      {id:'review',type:'userTask',name:'Review'},
      {id:'end',type:'end',name:'End'},
    ],
    edges:[{from:'start',to:'review'},{from:'review',to:'end'}],
  };
  const merged={
    nodes:[
      ...base.nodes,
      {id:'notify',type:'serviceTask',name:'Notify'},
    ],
    edges:[
      {from:'start',to:'notify'},
      {from:'notify',to:'review'},
      {from:'review',to:'end'},
    ],
  };
  const originalBounds=new Map([
    ['start',{x:100,y:100,width:36,height:36}],
    ['review',{x:290,y:79,width:110,height:78}],
    ['end',{x:480,y:100,width:36,height:36}],
  ]);
  const layout=calculateRefinementLayoutOverrides(base,merged,originalBounds);
  assert.equal(layout.get('start').x,100);
  assert.equal(layout.get('review').x,480);
  assert.equal(layout.get('end').x,670);
  assert.equal(originalBounds.get('review').x,290);
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

test('a new description forms a separate process below the existing graph', () => {
  const nextGraph = {
    nodes: [
      { id:'new_start',type:'start',name:'New start' },
      { id:'new_task',type:'userTask',name:'New task' },
      { id:'new_end',type:'end',name:'New end' },
    ],
    edges: [
      { from:'new_start',to:'new_task' },
      { from:'new_task',to:'new_end' },
    ],
  };
  const nextBounds = new Map([
    ['new_start',{x:100,y:100,width:36,height:36}],
    ['new_task',{x:290,y:79,width:110,height:78}],
    ['new_end',{x:480,y:100,width:36,height:36}],
  ]);

  const stacked = stackGraphBelow(sample,nextGraph,new Map([
    ['start',{x:100,y:150,width:36,height:36}],
    ['task',{x:290,y:129,width:110,height:78}],
    ['decision',{x:480,y:143,width:50,height:50}],
    ['save',{x:670,y:129,width:110,height:78}],
    ['end',{x:860,y:150,width:36,height:36}],
  ]),nextBounds,260);

  assert.equal(stacked.graph.nodes.length,sample.nodes.length+nextGraph.nodes.length);
  assert.deepEqual(stacked.graph.edges.slice(0,sample.edges.length),sample.edges);
  assert.ok(stacked.graph.nodes.some(node=>node.id==='description_1_new_task'));
  assert.ok(stacked.graph.edges.some(edge=>edge.from==='description_1_new_start'&&edge.to==='description_1_new_task'));
  assert.ok(stacked.graph.edges.every(edge=>!edge.from.startsWith('description_1_')||edge.to.startsWith('description_1_')));
  assert.ok(stacked.graph.edges.every(edge=>!edge.to.startsWith('description_1_')||edge.from.startsWith('description_1_')));
  assert.ok(stacked.layoutOverrides.get('description_1_new_start').y>=420);
  assert.ok(stacked.layoutOverrides.get('description_1_new_task').y>=399);
  assert.ok(stacked.layoutOverrides.get('start').y===150);
});
