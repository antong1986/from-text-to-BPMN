import type { BpmnGraph } from '@workspace/api-client-react';

export const MINIMAL_BPMN_XML = `<?xml version="1.0" encoding="UTF-8"?><bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI" xmlns:dc="http://www.omg.org/spec/DD/20100524/DC" xmlns:di="http://www.omg.org/spec/DD/20100524/DI" id="Definitions_1" targetNamespace="http://bpmn.io/schema/bpmn"><bpmn:process id="Process_1" isExecutable="false"/><bpmndi:BPMNDiagram id="BPMNDiagram_1"><bpmndi:BPMNPlane id="BPMNPlane_1" bpmnElement="Process_1"/></bpmndi:BPMNDiagram></bpmn:definitions>`;
export const MOCK_REJECTION_GRAPH: BpmnGraph = {
  nodes: [
    {id:'start',type:'start',name:'Поступила заявка'},
    {id:'review',type:'userTask',name:'Проверить заявку'},
    {id:'valid',type:'gateway',name:'Данные корректны?'},
    {id:'approve',type:'serviceTask',name:'Зарегистрировать заявку'},
    {id:'success',type:'end',name:'Заявка принята'},
    {id:'reject',type:'end',name:'Отказ клиенту'},
  ],
  edges: [
    {from:'start',to:'review'},{from:'review',to:'valid'},
    {from:'valid',to:'approve',condition:'Да'},{from:'valid',to:'reject',condition:'Нет'},
    {from:'approve',to:'success'},
  ],
};
export const MOCK_ORDER_GRAPH: BpmnGraph = {
  nodes: [
    {id:'start',type:'start',name:'Заказ получен'},
    {id:'check',type:'serviceTask',name:'Проверить наличие'},
    {id:'stock',type:'gateway',name:'Товар в наличии?'},
    {id:'notify',type:'serviceTask',name:'Сообщить клиенту'},
    {id:'pack',type:'userTask',name:'Собрать заказ'},
    {id:'finish',type:'end',name:'Заказ передан'},
    {id:'cancel',type:'end',name:'Отмена заказа'},
  ],
  edges: [
    {from:'start',to:'check'},{from:'check',to:'stock'},
    {from:'stock',to:'pack',condition:'Да'},{from:'stock',to:'notify',condition:'Нет'},
    {from:'pack',to:'finish'},{from:'notify',to:'cancel'},
  ],
};
