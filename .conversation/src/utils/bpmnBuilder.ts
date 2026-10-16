/**
 * Сборка BPMN 2.0 XML из плоского JSON-графа.
 *
 * Модель отдаёт только логику процесса (узлы и связи), а геометрию —
 * координаты, размеры, waypoints — считает этот модуль. Поэтому в bpmn-js
 * попадает заведомо валидная DI-разметка, и слабые модели её не ломают.
 */

export type BpmnNodeType = 'start' | 'userTask' | 'serviceTask' | 'gateway' | 'end'

export interface BpmnGraphNode {
  id: string
  type: BpmnNodeType
  name?: string
}

export interface BpmnGraphEdge {
  from: string
  to: string
  /** Подпись ветки на шлюзе: «Да», «Нет» и т. п. */
  condition?: string
}

export interface BpmnGraph {
  nodes: BpmnGraphNode[]
  edges: BpmnGraphEdge[]
}

/** Размеры фигур в нотации bpmn-js */
const NODE_SIZES: Record<BpmnNodeType, { width: number; height: number }> = {
  start: { width: 36, height: 36 },
  userTask: { width: 100, height: 80 },
  serviceTask: { width: 100, height: 80 },
  gateway: { width: 50, height: 50 },
  end: { width: 36, height: 36 },
}

const ELEMENT_TAGS: Record<BpmnNodeType, string> = {
  start: 'bpmn:startEvent',
  userTask: 'bpmn:userTask',
  serviceTask: 'bpmn:serviceTask',
  gateway: 'bpmn:exclusiveGateway',
  end: 'bpmn:endEvent',
}

const DEFAULT_NAMES: Record<BpmnNodeType, string> = {
  start: 'Начало',
  userTask: 'Действие пользователя',
  serviceTask: 'Системное действие',
  gateway: 'Условие',
  end: 'Конец',
}

const ALLOWED_TYPES: readonly string[] = [
  'start',
  'userTask',
  'serviceTask',
  'gateway',
  'end',
  'task', // Legacy type for small models
]

/** Раскладка: главная линия идёт слева направо, ветки уходят на строку ниже */
const START_X = 160
const FIRST_ROW_CENTER_Y = 140
const STEP_X = 180
const ROW_STEP_Y = 120

/** Отрицательная ветка шлюза — та, которую уводим вниз */
const NEGATIVE_CONDITION = /^(нет|no|false|отказ|отклон|ошибк|сбой|не\s)/i

/** Положительная ветка: по ней понимаем, что остальные ветки шлюза отрицательные */
const AFFIRMATIVE_CONDITION = /^(да|yes|true|успешн|одобр|корректн|соглас)/i

/** Негативный финал процесса — Error End Event с иконкой молнии */
const ERROR_END_NAME = /(ошибк|отказ|отклон|сбой|неуспеш|прерван|отменён|отменен)/i

const AFFIRMATIVE_LABEL = 'Да'
const NEGATIVE_LABEL = 'Нет'

/** Отступ «коридора» — горизонтальной части маршрута — от нижних граней фигур */
const CORRIDOR_GAP = 24

/**
 * Внешняя подпись шлюза: держим её над ромбом, потому что вниз из ромба
 * уходит отрицательная ветка и текст лёг бы прямо на линию.
 */
const GATEWAY_LABEL_WIDTH = 180
const GATEWAY_LABEL_HEIGHT = 36
const GATEWAY_LABEL_GAP = 8

/** Позиция узла в абсолютных координатах: x — левый край, y — вертикальный центр */
type Placement = { x: number; y: number }
type Point = { x: number; y: number }

/** Строка раскладки, приведённая к вертикальному центру её элементов */
function rowCenterY(row: number): number {
  return FIRST_ROW_CENTER_Y + row * ROW_STEP_Y
}

function isNegative(condition?: string): boolean {
  return condition ? NEGATIVE_CONDITION.test(condition.trim()) : false
}

