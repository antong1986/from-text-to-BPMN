import test from 'node:test';
import assert from 'node:assert/strict';
import { routeFlow } from '../src/utils/bpmnRouting.ts';
import { generateBpmnXmlFromJson } from '../src/utils/bpmnBuilder.ts';

const task = { x: 100, y: 111, width: 110, height: 78 };

test('same-row forward flow connects right and left boundaries', () => {
  assert.deepEqual(routeFlow(task, { ...task, x: 290 }, 40, false), [[210, 150], [290, 150]]);
});

test('lower gateway branch drops 110px before horizontal entry', () => {
  const gateway = { x: 290, y: 125, width: 50, height: 50 };
  const target = { x: 480, y: 246, width: 110, height: 78 };
  assert.deepEqual(routeFlow(gateway, target, 40, true), [[315, 175], [315, 285], [480, 285]]);
});

test('forward flow between different rows is orthogonal', () => {
  assert.deepEqual(routeFlow(task, { ...task, x: 290, y: 246 }, 40, false),
    [[210, 150], [250, 150], [250, 285], [290, 285]]);
});

test('deeper gateway branch retains its 110px initial drop', () => {
  assert.deepEqual(routeFlow({ x: 290, y: 125, width: 50, height: 50 },
    { x: 480, y: 381, width: 110, height: 78 }, 40, true),
    [[315, 175], [315, 285], [410, 285], [410, 420], [480, 420]]);
});

test('backward same-row and cross-row flows always use top boundaries', () => {
  for (const y of [111, 246]) {
    const source = { ...task, x: 480, y };
    assert.deepEqual(routeFlow(source, task, 40, false),
      [[535, y], [535, 40], [155, 40], [155, 111]]);
  }
});

test('self-loop has five orthogonal waypoints', () => {
  assert.deepEqual(routeFlow(task, task, 40, false, true),
    [[155, 111], [155, 40], [250, 40], [250, 150], [210, 150]]);
});

test('generated XML uses actual Bounds for ports and separate nonnegative return lanes', () => {
  const graph = {
    nodes: [
      { id: 's', type: 'start', name: 'Начало' },
      { id: 'a', type: 'userTask', name: 'Уточнение' },
      { id: 'g', type: 'gateway', name: 'Речь распознана?' },
      { id: 'b', type: 'serviceTask', name: 'Запись в БД' },
      { id: 'e', type: 'end', name: 'Конец' },
      { id: 'r', type: 'userTask', name: 'Повторить' },
    ],
    edges: [
      { from: 's', to: 'a' }, { from: 'a', to: 'g' },
      { from: 'g', to: 'b', condition: 'Да' }, { from: 'b', to: 'e' },
      { from: 'g', to: 'r', condition: 'Нет' },
      { from: 'r', to: 'a' }, { from: 'b', to: 'a' },
      ...Array.from({ length: 5 }, () => ({ from: 'g', to: 'a' })),
    ],
  };
  const xml = generateBpmnXmlFromJson(graph);
  const bounds = [...xml.matchAll(/<dc:Bounds x="([^"]+)" y="([^"]+)" width="([^"]+)" height="([^"]+)"/g)]
    .map(m => ({ x: +m[1], y: +m[2], width: +m[3], height: +m[4] }));
  const routes = [...xml.matchAll(/<bpmndi:BPMNEdge[^>]+>(.*?)<\/bpmndi:BPMNEdge>/g)]
    .map(m => [...m[1].matchAll(/<di:waypoint x="([^"]+)" y="([^"]+)"/g)].map(p => [+p[1], +p[2]]));
  const top = Math.min(...bounds.map(b => b.y));
  const lanes = [];
  graph.edges.forEach((edge, i) => {
    const source = bounds[graph.nodes.findIndex(n => n.id === edge.from)];
    const target = bounds[graph.nodes.findIndex(n => n.id === edge.to)];
    const points = routes[i];
    assert.ok(points.every(p => p.every(Number.isFinite) && p[1] >= 0));
    for (let j = 1; j < points.length; j++) {
      assert.ok(points[j][0] === points[j - 1][0] || points[j][1] === points[j - 1][1], 'diagonal segment');
      assert.notDeepEqual(points[j], points[j - 1]);
    }
    if (target.x <= source.x) {
      assert.deepEqual(points[0], [source.x + source.width / 2, source.y]);
      assert.deepEqual(points.at(-1), [target.x + target.width / 2, target.y]);
      assert.ok(points[1][1] < top);
      lanes.push(points[1][1]);
    } else {
      assert.deepEqual(points.at(-1), [target.x, target.y + target.height / 2]);
    }
  });
  assert.equal(new Set(lanes).size, lanes.length);
  assert.equal(routes[4][1][1] - routes[4][0][1], 110);
});
