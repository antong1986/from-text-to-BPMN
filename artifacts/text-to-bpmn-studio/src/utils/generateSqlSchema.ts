export function generateSqlSchema(xml: string): string {
  const doc = new DOMParser().parseFromString(xml,'application/xml');
  if (doc.getElementsByTagName('parsererror').length) return '-- Не удалось разобрать BPMN-схему';
  const els = Array.from(doc.getElementsByTagName('*'));
  const taskCount = els.filter(el => /task$/i.test(el.localName)).length;
  const flowCount = els.filter(el => el.localName === 'sequenceFlow').length;
  const notification = els.some(el => /уведомл/i.test(el.getAttribute('name') ?? ''));
  const errorBranch = els.some(el => el.localName === 'endEvent' && /ошибк|отклон|отказ/i.test(el.getAttribute('name') ?? ''));
  const blocks = [`-- DDL сформирован по текущей BPMN-диаграмме\n-- Задач: ${taskCount} | Потоков: ${flowCount}\n\nCREATE TABLE IF NOT EXISTS process_instance (\n  id BIGSERIAL PRIMARY KEY,\n  process_key VARCHAR(64) NOT NULL,\n  business_key VARCHAR(128),\n  status VARCHAR(16) NOT NULL DEFAULT 'RUNNING',\n  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),\n  finished_at TIMESTAMPTZ,\n  CONSTRAINT process_status_check CHECK (status IN ('RUNNING','COMPLETED','FAILED','REJECTED'))\n);\n\nCREATE TABLE IF NOT EXISTS task_instance (\n  id BIGSERIAL PRIMARY KEY,\n  process_id BIGINT NOT NULL REFERENCES process_instance(id) ON DELETE CASCADE,\n  task_key VARCHAR(64) NOT NULL,\n  task_name VARCHAR(255) NOT NULL,\n  assignee VARCHAR(128),\n  status VARCHAR(16) NOT NULL DEFAULT 'PENDING',\n  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),\n  completed_at TIMESTAMPTZ\n);`];
  if (notification) blocks.push(`CREATE TABLE IF NOT EXISTS client_notification (\n  id BIGSERIAL PRIMARY KEY,\n  process_id BIGINT NOT NULL REFERENCES process_instance(id) ON DELETE CASCADE,\n  channel VARCHAR(32) NOT NULL DEFAULT 'EMAIL',\n  recipient VARCHAR(255) NOT NULL,\n  subject VARCHAR(255), body TEXT,\n  sent_at TIMESTAMPTZ NOT NULL DEFAULT now()\n);`);
  if (errorBranch) blocks.push(`CREATE TABLE IF NOT EXISTS process_error (\n  id BIGSERIAL PRIMARY KEY,\n  process_id BIGINT NOT NULL REFERENCES process_instance(id) ON DELETE CASCADE,\n  reason VARCHAR(255), occurred_at TIMESTAMPTZ NOT NULL DEFAULT now()\n);`);
  return blocks.join('\n\n')+'\n';
}
