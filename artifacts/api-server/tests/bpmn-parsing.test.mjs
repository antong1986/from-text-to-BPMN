import test from 'node:test';
import assert from 'node:assert/strict';
import { GenerateBpmnResponse } from '../../../lib/api-zod/src/generated/api.ts';
import { parseBpmnGraph } from '../src/lib/parse-bpmn-graph.ts';

test('markdown is stripped and missing names are normalized before API validation', () => {
  const graph = {
    nodes: [{ id: 'n1', type: 'start' }, { id: 'n2', type: 'end', name: null }],
    edges: [{ from: 'n1', to: 'n2' }],
  };
  for (const input of [graph, { graph }]) {
    const parsed = parseBpmnGraph(`\`\`\`json\n${JSON.stringify(input)}\n\`\`\``);
    const output = GenerateBpmnResponse.parse({ graph: parsed });
    assert.equal(output.graph.nodes[0].name, 'n1');
    assert.equal(output.graph.nodes[1].name, 'n2');
  }
});

test('invalid response is not silently replaced with a mock diagram', () => {
  assert.throws(() => parseBpmnGraph('```json\n{"nodes":\n```'));
  assert.throws(() => parseBpmnGraph('{"error": "no graph"}'));
});
