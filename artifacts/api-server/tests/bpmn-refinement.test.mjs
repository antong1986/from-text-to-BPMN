import test from 'node:test';
import assert from 'node:assert/strict';
import { getRefinementIssue } from '../src/lib/bpmn-refinement.ts';

const base = {
  nodes: [
    {id:'start',type:'start',name:'Начало'},
    {id:'check',type:'gateway',name:'Товар есть?'},
    {id:'cancel',type:'end',name:'Заказ отменён'},
  ],
  edges: [
    {from:'start',to:'check'},
    {from:'check',to:'cancel',condition:'Нет'},
  ],
};

test('accepts an additive clarification while retaining existing nodes', () => {
  const updated = {
    nodes: [...base.nodes,{id:'stock-return',type:'serviceTask',name:'Вернуть товар на склад'}],
    edges: [
      {from:'start',to:'check'},
      {from:'check',to:'stock-return',condition:'Нет'},
      {from:'stock-return',to:'cancel'},
    ],
  };
  assert.equal(getRefinementIssue(base,updated),null);
});

test('rejects a refinement that drops an existing branch node', () => {
  assert.equal(getRefinementIssue(base,{
    nodes:base.nodes.slice(0,2),
    edges:[{from:'start',to:'check'}],
  }),'removed-node');
});

test('rejects a refinement that removes an existing branch path', () => {
  assert.equal(getRefinementIssue(base,{
    nodes:base.nodes,
    edges:[{from:'start',to:'check'}],
  }),'removed-flow');
});

test('rejects a model response that leaves the graph unchanged', () => {
  assert.equal(getRefinementIssue(base,structuredClone(base)),'unchanged');
});

test('rejects dangling edges from a refinement response', () => {
  assert.equal(getRefinementIssue(base,{
    nodes:base.nodes,
    edges:[...base.edges,{from:'check',to:'missing'}],
  }),'invalid-graph');
});
