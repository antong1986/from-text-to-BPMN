import test from "node:test";
import assert from "node:assert/strict";
import { isCompleteBpmnXml, stripXmlMarkdownFences } from "../src/lib/bpmn-xml.ts";

const validXml = `<bpmn:definitions
  xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL"
  xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI"
  xmlns:dc="http://www.omg.org/spec/DD/20100524/DC"
  xmlns:di="http://www.omg.org/spec/DD/20100524/DI"
  id="Definitions_1" targetNamespace="http://bpmn.io/schema/bpmn">
  <bpmn:process id="Process_1" isExecutable="false">
    <bpmn:startEvent id="Start_1" name="Start" />
    <bpmn:task id="Task_1" name="Review request" />
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

test("strips optional XML markdown fences", () => {
  assert.equal(stripXmlMarkdownFences(`\`\`\`xml\n${validXml}\n\`\`\``), validXml);
});

test("accepts a BPMN document with valid nodes, references, shapes, and edges", async () => {
  assert.equal(await isCompleteBpmnXml(validXml), true);
});

test("rejects BPMN XML with an unresolved flow or missing diagram bounds", async () => {
  const unresolved = validXml.replace('targetRef="End_1"', 'targetRef="Missing_1"');
  assert.equal(await isCompleteBpmnXml(unresolved), false);
  assert.equal(await isCompleteBpmnXml(validXml.replace('<bpmndi:BPMNShape id="Task_1_di" bpmnElement="Task_1"><dc:Bounds x="180" y="80" width="110" height="78" /></bpmndi:BPMNShape>', "")), false);
});