/** Негативный финал процесса: завершается ошибкой или отказом */
function isErrorEnd(node: BpmnGraphNode): boolean {
  return node.type === 'end' && ERROR_END_NAME.test(node.name?.trim() ?? '')
}

/**
 * Достраивает подписи веток шлюзов: модель обязана подписать каждую
 * исходящую связь, но малые модели это правило игнорируют, и стрелка
 * из ромба остаётся пустой. Ветка к негативному финалу получает «Нет»,
 * первая оставшаяся безымянная — «Да», все последующие — «Нет».
 */
function normalizeGatewayConditions(graph: BpmnGraph): BpmnGraph {
  const nodeById = new Map(graph.nodes.map((node) => [node.id, node]))
  const outgoing = new Map<string, BpmnGraphEdge[]>()

  graph.edges.forEach((edge) => {
    if (nodeById.get(edge.from)?.type !== 'gateway') return
    outgoing.set(edge.from, [...(outgoing.get(edge.from) ?? []), edge])
  })

  const labels = new Map<BpmnGraphEdge, string>()

  outgoing.forEach((edges) => {
    // Если модель уже подписала ветку «Да», остальные безымянные — отрицательные
    let affirmativeTaken = edges.some((edge) =>
      AFFIRMATIVE_CONDITION.test(edge.condition?.trim() ?? ''),
    )

    edges.forEach((edge) => {
      if (edge.condition?.trim()) return

      const target = nodeById.get(edge.to)
      // Ветка к негативному финалу не может быть главной
      if (!affirmativeTaken && target && isErrorEnd(target)) {
        labels.set(edge, NEGATIVE_LABEL)
        return
      }
      if (!affirmativeTaken) {
        affirmativeTaken = true
        labels.set(edge, AFFIRMATIVE_LABEL)
        return
      }
      labels.set(edge, NEGATIVE_LABEL)
    })
  })

  if (labels.size === 0) return graph

  return {
    ...graph,
    edges: graph.edges.map((edge) => {
      const condition = labels.get(edge)
      return condition ? { ...edge, condition } : edge
    }),
  }
}

/**
 * Раскладка узлов: линейная цепочка с шагом STEP_X по горизонтали.
 * Если у узла несколько исходящих связей, главная (не отрицательная)
 * продолжает линию, а остальные ветки уходят на ROW_STEP_Y ниже.
 */
