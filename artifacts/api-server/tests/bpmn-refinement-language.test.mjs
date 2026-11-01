import test from "node:test";
import assert from "node:assert/strict";
import {
  BPMN_REFINEMENT_SYSTEM_PROMPT,
  buildBpmnRefinementMessageLanguageInstruction,
} from "../src/lib/text-to-bpmn-prompts.ts";
import { localizeKnownError } from "../../text-to-bpmn-studio/src/i18n.ts";

test("refinement validator messages are instructed to match the source description language", () => {
  assert.match(buildBpmnRefinementMessageLanguageInstruction("ru"), /ТОЛЬКО РУССКИЙ/);
  assert.match(buildBpmnRefinementMessageLanguageInstruction("en"), /ENGLISH ONLY/);
});

test("short affirmations are treated as approval of the previous validator proposal", () => {
  assert.match(BPMN_REFINEMENT_SYSTEM_PROMPT, /сообщение валидатора как контекст/);
  assert.match(BPMN_REFINEMENT_SYSTEM_PROMPT, /считай это прямой командой выполнить именно предложенное изменение/);
  assert.match(BPMN_REFINEMENT_SYSTEM_PROMPT, /gatewayType="parallel"/);
  assert.match(BPMN_REFINEMENT_SYSTEM_PROMPT, /ровно один соответствующий сходящийся parallel gateway/);
  assert.match(BPMN_REFINEMENT_SYSTEM_PROMPT, /intermediate Event/);
});

test("gateway validation errors can be shown in the source language", () => {
  assert.match(
    localizeKnownError(
      "Уточнение нарушило баланс шлюзов BPMN или слияние альтернативных потоков. Исходная диаграмма сохранена.",
      "en",
    ),
    /gateway balance/,
  );
});
