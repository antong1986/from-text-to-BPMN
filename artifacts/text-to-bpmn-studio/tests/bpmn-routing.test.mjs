import test from 'node:test';
import assert from 'node:assert/strict';
import { routeFlow } from '../src/utils/bpmnRouting.ts';
import { generateBpmnXmlFromJson } from '../src/utils/bpmnBuilder.ts';

const task = { x: 100, y: 111, width: 110, height: 78 };

test('same-row forward flow connects right and left boundaries', () => {
  assert.deepEqual(routeFlow(task, { ...task, x: 290 }, 40, false), [[210, 150], [290, 150]]);
});

test('lower gateway branch exits horizontally, clears the gateway, and enters horizontally', () => {
  const gateway = { x: 290, y: 125, width: 50, height: 50 };
  const target = { x: 480, y: 246, width: 110, height: 78 };
  assert.deepEqual(routeFlow(gateway, target, 40, true),
    [[340, 150], [420, 150], [420, 285], [480, 285]]);
});

test('forward flow between different rows is orthogonal', () => {
  assert.deepEqual(routeFlow(task, { ...task, x: 290, y: 246 }, 40, false),
    [[210, 150], [250, 150], [250, 285], [290, 285]]);
});

test('deeper gateway branch keeps an 80px horizontal corridor', () => {
  assert.deepEqual(routeFlow({ x: 290, y: 125, width: 50, height: 50 },
    { x: 480, y: 381, width: 110, height: 78 }, 40, true),
    [[340, 150], [420, 150], [420, 420], [480, 420]]);
});

test('backward flows use an orthogonal top lane with horizontal ports', () => {
  for (const y of [111, 246]) {
    const source = { ...task, x: 480, y };
    assert.deepEqual(routeFlow(source, task, 40, false),
      [[590, y + 39], [630, y + 39], [630, 40], [60, 40], [60, 150], [100, 150]]);
  }
});

test('self-loop uses horizontal ports and alternating orthogonal segments', () => {
  assert.deepEqual(routeFlow(task, task, 40, false, true),
    [[210, 150], [250, 150], [250, 40], [60, 40], [60, 150], [100, 150]]);
});

test('obstacle-aware routing detours around blocks with alternating orthogonal segments', () => {
  const source = { x: 100, y: 111, width: 110, height: 78 };
  const target = { x: 500, y: 111, width: 110, height: 78 };
  const obstacle = { x: 300, y: 100, width: 100, height: 100 };
  const points = routeFlow(source, target, 40, false, false, { obstacles: [obstacle] });
  assert.ok(points.length > 2);
  for (let i = 1; i < points.length; i++) {
    const [x1, y1] = points[i - 1], [x2, y2] = points[i];
    assert.ok(x1 === x2 || y1 === y2, 'route contains a diagonal segment');
    assert.notDeepEqual(points[i - 1], points[i], 'route contains a zero-length segment');
    if (i > 1) {
      const previousWasHorizontal = points[i - 1][1] === points[i - 2][1];
      const currentIsHorizontal = y1 === y2;
      assert.notEqual(currentIsHorizontal, previousWasHorizontal, 'directions must alternate');
    }
    if (y1 === y2) {
      assert.ok(y1 < obstacle.y || y1 > obstacle.y + obstacle.height ||
        Math.max(x1, x2) < obstacle.x || Math.min(x1, x2) > obstacle.x + obstacle.width);
    } else {
      assert.ok(x1 < obstacle.x || x1 > obstacle.x + obstacle.width ||
        Math.max(y1, y2) < obstacle.y || Math.min(y1, y2) > obstacle.y + obstacle.height);
    }
  }
  assert.equal(points[1][1], points[0][1], 'route must leave its source horizontally');
  assert.equal(points.at(-1)[1], points.at(-2)[1], 'route must enter its target horizontally');
});

test('generated XML uses actual Bounds, orthogonal routes, and separated return lanes', () => {
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
    let previousOrientation = null;
    for (let j = 1; j < points.length; j++) {
      assert.ok(points[j][0] === points[j - 1][0] || points[j][1] === points[j - 1][1], 'diagonal segment');
      assert.notDeepEqual(points[j], points[j - 1]);
      const orientation = points[j][1] === points[j - 1][1] ? 'horizontal' : 'vertical';
      if (j === 1) assert.equal(orientation, 'horizontal');
      if (previousOrientation) assert.notEqual(orientation, previousOrientation);
      previousOrientation = orientation;
    }
    assert.equal(previousOrientation, 'horizontal');
    if (target.x <= source.x) {
      assert.deepEqual(points[0], [source.x + source.width, source.y + source.height / 2]);
      assert.deepEqual(points.at(-1), [target.x, target.y + target.height / 2]);
      const lane = Math.min(...points.map(point => point[1]));
      assert.ok(lane < top);
      lanes.push(lane);
    } else {
      assert.deepEqual(points.at(-1), [target.x, target.y + target.height / 2]);
    }
  });
  assert.equal(new Set(lanes).size, lanes.length);
});

test('gateway branches keep at least 80px horizontal and 120px vertical clearance', () => {
  const graph = {
    nodes: [
      { id: 's', type: 'start', name: 'Start' },
      { id: 'g', type: 'gateway', gatewayType: 'exclusive', name: 'Choose' },
      { id: 'a', type: 'userTask', name: 'Branch A' },
      { id: 'b', type: 'serviceTask', name: 'Branch B' },
      { id: 'e', type: 'end', name: 'Done' },
    ],
    edges: [
      { from: 's', to: 'g' },
      { from: 'g', to: 'a' },
      { from: 'g', to: 'b' },
      { from: 'a', to: 'e' },
      { from: 'b', to: 'e' },
    ],
  };
  const xml = generateBpmnXmlFromJson(graph);
  const bounds = [...xml.matchAll(/<dc:Bounds x="([^"]+)" y="([^"]+)" width="([^"]+)" height="([^"]+)"/g)]
    .map(m => ({ x: +m[1], y: +m[2], width: +m[3], height: +m[4] }));
  const gateway = bounds[1];
  const branches = [bounds[2], bounds[3]];
  assert.ok(branches.every(branch => branch.x - (gateway.x + gateway.width) >= 80));
  assert.ok(Math.abs(branches[0].y + branches[0].height / 2 -
    (branches[1].y + branches[1].height / 2)) >= 120);
});