function layoutNodes(graph: BpmnGraph): Map<string, Placement> {
  const outgoing = new Map<string, BpmnGraphEdge[]>()
  graph.nodes.forEach((node) => outgoing.set(node.id, []))
  graph.edges.forEach((edge) => outgoing.get(edge.from)?.push(edge))

  const placements = new Map<string, Placement>()

  // Рекурсия с защитой от повторного размещения: циклы в графе не зациклят раскладку
  const place = (id: string, x: number, row: number): void => {
    if (placements.has(id)) return
    placements.set(id, { x, y: rowCenterY(row) })

    const edges = outgoing.get(id) ?? []
    if (edges.length === 1) {
      place(edges[0].to, x + STEP_X, row)
      return
    }
    if (edges.length < 2) return

    const mainEdge = edges.find((edge) => !isNegative(edge.condition)) ?? edges[0]
    place(mainEdge.to, x + STEP_X, row)

    let branchRow = row + 1
    edges.forEach((edge) => {
      if (edge === mainEdge) return
      place(edge.to, x + STEP_X, branchRow)
      branchRow += 1
    })
  }

  const start = graph.nodes.find((node) => node.type === 'start') ?? graph.nodes[0]
  place(start.id, START_X, 0)

  // Узлы, недостижимые от start: модель иногда добавляет «острова» — выносим их в хвост первой строки
  let tailX = START_X
  placements.forEach((placement) => {
    if (placement.y === rowCenterY(0)) tailX = Math.max(tailX, placement.x)
  })
  tailX += STEP_X

  graph.nodes.forEach((node) => {
    if (placements.has(node.id)) return
    placements.set(node.id, { x: tailX, y: rowCenterY(0) })
    tailX += STEP_X
  })

  return placements
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/** Проверяет форму JSON-графа и даёт понятную причину отказа */
function assertGraph(value: unknown): asserts value is BpmnGraph {
  if (typeof value !== 'object' || value === null) {
    throw new Error('ответ модели не является JSON-объектом')
  }

  const graph = value as { nodes?: unknown; edges?: unknown }
  if (!Array.isArray(graph.nodes) || graph.nodes.length === 0) {
    throw new Error('в графе отсутствует непустой список nodes')
  }
  if (!Array.isArray(graph.edges)) {
    throw new Error('в графе отсутствует список edges')
  }

  const ids = new Set<string>()
  graph.nodes.forEach((raw, index) => {
    const node = raw as Partial<BpmnGraphNode> | null
    const id = node?.id

    if (typeof id !== 'string' || !id.trim()) {
      throw new Error(`у узла №${index + 1} не задан id`)
    }
    if (ids.has(id)) {
      throw new Error(`id «${id}» встречается в графе дважды`)
    }
    if (typeof node?.type !== 'string' || !ALLOWED_TYPES.includes(node.type)) {
      throw new Error(`у узла «${id}» недопустимый type: ${String(node?.type)}`)
    }
    if (node?.name !== undefined && typeof node.name !== 'string') {
      throw new Error(`у узла «${id}» поле name не является строкой`)
    }

    ids.add(id)
  })

  graph.edges.forEach((raw, index) => {
    const edge = raw as Partial<BpmnGraphEdge> | null
    const { from, to } = edge ?? {}

    if (typeof from !== 'string' || typeof to !== 'string') {
      throw new Error(`у связи №${index + 1} не заданы поля from/to`)
    }
    if (!ids.has(from)) {
      throw new Error(`связь №${index + 1} ссылается на несуществующий узел «${from}»`)
    }
    if (!ids.has(to)) {
      throw new Error(`связь №${index + 1} ссылается на несуществующий узел «${to}»`)
    }
  })
}

/** Добавляет точку, пропуская дубли (нулевые отрезки bpmn-js не любит) */
function pushPoint(points: Point[], point: Point): void {
  const last = points[points.length - 1]
  if (last && last.x === point.x && last.y === point.y) return
  points.push(point)
}

/**
 * Ортогональный маршрут связи: только горизонтальные и вертикальные отрезки.
 *
 * 1. Вперёд на той же высоте — одна прямая линия слева направо (2 точки).
 * 2. Цель ниже — из нижней грани источника вниз и в левую грань цели (3 точки).
 *    Так же соединяются сегменты при слиянии: новый подпроцесс строится ниже.
 * 3. Всё остальное (обратные связи «повторить», прыжки на строку выше) —
 *    из нижней грани источника вниз, по коридору под фигурами и подъём в нижнюю
 *    грань цели (4 точки). Коридор лежит ниже обеих фигур, поэтому линия не режет
 *    блоки насквозь.
 */
function routeEdge(
  from: Placement,
  to: Placement,
  fromSize: { width: number; height: number },
  toSize: { width: number; height: number },
): Point[] {
  const fromCenterY = from.y
  const toCenterY = to.y
  const fromBottom = fromCenterY + fromSize.height / 2
  const toBottom = toCenterY + toSize.height / 2
  const fromCenterX = from.x + fromSize.width / 2
  const toCenterX = to.x + toSize.width / 2

  const points: Point[] = []

  // 1. Прямая связь слева направо: выходим из правой грани, входим в левую
  if (toCenterY === fromCenterY && to.x >= from.x + fromSize.width) {
    pushPoint(points, { x: from.x + fromSize.width, y: fromCenterY })
    pushPoint(points, { x: to.x, y: toCenterY })
    return points
  }

  // 2. Ветка вниз и правее: вертикально из нижней грани, затем в левую грань цели
  if (toCenterY > fromCenterY && to.x >= from.x + fromSize.width) {
    pushPoint(points, { x: fromCenterX, y: fromBottom })
    pushPoint(points, { x: fromCenterX, y: toCenterY })
    pushPoint(points, { x: to.x, y: toCenterY })
    return points
  }

  // 2b. Цель ниже и левее — стык подпроцессов: спускаемся, идём по коридору
  //     над нижней схемой и входим в верхнюю грань её первого блока
  if (toCenterY > fromCenterY) {
    const toTop = toCenterY - toSize.height / 2
    const corridorY = toTop - CORRIDOR_GAP
    pushPoint(points, { x: fromCenterX, y: fromBottom })
    pushPoint(points, { x: fromCenterX, y: corridorY })
    pushPoint(points, { x: toCenterX, y: corridorY })
    pushPoint(points, { x: toCenterX, y: toTop })
    return points
  }

  // 3. Обратный ход: подныриваем под фигуры и возвращаемся в нижнюю грань цели
  const corridorY = Math.max(fromBottom, toBottom) + CORRIDOR_GAP
  pushPoint(points, { x: fromCenterX, y: fromBottom })
  pushPoint(points, { x: fromCenterX, y: corridorY })
  pushPoint(points, { x: toCenterX, y: corridorY })
  pushPoint(points, { x: toCenterX, y: toBottom })
  return points
}

/**
 * Строит валидный BPMN 2.0 XML с полной DI-разметкой по JSON-графу процесса.
 * Бросает Error с текстом на русском, если граф структурно некорректен.
 */
export function generateBpmnXmlFromJson(value: unknown): string {
  assertGraph(value)
  const rawGraph: BpmnGraph = value

  // Нормализация типов: превращаем устаревший 'task' в 'userTask'
  const graph: BpmnGraph = normalizeGatewayConditions({
    ...rawGraph,
    nodes: rawGraph.nodes.map((node) => ({
      ...node,
      type: node.type === ('task' as any) ? 'userTask' : node.type,
    })),
  })

  return renderGraphToXml(graph, layoutNodes(graph))
}

/**
 * Собирает BPMN XML из графа и уже готовой раскладки.
 * Раскладка передаётся снаружи, чтобы слияние подпроцессов могло
 * переиспользовать координаты уже отрисованной схемы.
 */
function renderGraphToXml(graph: BpmnGraph, placements: Map<string, Placement>): string {
  const nodeTypeById = new Map(graph.nodes.map((node) => [node.id, node.type]))
  const xmlIdById = new Map(graph.nodes.map((node, index) => [node.id, `Node_${index + 1}`]))
  const flowIds = graph.edges.map((_, index) => `Flow_${index + 1}`)

  const placementOf = (id: string): Placement =>
    placements.get(id) ?? { x: START_X, y: rowCenterY(0) }
  const typeOf = (id: string): BpmnNodeType => nodeTypeById.get(id) ?? 'userTask'

  // incoming/outgoing нужны bpmn-moddle для консистентности модели потока
  const incoming = new Map<string, string[]>()
  const outgoing = new Map<string, string[]>()
  graph.edges.forEach((edge, index) => {
    outgoing.set(edge.from, [...(outgoing.get(edge.from) ?? []), flowIds[index]])
    incoming.set(edge.to, [...(incoming.get(edge.to) ?? []), flowIds[index]])
  })

  const elementLines = graph.nodes.map((node, index) => {
    const xmlId = `Node_${index + 1}`
    const tag = ELEMENT_TAGS[node.type]
    const name = escapeXml(node.name?.trim() || DEFAULT_NAMES[node.type])
    const parts = [
      ...(incoming.get(node.id) ?? []).map((id) => `      <bpmn:incoming>${id}</bpmn:incoming>`),
      ...(outgoing.get(node.id) ?? []).map((id) => `      <bpmn:outgoing>${id}</bpmn:outgoing>`),
      // Негативный финал помечаем определением ошибки — bpmn-js рисует иконку молнии
      ...(isErrorEnd(node)
        ? [`      <bpmn:errorEventDefinition id="ErrorEventDefinition_${index + 1}" />`]
        : []),
    ]

    if (parts.length === 0) return `    <${tag} id="${xmlId}" name="${name}" />`

    return [
      `    <${tag} id="${xmlId}" name="${name}">`,
      ...parts,
      `    </${tag}>`,
    ].join('\n')
  })

  const flowLines = graph.edges.map((edge, index) => {
    const condition = edge.condition?.trim()
    const nameAttr = condition ? ` name="${escapeXml(condition)}"` : ''

    return `    <bpmn:sequenceFlow id="${flowIds[index]}"${nameAttr} sourceRef="${xmlIdById.get(edge.from)}" targetRef="${xmlIdById.get(edge.to)}" />`
  })

  const shapeLines = graph.nodes.flatMap((node, index) => {
    const xmlId = `Node_${index + 1}`
    const { x, y } = placementOf(node.id)
    const { width, height } = NODE_SIZES[node.type]
    const top = y - height / 2
    const marker = node.type === 'gateway' ? ' isMarkerVisible="true"' : ''

    // Текст вопроса у шлюза — внешняя метка над ромбом:
    // внутри остаётся только крестик «X», а текст не ложится на ветки
    const label =
      node.type === 'gateway'
        ? [
            '        <bpmndi:BPMNLabel>',
            `          <dc:Bounds x="${x + (width - GATEWAY_LABEL_WIDTH) / 2}" y="${top - GATEWAY_LABEL_GAP - GATEWAY_LABEL_HEIGHT}" width="${GATEWAY_LABEL_WIDTH}" height="30" />`,
            '        </bpmndi:BPMNLabel>',
          ]
        : []

    return [
      `      <bpmndi:BPMNShape id="${xmlId}_di" bpmnElement="${xmlId}"${marker}>`,
      `        <dc:Bounds x="${x}" y="${top}" width="${width}" height="${height}" />`,
      ...label,
      '      </bpmndi:BPMNShape>',
    ]
  })

  const edgeLines = graph.edges.flatMap((edge, index) => {
    const waypoints = routeEdge(
      placementOf(edge.from),
      placementOf(edge.to),
      NODE_SIZES[typeOf(edge.from)],
      NODE_SIZES[typeOf(edge.to)],
    )

    return [
      `      <bpmndi:BPMNEdge id="${flowIds[index]}_di" bpmnElement="${flowIds[index]}">`,
      ...waypoints.map((point) => `        <di:waypoint x="${point.x}" y="${point.y}" />`),
      '      </bpmndi:BPMNEdge>',
    ]
  })

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL"',
    '                  xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI"',
    '                  xmlns:dc="http://www.omg.org/spec/DD/20100524/DC"',
    '                  xmlns:di="http://www.omg.org/spec/DD/20100524/DI"',
    '                  id="Definitions_1"',
    '                  targetNamespace="http://bpmn.io/schema/bpmn">',
    '  <bpmn:process id="Process_1" isExecutable="false">',
    ...elementLines,
    ...flowLines,
    '  </bpmn:process>',
    '  <bpmndi:BPMNDiagram id="BPMNDiagram_1">',
    '    <bpmndi:BPMNPlane id="BPMNPlane_1" bpmnElement="Process_1">',
    ...shapeLines,
    ...edgeLines,
    '    </bpmndi:BPMNPlane>',
    '  </bpmndi:BPMNDiagram>',
    '</bpmn:definitions>',
  ].join('\n')
}

