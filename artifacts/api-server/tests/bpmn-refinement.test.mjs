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

test('accepts parallel branches only when every branch meets at one balanced parallel join', () => {
  const original = {
    nodes:[{id:'start',type:'start',name:'Start'},{id:'end',type:'end',name:'End'}],
    edges:[{from:'start',to:'end'}],
  };
  const balanced = {
    nodes:[
      {id:'start',type:'start',name:'Start'},
      {id:'split',type:'gateway',gatewayType:'parallel',name:'Parallel split'},
      {id:'a',type:'serviceTask',name:'A'},
      {id:'b',type:'userTask',name:'B'},
      {id:'join',type:'gateway',gatewayType:'parallel',name:'Parallel join'},
      {id:'end',type:'end',name:'End'},
    ],
    edges:[
      {from:'start',to:'split'},
      {from:'split',to:'a'},
      {from:'split',to:'b'},
      {from:'a',to:'join'},
      {from:'b',to:'join'},
      {from:'join',to:'end'},
    ],
  };
  assert.equal(getRefinementIssue(original,balanced),null);
  assert.equal(getRefinementIssue(balanced,structuredClone(balanced)),'unchanged');

  const unbalanced = {...balanced,edges:balanced.edges.filter(edge=>!(edge.from==='b'&&edge.to==='join'))};
  unbalanced.edges.push({from:'b',to:'end'});
  assert.equal(getRefinementIssue(original,unbalanced),'invalid-gateway-structure');
});

test('rejects alternative flows that connect directly to one task', () => {
  const original = {
    nodes:[{id:'start',type:'start',name:'Start'},{id:'end',type:'end',name:'End'}],
    edges:[{from:'start',to:'end'}],
  };
  const graph = {
    nodes:[
      {id:'start',type:'start',name:'Start'},
      {id:'split',type:'gateway',name:'Choose'},
      {id:'a',type:'serviceTask',name:'A'},
      {id:'b',type:'serviceTask',name:'B'},
      {id:'shared',type:'userTask',name:'Shared work'},
      {id:'end',type:'end',name:'End'},
    ],
    edges:[
      {from:'start',to:'split'},
      {from:'split',to:'a',condition:'A'},
      {from:'split',to:'b',condition:'B'},
      {from:'a',to:'shared'},
      {from:'b',to:'shared'},
      {from:'shared',to:'end'},
    ],
  };
  assert.equal(getRefinementIssue(original,graph),'invalid-gateway-structure');
});
