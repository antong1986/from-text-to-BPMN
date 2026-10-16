const NOTIFICATION_PATTERN = /уведомл/i
const ERROR_PATTERN = /ошибк|отклон|отказ/i

type SchemaInfo = {
  processId: string
  taskCount: number
  flowCount: number
  hasNotification: boolean
  hasErrorBranch: boolean
}

/** Читает структуру процесса прямо из BPMN-XML, чтобы SQL соответствовал текущей диаграмме */
function readSchemaInfo(xml: string): SchemaInfo | null {
  const doc = new DOMParser().parseFromString(xml, 'application/xml')
  if (doc.getElementsByTagName('parsererror').length > 0) return null

  const elements = Array.from(doc.getElementsByTagName('*'))
  const nameOf = (el: Element) => el.getAttribute('name') ?? ''
  const process = elements.find((el) => el.localName === 'process')

  return {
    processId: process?.getAttribute('id') ?? 'Process_1',
    taskCount: elements.filter((el) => /task$/i.test(el.localName)).length,
    flowCount: elements.filter((el) => el.localName === 'sequenceFlow').length,
    hasNotification: elements.some((el) => NOTIFICATION_PATTERN.test(nameOf(el))),
    hasErrorBranch: elements.some(
      (el) => el.localName === 'endEvent' && ERROR_PATTERN.test(nameOf(el)),
    ),
  }
}

function buildProcessTables(): string {
  return `-- Экземпляры процесса
CREATE TABLE IF NOT EXISTS process_instance (
  id           BIGSERIAL    PRIMARY KEY,
  process_key  VARCHAR(64)  NOT NULL,
  business_key VARCHAR(128),
  status       VARCHAR(16)  NOT NULL DEFAULT 'RUNNING',
  started_at   TIMESTAMPTZ  NOT NULL DEFAULT now(),
  finished_at  TIMESTAMPTZ,
  CONSTRAINT process_instance_status_check
    CHECK (status IN ('RUNNING', 'COMPLETED', 'FAILED', 'REJECTED'))
);

-- Шаги процесса (по одной записи на каждый элемент диаграммы)
CREATE TABLE IF NOT EXISTS task_instance (
  id           BIGSERIAL    PRIMARY KEY,
  process_id   BIGINT       NOT NULL
                 REFERENCES process_instance (id) ON DELETE CASCADE,
  task_key     VARCHAR(64)  NOT NULL,
  task_name    VARCHAR(255) NOT NULL,
  assignee     VARCHAR(128),
  status       VARCHAR(16)  NOT NULL DEFAULT 'PENDING',
  created_at   TIMESTAMPTZ  NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ,
  CONSTRAINT task_instance_status_check
    CHECK (status IN ('PENDING', 'ACTIVE', 'COMPLETED', 'CANCELLED'))
);

CREATE INDEX IF NOT EXISTS idx_task_instance_process
  ON task_instance (process_id);`
}

function buildNotificationTable(): string {
  return `-- Промежуточное событие «Отправить уведомление клиенту»
CREATE TABLE IF NOT EXISTS client_notification (
  id         BIGSERIAL    PRIMARY KEY,
  process_id BIGINT       NOT NULL
               REFERENCES process_instance (id) ON DELETE CASCADE,
  channel    VARCHAR(32)  NOT NULL DEFAULT 'EMAIL',
  recipient  VARCHAR(255) NOT NULL,
  subject    VARCHAR(255),
  body       TEXT,
  sent_at    TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_client_notification_process
  ON client_notification (process_id);`
}

function buildErrorTable(): string {
  return `-- Ветка завершения «Ошибка/Отклонено»
CREATE TABLE IF NOT EXISTS process_error (
  id          BIGSERIAL    PRIMARY KEY,
  process_id  BIGINT       NOT NULL
                REFERENCES process_instance (id) ON DELETE CASCADE,
  reason      VARCHAR(255),
  occurred_at TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_process_error_process
  ON process_error (process_id);`
}

/**
 * Мок-генератор DDL: собирает SQL по структуре переданной BPMN-схемы.
 * Позже будет заменён реальным codegen на основе LLM.
 */
export function generateSqlSchema(xml: string): string {
  const info = readSchemaInfo(xml)
  if (!info) return '-- Не удалось разобрать BPMN-схему'

  const tables = [buildProcessTables()]
  if (info.hasNotification) tables.push(buildNotificationTable())
  if (info.hasErrorBranch) tables.push(buildErrorTable())

  const header = [
    '-- Схема БД сгенерирована по BPMN-диаграмме',
    `-- Процесс: ${info.processId}`,
    `-- Элементов-задач: ${info.taskCount} | Потоков: ${info.flowCount}`,
    `-- Ветка ошибки: ${info.hasErrorBranch ? 'есть' : 'нет'} | Уведомления: ${info.hasNotification ? 'есть' : 'нет'}`,
  ].join('\n')

  return `${header}\n\n${tables.join('\n\n')}\n`
}