/**
 * Обратный маппинг: локальное имя тега → тип узла графа.
 * Промежуточные события отправки (их используют моковые схемы) считаем
 * системными действиями — для ТЗ это «отправка уведомления».
 */
const TYPE_BY_TAG: Record<string, BpmnNodeType> = {
  startEvent: 'start',
  endEvent: 'end',
  task: 'userTask',
  userTask: 'userTask',
  serviceTask: 'serviceTask',
  sendTask: 'serviceTask',
  intermediateThrowEvent: 'serviceTask',
  intermediateCatchEvent: 'userTask',
  exclusiveGateway: 'gateway',
}

/** Префиксы id для обратного разбора XML в граф */
const ID_PREFIX: Record<BpmnNodeType, string> = {
  start: 'start',
  userTask: 'user_task',
  serviceTask: 'service_task',
  gateway: 'gateway',
  end: 'end',
}

/**
 * Разбирает BPMN XML обратно в плоский JSON-граф вместе с координатами фигур.
 * Координаты нужны слиянию: новый подпроцесс достраивается под уже
 * отрисованной схемой, поэтому её раскладку нельзя считать заново.
 */
function extractDiagramFromXml(xml: string): {
  graph: BpmnGraph
  placements: Map<string, Placement>
} {
  const doc = new DOMParser().parseFromString(xml, 'application/xml')
  if (doc.getElementsByTagName('parsererror').length > 0) {
    throw new Error('XML диаграммы повреждён и не может быть разобран')
  }

  const counters = new Map<BpmnNodeType, number>()
  const idByXmlId = new Map<string, string>()
  const nodes: BpmnGraphNode[] = []

  Array.from(doc.getElementsByTagName('*')).forEach((element) => {
    const type = TYPE_BY_TAG[element.localName]
    const xmlId = element.getAttribute('id')
    if (!type || !xmlId) return

    const index = (counters.get(type) ?? 0) + 1
    counters.set(type, index)
    const id = `${ID_PREFIX[type]}_${index}`

    idByXmlId.set(xmlId, id)
    nodes.push({ id, type, name: element.getAttribute('name') ?? '' })
  })

  const edges: BpmnGraphEdge[] = []

  Array.from(doc.getElementsByTagName('*')).forEach((element) => {
    if (element.localName !== 'sequenceFlow') return

    const from = idByXmlId.get(element.getAttribute('sourceRef') ?? '')
    const to = idByXmlId.get(element.getAttribute('targetRef') ?? '')
    if (!from || !to) return

    edges.push({ from, to, condition: element.getAttribute('name') ?? undefined })
  })

  // Координаты фигур: левый край и вертикальный центр
  const placements = new Map<string, Placement>()
  Array.from(doc.getElementsByTagName('*')).forEach((element) => {
    if (element.localName !== 'BPMNShape') return

    const nodeId = idByXmlId.get(element.getAttribute('bpmnElement') ?? '')
    if (!nodeId) return

    const bounds = Array.from(element.children).find((child) => child.localName === 'Bounds')
    if (!bounds) return

    const x = Number(bounds.getAttribute('x'))
    const y = Number(bounds.getAttribute('y'))
    const height = Number(bounds.getAttribute('height'))
    if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(height)) return

    placements.set(nodeId, { x, y: y + height / 2 })
  })

  return { graph: { nodes, edges }, placements }
}

