import { extractGraphFromXml, generateBpmnXmlFromJson } from '../utils/bpmnBuilder'

/**
 * Клиент генерации BPMN. Обращается к собственному Express-прокси
 * (server/index.js), который держит ключ модели на сервере — в браузер
 * ключ не попадает, CORS-проблемы отсутствуют.
 *
 * Прокси отдаёт JSON-граф процесса, а XML и геометрию собирает
 * bpmnBuilder: модель не занимается DI-разметкой.
 */
const API_BASE = import.meta.env.VITE_API_URL || '/api'
const GENERATE_ENDPOINT = `${API_BASE}/generate`

/** Ошибка с текстом, пригодным для показа пользователю */
export class BpmnGenerationError extends Error {}

type GenerateResponse = {
  graph?: unknown
  error?: string
}

/** Проверка, что строка разбирается как XML и её корень — <bpmn:definitions> */
function isParsableBpmn(xml: string): boolean {
  const doc = new DOMParser().parseFromString(xml, 'application/xml')
  if (doc.getElementsByTagName('parsererror').length > 0) return false

  return doc.documentElement.localName === 'definitions'
}

export async function generateBpmnViaAI(userText: string): Promise<string> {
  let response: Response
  try {
    response = await fetch(GENERATE_ENDPOINT, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ description: userText }),
    })
  } catch {
    throw new BpmnGenerationError(
      'Не удалось связаться с прокси-сервером генерации. Запущен ли он (npm run server)?',
    )
  }

  let data: GenerateResponse
  try {
    data = (await response.json()) as GenerateResponse
  } catch {
    throw new BpmnGenerationError(
      `Прокси-сервер ответил некорректно (HTTP ${response.status}).`,
    )
  }

  if (!response.ok || !data.graph) {
    throw new BpmnGenerationError(
      data.error || `Прокси-сервер ответил ошибкой ${response.status}.`,
    )
  }

  let xml: string
  try {
    xml = generateBpmnXmlFromJson(data.graph)
  } catch (err) {
    throw new BpmnGenerationError(
      `Не удалось построить схему по ответу модели: ${err instanceof Error ? err.message : 'неизвестная ошибка'}`,
    )
  }

  if (!isParsableBpmn(xml)) {
    throw new BpmnGenerationError(
      'Собранная схема оказалась невалидным XML — попробуйте изменить описание.',
    )
  }

  return xml
}

const SPEC_ENDPOINT = `${API_BASE}/generate-spec`

type SpecResponse = {
  spec?: string
  error?: string
}

/**
 * Запрос технического задания по текущей диаграмме.
 * Выполняется только по кнопке: граф восстанавливается из XML и уходит на бэкенд.
 */
export async function generateSpecViaAI(xml: string): Promise<string> {
  let graph: unknown
  try {
    graph = extractGraphFromXml(xml)
  } catch (err) {
    throw new BpmnGenerationError(
      `Не удалось разобрать текущую диаграмму: ${err instanceof Error ? err.message : 'неизвестная ошибка'}`,
    )
  }

  let response: Response
  try {
    response = await fetch(SPEC_ENDPOINT, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ graph }),
    })
  } catch {
    throw new BpmnGenerationError(
      'Не удалось связаться с прокси-сервером генерации. Запущен ли он (npm run server)?',
    )
  }

  let data: SpecResponse
  try {
    data = (await response.json()) as SpecResponse
  } catch {
    throw new BpmnGenerationError(
      `Прокси-сервер ответил некорректно (HTTP ${response.status}).`,
    )
  }

  if (!response.ok || !data.spec) {
    throw new BpmnGenerationError(
      data.error || `Прокси-сервер ответил ошибкой ${response.status}.`,
    )
  }

  return data.spec
}
