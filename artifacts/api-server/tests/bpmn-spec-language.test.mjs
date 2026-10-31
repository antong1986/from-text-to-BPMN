import test from "node:test";
import assert from "node:assert/strict";
import { buildBpmnSpecLanguageInstruction } from "../src/lib/text-to-bpmn-prompts.ts";

test("requires the full specification to be written in English", () => {
  const instruction = buildBpmnSpecLanguageInstruction("en");
  assert.match(instruction, /ENGLISH ONLY/);
  assert.match(instruction, /section headings/);
  assert.match(instruction, /Do not include Russian text/);
});

test("requires the full specification to be written in Russian", () => {
  const instruction = buildBpmnSpecLanguageInstruction("ru");
  assert.match(instruction, /ТОЛЬКО РУССКИЙ/);
  assert.match(instruction, /заголовки/);
  assert.match(instruction, /Не используй английский текст/);
});
