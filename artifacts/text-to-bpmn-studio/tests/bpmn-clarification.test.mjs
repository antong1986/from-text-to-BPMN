import test from 'node:test';
import assert from 'node:assert/strict';
import { applyClarificationToGraph, generateBpmnXmlFromJson } from '../src/utils/bpmnBuilder.ts';

const branchingGraph = {
  nodes: [
    {id:'start',type:'start',name:'Начало'},
    {id:'review',type:'userTask',name:'Проверить транзакцию'},
    {id:'decision',type:'gateway',name:'Проверка успешна?'},
    {id:'receipt',type:'serviceTask',name:'Сформировать чек'},
    {id:'retry',type:'userTask',name:'Повторить проверку'},
    {id:'success',type:'end',name:'Успешно'},
    {id:'rejected',type:'end',name:'Отказ'},
  ],
  edges: [
    {from:'start',to:'review'},
    {from:'review',to:'decision'},
    {from:'decision',to:'receipt',condition:'Да'},
    {from:'decision',to:'retry',condition:'Нет'},
    {from:'retry',to:'review'},
    {from:'receipt',to:'success'},
    {from:'retry',to:'rejected'},
  ],
};

test('notification clarification extends each terminal path without replacing existing branches', () => {
  const result = applyClarificationToGraph(branchingGraph, 'Отправить уведомление клиенту');
  assert.equal(result.nodes.length, branchingGraph.nodes.length + 2);
  assert.ok(result.nodes.some(node => node.id === 'decision' && node.type === 'gateway'));
  assert.ok(result.edges.some(edge => edge.from === 'retry' && edge.to === 'review'));
  assert.ok(result.edges.some(edge => edge.from === 'decision' && edge.to === 'receipt' && edge.condition === 'Да'));
  for (const terminal of ['success', 'rejected']) {
    const notification = result.nodes.find(node => node.type === 'serviceTask' &&
      result.edges.some(incoming => incoming.to === node.id) &&
      result.edges.some(outgoing => outgoing.from === node.id && outgoing.to === terminal));
    assert.ok(notification, `terminal ${terminal} should have an inserted notification step`);
  }
  assert.doesNotThrow(() => generateBpmnXmlFromJson(result));
});

test('a clarification that does not ask for notification preserves the full diagram', () => {
  const result = applyClarificationToGraph(branchingGraph, 'Процесс завершен пользователем');
  assert.deepEqual(result, branchingGraph);
  assert.notStrictEqual(result.nodes, branchingGraph.nodes);
});

test('an explicit request not to send a notification does not add one', () => {
  const result = applyClarificationToGraph(branchingGraph, 'Не отправлять уведомление клиенту');
  assert.deepEqual(result, branchingGraph);
});