/**
 * Разбирает BPMN XML обратно в плоский JSON-граф — нужен, чтобы отправить
 * текущую (в том числе моковую) схему на генерацию ТЗ.
 */
export function extractGraphFromXml(xml: string): BpmnGraph {
  return extractDiagramFromXml(xml).graph
}

/** Вертикальный зазор между подпроцессами при слиянии */
const MERGE_GAP = 100

/** Переименовывает узлы и связи графа, чтобы id не пересекались после слияния */
function remapIds(
  graph: BpmnGraph,
  prefix: string,
): { graph: BpmnGraph; ids: Map<string, string> } {
  const ids = new Map<string, string>()
  const nodes = graph.nodes.map((node, index) => {
    const id = `${prefix}_${index + 1}`
    ids.set(node.id, id)
    return { ...node, id }
  })
  const edges = graph.edges.map((edge) => ({
    ...edge,
    from: ids.get(edge.from) ?? edge.from,
    to: ids.get(edge.to) ?? edge.to,
  }))

  return { graph: { nodes, edges }, ids }
}

/**
 * Достраивает новый подпроцесс под уже отрисованной схемой.
 *
 * Финал верхней схемы перестаёт быть End Event и становится промежуточным
 * шагом, от которого стрелка уходит к первому действию нового подпроцесса.
 * Координаты верхней схемы сохраняются, а блоки нижней смещаются вниз по Y.
 */
