import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { extractAndFilterText } from '../src/lib/document-preparser.ts';

const minimalDocx = await readFile(new URL('./fixtures/minimal-process.docx', import.meta.url));

test('keeps short TXT content and removes metadata, page labels, and blank-line noise', async () => {
  const input = '\uFEFFАвтор: Иван\nСтраница 1\n\nБизнес-процесс:\r\nКлиент создаёт заказ.\n\n\nСистема сохраняет его.';
  const result = await extractAndFilterText(Buffer.from(input), '.TXT');
  assert.equal(result, 'Бизнес-процесс:\nКлиент создаёт заказ.\n\nСистема сохраняет его.');
});

test('extracts paragraph and table text from DOCX', async () => {
  const result = await extractAndFilterText(minimalDocx, 'docx');
  assert.match(result, /Клиент оформляет заказ\./);
  assert.match(result, /Шаг из таблицы/);
});

test('long documents prioritize context around process markers', async () => {
  const noise = 'Справочная информация и общие положения, не относящиеся к описанию процесса. '.repeat(10);
  const lines = Array.from({length:90}, (_, index) => `Раздел ${index}: ${noise}`);
  lines.splice(45, 0, 'Бизнес-процесс', 'Проверить товар на складе.', 'Вернуть отсутствующий товар на склад.');
  const result = await extractAndFilterText(Buffer.from(lines.join('\n')), 'txt');
  assert.match(result, /Бизнес-процесс/);
  assert.match(result, /Вернуть отсутствующий товар на склад/);
  assert.doesNotMatch(result, /Раздел 0:/);
});

test('rejects unsupported, unreadable, and malformed document input', async () => {
  await assert.rejects(extractAndFilterText(Buffer.from('text'), 'pdf'), /Only .docx and .txt/);
  await assert.rejects(extractAndFilterText(Buffer.from(' \n \n '), 'txt'), /does not contain readable text/);
  await assert.rejects(extractAndFilterText(Buffer.from('not a zip'), 'docx'), /valid DOCX archive/);
});
