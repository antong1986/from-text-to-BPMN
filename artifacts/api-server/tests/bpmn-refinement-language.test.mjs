import test from "node:test";
import assert from "node:assert/strict";
import { buildBpmnRefinementMessageLanguageInstruction } from "../src/lib/text-to-bpmn-prompts.ts";

test("refinement validator messages are instructed to match the source description language", () => {
  assert.match(buildBpmnRefinementMessageLanguageInstruction("ru"), /ТОЛЬКО РУССКИЙ/);
  assert.match(buildBpmnRefinementMessageLanguageInstruction("en"), /ENGLISH ONLY/);
});
