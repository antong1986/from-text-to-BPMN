import { useEffect, useRef, useState, type MouseEvent as ReactMouseEvent } from 'react';
import BpmnModeler from 'bpmn-js/lib/Modeler';
import { Download } from 'lucide-react';
import { downloadFile } from '../utils/downloadFile';
import { taskChooserPaletteModule } from './taskChooserPalette';

type CanvasApi = { zoom: (value:string|number)=>void };
type ShapeType = 'bpmn:Task'|'bpmn:UserTask'|'bpmn:ServiceTask'|'bpmn:ExclusiveGateway'|'bpmn:ParallelGateway'|'bpmn:EventBasedGateway';
type ChooserKind = 'task'|'gateway';
type ChooserPosition = {left:number;top:number};
type ChooserEvent = {sourceEvent:Event};
type EventBusApi = {
  on: (eventName:string, callback:(event:ChooserEvent)=>void)=>void;
  off: (eventName:string, callback:(event:ChooserEvent)=>void)=>void;
};
type CreateApi = {start:(event:Event,element:unknown)=>void};
type ElementFactoryApi = {createShape:(attributes:{type:ShapeType})=>unknown};

export default function BPMNViewer({xml}:{xml:string}) {
  const host = useRef<HTMLDivElement>(null);
  const chooser = useRef<HTMLDivElement>(null);
  const chooserTrigger = useRef<HTMLElement|null>(null);
  const modeler = useRef<BpmnModeler|null>(null);
  const [chooserKind,setChooserKind] = useState<ChooserKind|null>(null);
  const [chooserPosition,setChooserPosition] = useState<ChooserPosition>({left:68,top:8});
  const [renderError,setRenderError] = useState('');
  const [exportError,setExportError] = useState('');
  useEffect(()=>{
    if(!host.current) return;
    const instance = new BpmnModeler({
      container:host.current,
      additionalModules:[taskChooserPaletteModule],
    });
    modeler.current=instance;
    const eventBus=instance.get('eventBus') as EventBusApi;
    const toggleChooser=(kind:ChooserKind)=>( {sourceEvent}:ChooserEvent )=>{
      const stage=host.current;
      if(!stage)return;
      const action=kind==='task'?'create.task':'create.exclusive-gateway';
      const target=sourceEvent.target;
      const entry=target instanceof Element
        ? target.closest<HTMLElement>(`.djs-palette [data-action="${action}"]`)
        : null;
      const trigger=entry??stage.querySelector<HTMLElement>(`.djs-palette [data-action="${action}"]`);
      if(!trigger)return;
      const stageRect=stage.getBoundingClientRect();
      const triggerRect=trigger.getBoundingClientRect();
      const left=triggerRect.right-stageRect.left+12;
      const panelHeight=300;
      const top=Math.min(
        Math.max(8,triggerRect.top-stageRect.top),
        Math.max(8,stageRect.height-panelHeight-8),
      );
      chooserTrigger.current=trigger;
      setChooserPosition({left,top});
      setChooserKind(current=>current===kind?null:kind);
    };
    const toggleTaskChooser=toggleChooser('task');
    const toggleGatewayChooser=toggleChooser('gateway');
    eventBus.on('taskChooser.toggle',toggleTaskChooser);
    eventBus.on('gatewayChooser.toggle',toggleGatewayChooser);
    return ()=>{
      eventBus.off('taskChooser.toggle',toggleTaskChooser);
      eventBus.off('gatewayChooser.toggle',toggleGatewayChooser);
      instance.destroy();
      modeler.current=null;
    };
  },[]);
  useEffect(()=>{
    if(!chooserKind)return;
    const closeOnOutsidePointer=(event:PointerEvent)=>{
      const target=event.target;
      if(!(target instanceof Node))return;
      if(chooser.current?.contains(target)||chooserTrigger.current?.contains(target))return;
      setChooserKind(null);
    };
    const closeOnEscape=(event:KeyboardEvent)=>{
      if(event.key!=='Escape')return;
      setChooserKind(null);
      chooserTrigger.current?.focus();
    };
    document.addEventListener('pointerdown',closeOnOutsidePointer);
    document.addEventListener('keydown',closeOnEscape);
    return ()=>{
      document.removeEventListener('pointerdown',closeOnOutsidePointer);
      document.removeEventListener('keydown',closeOnEscape);
    };
  },[chooserKind]);
  useEffect(()=>{
    let disposed=false;
    const render=async()=>{
      if(!modeler.current)return;
      try { await modeler.current.importXML(xml); if(disposed)return; setRenderError(''); modeler.current.get<CanvasApi>('canvas').zoom('fit-viewport'); }
      catch(error){ if(!disposed){ console.error('Ошибка BPMN:',error);setRenderError('Не удалось отобразить диаграмму. Проверьте структуру схемы.'); } }
    };
    void render(); return ()=>{disposed=true;};
  },[xml]);
  const createShape=(type:ShapeType,event:ReactMouseEvent<HTMLButtonElement>)=>{
    event.stopPropagation();
    const instance=modeler.current;
    if(!instance)return;
    const create=instance.get('create') as CreateApi;
    const elementFactory=instance.get('elementFactory') as ElementFactoryApi;
    create.start(event.nativeEvent,elementFactory.createShape({type}));
    setChooserKind(null);
  };
  const exportAs=async(kind:'xml'|'svg')=>{
    if(!modeler.current)return;setExportError('');
    try{
      if(kind==='xml'){const result=await modeler.current.saveXML({format:true});if(!result.xml)throw new Error();downloadFile(result.xml,'application/bpmn20-xml;charset=UTF-8','diagram.bpmn');}
      else {const result=await modeler.current.saveSVG();if(!result.svg)throw new Error();downloadFile(result.svg,'image/svg+xml;charset=UTF-8','diagram.svg');}
    }catch{setExportError(kind==='xml'?'Не удалось выгрузить BPMN. Проверьте, что диаграмма построена.':'Не удалось выгрузить SVG. Проверьте, что диаграмма построена.');}
  };
  return <div className="bpmn-stage" data-testid="bpmn-stage">
    <div ref={host} className="bpmn-host" />
    {chooserKind&&<div
      ref={chooser}
      className="palette-chooser"
      role="dialog"
      aria-label={chooserKind==='task'?'Task types':'Gateway types'}
      data-testid={`${chooserKind}-chooser`}
      style={{left:chooserPosition.left,top:chooserPosition.top}}
    >
      <div className="palette-chooser-head">
        <span>{chooserKind==='task'?'Tasks':'Gateways'}</span>
        <button
          type="button"
          className="palette-chooser-close"
          aria-label={`Close ${chooserKind} chooser`}
          data-testid="button-close-chooser"
          onClick={()=>setChooserKind(null)}
        >×</button>
      </div>
      {chooserKind==='task'?<>
        <button
          type="button"
          className="palette-chooser-option"
          data-testid="button-create-task"
          onClick={event=>createShape('bpmn:Task',event)}
        >
          <span className="palette-chooser-icon bpmn-icon-task" aria-hidden="true" />
          <span className="palette-chooser-copy">
            <strong>Task</strong>
            <small>A general process task</small>
          </span>
        </button>
        <button
          type="button"
          className="palette-chooser-option"
          data-testid="button-create-user-task"
          onClick={event=>createShape('bpmn:UserTask',event)}
        >
          <span className="palette-chooser-icon bpmn-icon-user-task" aria-hidden="true" />
          <span className="palette-chooser-copy">
            <strong>User task</strong>
            <small>Work performed by a person</small>
          </span>
        </button>
        <button
          type="button"
          className="palette-chooser-option"
          data-testid="button-create-service-task"
          onClick={event=>createShape('bpmn:ServiceTask',event)}
        >
          <span className="palette-chooser-icon bpmn-icon-service" aria-hidden="true" />
          <span className="palette-chooser-copy">
            <strong>Service task</strong>
            <small>Automated work performed by a service or system</small>
          </span>
        </button>
      </>:<>
        <button
          type="button"
          className="palette-chooser-option"
          data-testid="button-create-exclusive-gateway"
          onClick={event=>createShape('bpmn:ExclusiveGateway',event)}
        >
          <span className="palette-chooser-icon bpmn-icon-gateway-xor" aria-hidden="true" />
          <span className="palette-chooser-copy">
            <strong>Exclusive gateway</strong>
            <small>Routes the token down one path, based on data</small>
          </span>
        </button>
        <button
          type="button"
          className="palette-chooser-option"
          data-testid="button-create-parallel-gateway"
          onClick={event=>createShape('bpmn:ParallelGateway',event)}
        >
          <span className="palette-chooser-icon bpmn-icon-gateway-parallel" aria-hidden="true" />
          <span className="palette-chooser-copy">
            <strong>Parallel gateway</strong>
            <small>Splits the flow into parallel paths, or joins them</small>
          </span>
        </button>
        <button
          type="button"
          className="palette-chooser-option"
          data-testid="button-create-event-based-gateway"
          onClick={event=>createShape('bpmn:EventBasedGateway',event)}
        >
          <span className="palette-chooser-icon bpmn-icon-gateway-eventbased" aria-hidden="true" />
          <span className="palette-chooser-copy">
            <strong>Event-based gateway</strong>
            <small>Follows the path of whichever event occurs first</small>
          </span>
        </button>
      </>}
    </div>}
    {renderError&&<div className="render-alert" role="status" data-testid="status-render-error">{renderError}</div>}
    <div className="export-float">
      <button type="button" onClick={()=>void exportAs('xml')} data-testid="button-download-bpmn"><Download size={12}/> Скачать BPMN (XML)</button>
      <button type="button" onClick={()=>void exportAs('svg')} data-testid="button-download-svg"><Download size={12}/> Скачать SVG</button>
    </div>
    {exportError&&<div className="render-alert" style={{top:'auto',bottom:58}} role="status" data-testid="status-export-error">{exportError}</div>}
  </div>;
}
