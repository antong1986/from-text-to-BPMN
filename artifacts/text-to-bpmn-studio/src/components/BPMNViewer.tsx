import { useEffect, useRef, useState, type MouseEvent as ReactMouseEvent } from 'react';
import BpmnModeler from 'bpmn-js/lib/Modeler';
import { Download } from 'lucide-react';
import { downloadFile } from '../utils/downloadFile';
import { taskChooserPaletteModule } from './taskChooserPalette';

type CanvasApi = { zoom: (value:string|number)=>void };
type TaskType = 'bpmn:Task'|'bpmn:UserTask'|'bpmn:ServiceTask';
type TaskChooserPosition = {left:number;top:number};
type TaskChooserEvent = {sourceEvent:Event};
type EventBusApi = {
  on: (eventName:string, callback:(event:TaskChooserEvent)=>void)=>void;
  off: (eventName:string, callback:(event:TaskChooserEvent)=>void)=>void;
};
type CreateApi = {start:(event:Event,element:unknown)=>void};
type ElementFactoryApi = {createShape:(attributes:{type:TaskType})=>unknown};

export default function BPMNViewer({xml}:{xml:string}) {
  const host = useRef<HTMLDivElement>(null);
  const taskChooser = useRef<HTMLDivElement>(null);
  const taskTrigger = useRef<HTMLElement|null>(null);
  const modeler = useRef<BpmnModeler|null>(null);
  const [taskChooserOpen,setTaskChooserOpen] = useState(false);
  const [taskChooserPosition,setTaskChooserPosition] = useState<TaskChooserPosition>({left:68,top:8});
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
    const toggleTaskChooser=({sourceEvent}:TaskChooserEvent)=>{
      const stage=host.current;
      if(!stage)return;
      const target=sourceEvent.target;
      const entry=target instanceof Element
        ? target.closest<HTMLElement>('.djs-palette [data-action="create.task"]')
        : null;
      const trigger=entry??stage.querySelector<HTMLElement>('.djs-palette [data-action="create.task"]');
      if(!trigger)return;
      const stageRect=stage.getBoundingClientRect();
      const triggerRect=trigger.getBoundingClientRect();
      const left=triggerRect.right-stageRect.left+12;
      const panelHeight=280;
      const top=Math.min(
        Math.max(8,triggerRect.top-stageRect.top),
        Math.max(8,stageRect.height-panelHeight-8),
      );
      taskTrigger.current=trigger;
      setTaskChooserPosition({left,top});
      setTaskChooserOpen(open=>!open);
    };
    eventBus.on('taskChooser.toggle',toggleTaskChooser);
    return ()=>{
      eventBus.off('taskChooser.toggle',toggleTaskChooser);
      instance.destroy();
      modeler.current=null;
    };
  },[]);
  useEffect(()=>{
    if(!taskChooserOpen)return;
    const closeOnOutsidePointer=(event:PointerEvent)=>{
      const target=event.target;
      if(!(target instanceof Node))return;
      if(taskChooser.current?.contains(target)||taskTrigger.current?.contains(target))return;
      setTaskChooserOpen(false);
    };
    const closeOnEscape=(event:KeyboardEvent)=>{
      if(event.key!=='Escape')return;
      setTaskChooserOpen(false);
      taskTrigger.current?.focus();
    };
    document.addEventListener('pointerdown',closeOnOutsidePointer);
    document.addEventListener('keydown',closeOnEscape);
    return ()=>{
      document.removeEventListener('pointerdown',closeOnOutsidePointer);
      document.removeEventListener('keydown',closeOnEscape);
    };
  },[taskChooserOpen]);
  useEffect(()=>{
    let disposed=false;
    const render=async()=>{
      if(!modeler.current)return;
      try { await modeler.current.importXML(xml); if(disposed)return; setRenderError(''); modeler.current.get<CanvasApi>('canvas').zoom('fit-viewport'); }
      catch(error){ if(!disposed){ console.error('Ошибка BPMN:',error);setRenderError('Не удалось отобразить диаграмму. Проверьте структуру схемы.'); } }
    };
    void render(); return ()=>{disposed=true;};
  },[xml]);
  const createTask=(type:TaskType,event:ReactMouseEvent<HTMLButtonElement>)=>{
    event.stopPropagation();
    const instance=modeler.current;
    if(!instance)return;
    const create=instance.get('create') as CreateApi;
    const elementFactory=instance.get('elementFactory') as ElementFactoryApi;
    create.start(event.nativeEvent,elementFactory.createShape({type}));
    setTaskChooserOpen(false);
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
    {taskChooserOpen&&<div
      ref={taskChooser}
      className="task-chooser"
      role="dialog"
      aria-label="Выбор типа задачи"
      data-testid="task-chooser"
      style={{left:taskChooserPosition.left,top:taskChooserPosition.top}}
    >
      <div className="task-chooser-head">
        <span>Тип задачи</span>
        <button
          type="button"
          className="task-chooser-close"
          aria-label="Закрыть выбор типа задачи"
          data-testid="button-close-task-chooser"
          onClick={()=>setTaskChooserOpen(false)}
        >×</button>
      </div>
      <button
        type="button"
        className="task-chooser-option"
        data-testid="button-create-task"
        onClick={event=>createTask('bpmn:Task',event)}
      >
        <span className="task-chooser-icon bpmn-icon-task" aria-hidden="true" />
        <span className="task-chooser-copy">
          <strong>Task</strong>
          <small>Обычная задача процесса</small>
        </span>
      </button>
      <button
        type="button"
        className="task-chooser-option"
        data-testid="button-create-user-task"
        onClick={event=>createTask('bpmn:UserTask',event)}
      >
        <span className="task-chooser-icon bpmn-icon-user-task" aria-hidden="true" />
        <span className="task-chooser-copy">
          <strong>User task</strong>
          <small>Работа, которую выполняет человек</small>
        </span>
      </button>
      <button
        type="button"
        className="task-chooser-option"
        data-testid="button-create-service-task"
        onClick={event=>createTask('bpmn:ServiceTask',event)}
      >
        <span className="task-chooser-icon bpmn-icon-service" aria-hidden="true" />
        <span className="task-chooser-copy">
          <strong>Service task</strong>
          <small>Автоматическая работа сервиса или системы</small>
        </span>
      </button>
    </div>}
    {renderError&&<div className="render-alert" role="status" data-testid="status-render-error">{renderError}</div>}
    <div className="export-float">
      <button type="button" onClick={()=>void exportAs('xml')} data-testid="button-download-bpmn"><Download size={12}/> Скачать BPMN (XML)</button>
      <button type="button" onClick={()=>void exportAs('svg')} data-testid="button-download-svg"><Download size={12}/> Скачать SVG</button>
    </div>
    {exportError&&<div className="render-alert" style={{top:'auto',bottom:58}} role="status" data-testid="status-export-error">{exportError}</div>}
  </div>;
}
