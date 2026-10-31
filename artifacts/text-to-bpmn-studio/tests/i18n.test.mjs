import test from "node:test";
import assert from "node:assert/strict";
import { getInitialLanguage, getUiText, localizeKnownError, translateBpmnUi } from "../src/i18n.ts";

test("English is the default locale and both interface dictionaries are available", () => {
  assert.equal(getInitialLanguage(), "en");
  assert.equal(getUiText("en").generateDiagram, "Generate diagram");
  assert.equal(getUiText("ru").generateDiagram, "Сгенерировать диаграмму");
  assert.equal(getUiText("en").chatEmptyFirstLine, "Questions and suggestions about");
  assert.equal(getUiText("en").chatEmptySecondLine, "the generated diagram will appear here");
});

test("BPMN editor tooltips switch languages in both directions", () => {
  assert.equal(translateBpmnUi("Create task", "ru"), "Создать задачу");
  assert.equal(translateBpmnUi("Создать задачу", "en"), "Create task");
});

test("known server errors are localized for the selected interface", () => {
  assert.equal(
    localizeKnownError("Для генерации войдите через Google.", "en"),
    "Sign in with Google to generate a diagram.",
  );
  assert.equal(
    localizeKnownError("Gemini returned an empty response.", "ru"),
    "Gemini вернул пустой ответ.",
  );
  assert.match(
    localizeKnownError(
      "Модель не вернула корректный BPMN XML даже после автоматического исправления. Причина: В BPMN найдены русские подписи, хотя исходное описание написано на английском.",
      "en",
    ),
    /Russian BPMN labels were found/,
  );
});