export function mergeBpmnXml(baseXml: string, incomingXml: string): string {
  const base = extractDiagramFromXml(baseXml)
  const incoming = extractDiagramFromXml(incomingXml)

  const baseRemap = remapIds(base.graph, 'base')
  const incomingRemap = remapIds(incoming.graph, 'next')

  const typeById = new Map<string, BpmnNodeType>()
  baseRemap.graph.nodes.forEach((node) => typeById.set(node.id, node.type))
  incomingRemap.graph.nodes.forEach((node) => typeById.set(node.id, node.type))

  const hasOutgoing = new Set(baseRemap.graph.edges.map((edge) => edge.from))

  // Настоящие финалы верхней схемы становятся промежуточными шагами
  // (негативные Error End Event остаются финалом своей ветки)
  const stems: string[] = []
  const baseNodes = baseRemap.graph.nodes.map((node) => {
    if (node.type !== 'end') return node
    if (hasOutgoing.has(node.id) || isErrorEnd(node)) return node

    stems.push(node.id)
    return { ...node, type: 'userTask' as BpmnNodeType }
  })

  // Вход нового подпроцесса — его Start Event; сам старт не нужен,
  // стрелка идёт прямо к первому действию подпроцесса
  const startNode = incomingRemap.graph.nodes.find((node) => node.type === 'start')
  const startTargets = startNode
    ? incomingRemap.graph.edges.filter((edge) => edge.from === startNode.id).map((edge) => edge.to)
    : []

  const dropStart = startNode !== undefined && startTargets.length === 1
  const entryId = dropStart ? startTargets[0] : startNode?.id
  const incomingNodes = dropStart
    ? incomingRemap.graph.nodes.filter((node) => node.id !== startNode?.id)
    : incomingRemap.graph.nodes
  const incomingEdges = dropStart
    ? incomingRemap.graph.edges.filter((edge) => edge.from !== startNode?.id)
    : incomingRemap.graph.edges

  const link: BpmnGraphEdge[] =
    stems.length > 0 && entryId ? [{ from: stems[0], to: entryId }] : []

  const mergedGraph: BpmnGraph = {
    nodes: [...baseNodes, ...incomingNodes],
    edges: [...baseRemap.graph.edges, ...link, ...incomingEdges],
  }

  const placements = new Map<string, Placement>()
  baseRemap.ids.forEach((newId, oldId) => {
    const placement = base.placements.get(oldId)
    if (placement) placements.set(newId, placement)
  })

  // Смещаем блоки нового подпроцесса вниз под нижнюю грань верхней схемы
  const bottomOf = (placement: Placement, id: string): number =>
    placement.y + (NODE_SIZES[typeById.get(id) ?? 'userTask'].height / 2)
  const topOf = (placement: Placement, id: string): number =>
    placement.y - (NODE_SIZES[typeById.get(id) ?? 'userTask'].height / 2)

  let baseBottom = -Infinity
  baseRemap.ids.forEach((newId, oldId) => {
    const placement = base.placements.get(oldId)
    if (placement) baseBottom = Math.max(baseBottom, bottomOf(placement, newId))
  })

  let incomingTop = Infinity
  incomingRemap.ids.forEach((newId, oldId) => {
    const placement = incoming.placements.get(oldId)
    if (placement) incomingTop = Math.min(incomingTop, topOf(placement, newId))
  })

  const shiftY =
    Number.isFinite(baseBottom) && Number.isFinite(incomingTop)
      ? baseBottom + MERGE_GAP - incomingTop
      : 0

  incomingRemap.ids.forEach((newId, oldId) => {
    const placement = incoming.placements.get(oldId)
    if (placement) placements.set(newId, { x: placement.x, y: placement.y + shiftY })
  })

  return renderGraphToXml(normalizeGatewayConditions(mergedGraph), placements)
}
