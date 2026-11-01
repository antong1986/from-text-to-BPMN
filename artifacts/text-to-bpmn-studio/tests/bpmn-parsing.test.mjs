import test from 'node:test';
import assert from 'node:assert/strict';
import { parseGeneratedGraph } from '../src/utils/parseGeneratedGraph.ts';
import { generateBpmnXmlFromJson } from '../src/utils/bpmnBuilder.ts';

const pizza = {
  nodes: [
    { id: 'start', type: 'start' },
    { id: 'ask', type: 'userTask', name: '' },
    { id: 'check', type: 'gateway', name: null },
    { id: 'save', type: 'serviceTask', name: 'Сохранить заказ в БД' },
    { id: 'end', type: 'end' },
  ],
  edges: [
    { from: 'start', to: 'ask' }, { from: 'ask', to: 'check' },
    { from: 'check', to: 'save', condition: 'Да' },
    { from: 'check', to: 'ask', condition: 'Повторить' },
    { from: 'save', to: 'end' },
  ],
};

for (const [name, input] of [
  ['plain object', pizza],
  ['envelope', { graph: pizza }],
  ['fenced JSON', `\`\`\`json\n${JSON.stringify(pizza)}\n\`\`\``],
  ['fenced graph inside envelope', { graph: `\`\`\`JSON\n${JSON.stringify(pizza)}\n\`\`\`` }],
  ['fenced envelope', `\`\`\`\n${JSON.stringify({ graph: pizza })}\n\`\`\``],
]) {
  test(`pizza: ${name}, missing/empty/null names render without errors`, () => {
    const graph = parseGeneratedGraph(input);
    assert.deepEqual(graph.nodes.map(n => n.name), ['start', 'ask', 'check', 'Сохранить заказ в БД', 'end']);
    assert.doesNotThrow(() => generateBpmnXmlFromJson(graph));
  });
}

test('real malformed JSON, types and dangling links remain explicit errors', () => {
  assert.throws(() => parseGeneratedGraph('```json\n{"nodes":\n```'));
  assert.throws(() => parseGeneratedGraph({ nodes: [{ id: 'a', type: 'invalid' }], edges: [] }));
  assert.throws(() => parseGeneratedGraph({ ...pizza, edges: [{ from: 'start', to: 'missing' }] }));
});

test('parallel gateway subtype survives parsing and XML generation', () => {
  const graph = parseGeneratedGraph({
    nodes: [
      {id:'start',type:'start',name:'Начало'},
      {id:'split',type:'gateway',gatewayType:'parallel',name:'Разделить поток'},
      {id:'left',type:'userTask',name:'Левая ветка'},
      {id:'right',type:'serviceTask',name:'Правая ветка'},
      {id:'join',type:'gateway',gatewayType:'parallel',name:'Объединить поток'},
      {id:'end',type:'end',name:'Завершение'},
    ],
    edges: [
      {from:'start',to:'split'},
      {from:'split',to:'left'},
      {from:'split',to:'right'},
      {from:'left',to:'join'},
      {from:'right',to:'join'},
      {from:'join',to:'end'},
    ],
  });
  assert.equal(graph.nodes.find(node=>node.id==='split').gatewayType,'parallel');
  const xml=generateBpmnXmlFromJson(graph);
  assert.equal((xml.match(/<bpmn:parallelGateway/g)??[]).length,2);
  assert.equal((xml.match(/<bpmn:exclusiveGateway/g)??[]).length,0);
});
