declare module "bpmn-moddle" {
  export interface ModdleElement {
    $type?: string;
    id?: string;
    sourceRef?: ModdleElement;
    targetRef?: ModdleElement;
    bpmnElement?: ModdleElement;
    rootElements?: ModdleElement[];
    diagrams?: ModdleElement[];
    plane?: ModdleElement;
    planeElement?: ModdleElement[];
    flowElements?: ModdleElement[];
  }

  export class BpmnModdle {
    fromXML(xml: string): Promise<{
      rootElement: ModdleElement;
      warnings: Array<{ message?: string }>;
    }>;
  }
}
