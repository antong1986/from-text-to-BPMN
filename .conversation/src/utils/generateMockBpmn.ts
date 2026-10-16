import { MOCK_BPMN_REJECTION_XML, MOCK_BPMN_XML } from '../constants/mockBpmn'

/** Корни слов, по которым мок-генератор добавляет ветку с ошибкой/отклонением */
const REJECTION_MARKERS = ['ошибк', 'отклон']

/**
 * Заглушка вместо обращения к LLM: по ключевым словам выбирает одну из
 * двух захардкоженных схем. Позже будет заменена реальным вызовом API.
 */
export function generateMockBpmn(description: string): string {
  const normalized = description.toLowerCase()
  const hasRejectionBranch = REJECTION_MARKERS.some((marker) =>
    normalized.includes(marker),
  )

  return hasRejectionBranch ? MOCK_BPMN_REJECTION_XML : MOCK_BPMN_XML
}
