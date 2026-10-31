import test from "node:test";
import assert from "node:assert/strict";
import {
  buildBpmnCorrectionPrompt,
  cleanAssistantXml,
  isCompleteBpmnXml,
  validateBpmnXml,
} from "../src/lib/bpmn-xml.ts";

const validXml = `<bpmn:definitions
  xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL"
  xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI"
  xmlns:dc="http://www.omg.org/spec/DD/20100524/DC"
  xmlns:di="http://www.omg.org/spec/DD/20100524/DI"
  id="Definitions_1" targetNamespace="http://bpmn.io/schema/bpmn">
  <bpmn:process id="Process_1" isExecutable="false">
    <bpmn:startEvent id="Start_1" name="Start" />
    <bpmn:userTask id="Task_1" name="Review request" />
    <bpmn:endEvent id="End_1" name="Done" />
    <bpmn:sequenceFlow id="Flow_1" sourceRef="Start_1" targetRef="Task_1" />
    <bpmn:sequenceFlow id="Flow_2" sourceRef="Task_1" targetRef="End_1" />
  </bpmn:process>
  <bpmndi:BPMNDiagram id="Diagram_1">
    <bpmndi:BPMNPlane id="Plane_1" bpmnElement="Process_1">
      <bpmndi:BPMNShape id="Start_1_di" bpmnElement="Start_1"><dc:Bounds x="100" y="100" width="36" height="36" /></bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="Task_1_di" bpmnElement="Task_1"><dc:Bounds x="180" y="80" width="110" height="78" /></bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="End_1_di" bpmnElement="End_1"><dc:Bounds x="340" y="100" width="36" height="36" /></bpmndi:BPMNShape>
      <bpmndi:BPMNEdge id="Flow_1_di" bpmnElement="Flow_1"><di:waypoint x="136" y="118" /><di:waypoint x="180" y="118" /></bpmndi:BPMNEdge>
      <bpmndi:BPMNEdge id="Flow_2_di" bpmnElement="Flow_2"><di:waypoint x="290" y="118" /><di:waypoint x="340" y="118" /></bpmndi:BPMNEdge>
    </bpmndi:BPMNPlane>
  </bpmndi:BPMNDiagram>
</bpmn:definitions>`;

test("cleans markdown fences, introductory text, and trailing commentary", () => {
  assert.equal(
    cleanAssistantXml(`Вот ваш XML:\n\`\`\`xml\n${validXml}\n\`\`\`\nГотово.`),
    validXml,
  );
});

test("accepts a BPMN document with valid nodes, references, shapes, and edges", async () => {
  assert.equal(await isCompleteBpmnXml(validXml), true);
  assert.deepEqual(await validateBpmnXml(validXml), { valid: true, reason: null });
});

test("accepts user and service tasks but rejects generic task types", async () => {
  const serviceTask = validXml.replace("<bpmn:userTask ", "<bpmn:serviceTask ").replace(
    "</bpmn:userTask>",
    "</bpmn:serviceTask>",
  );
  assert.equal((await validateBpmnXml(serviceTask)).valid, true);

  const genericTask = validXml.replace("<bpmn:userTask ", "<bpmn:task ").replace(
    "</bpmn:userTask>",
    "</bpmn:task>",
  );
  const result = await validateBpmnXml(genericTask);
  assert.equal(result.valid, false);
  assert.match(result.reason, /допустимы только bpmn:UserTask и bpmn:ServiceTask/);

  const manualTask = validXml.replace("<bpmn:userTask ", "<bpmn:manualTask ").replace(
    "</bpmn:userTask>",
    "</bpmn:manualTask>",
  );
  assert.equal((await validateBpmnXml(manualTask)).valid, false);
});

test("reports unresolved flow references and missing shapes", async () => {
  const unresolved = validXml.replace('targetRef="End_1"', 'targetRef="Missing_1"');
  assert.equal(await isCompleteBpmnXml(unresolved), false);
  assert.match((await validateBpmnXml(unresolved)).reason, /sourceRef или targetRef/);

  const missingShape = validXml.replace(
    '<bpmndi:BPMNShape id="Task_1_di" bpmnElement="Task_1"><dc:Bounds x="180" y="80" width="110" height="78" /></bpmndi:BPMNShape>',
    "",
  );
  assert.equal(await isCompleteBpmnXml(missingShape), false);
  assert.match((await validateBpmnXml(missingShape)).reason, /BPMNShape/);
});

test("reports missing definitions, BPMNDiagram, and XML syntax errors", async () => {
  assert.match((await validateBpmnXml("Текст без XML")).reason, /Отсутствует корневой тег/);

  const missingDiagram = validXml.replace(
    /<bpmndi:BPMNDiagram[\s\S]*?<\/bpmndi:BPMNDiagram>/,
    "",
  );
  assert.match((await validateBpmnXml(missingDiagram)).reason, /Не найден блок BPMNDiagram/);

  const malformed = validXml.replace("</bpmn:process>", "</bpmn:wrong>");
  assert.match((await validateBpmnXml(malformed)).reason, /Ошибка парсинга синтаксиса XML/);
});

test("builds the one-shot self-correction prompt with the exact failure and first XML", () => {
  const prompt = buildBpmnCorrectionPrompt("Оформить заявку.", "<broken-xml>", "Не найден блок BPMNDiagram.");
  assert.match(prompt, /Твой предыдущий XML-код не прошел валидацию из-за ошибки: Не найден блок BPMNDiagram\./);
  assert.match(prompt, /ИСКЛЮЧИТЕЛЬНО чистый, валидный BPMN 2\.0 XML код без лишних слов/);
  assert.match(prompt, /Оформить заявку\./);
  assert.match(prompt, /<broken-xml>/);
});
