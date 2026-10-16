import { useEffect, useRef, useState } from 'react';
import BpmnModeler from 'bpmn-js/lib/Modeler';
import { Download } from 'lucide-react';
import { downloadFile } from '../utils/downloadFile';

type CanvasApi = { zoom: (value:string|number)=>void };
export default function BPMNViewer({xml}:{xml:string}) {
  const host = useRef<HTMLDivElement>(null);
  const modeler = useRef<BpmnModeler|null>(null);
  const [renderError,setRenderError] = useState('');
  const [exportError,setExportError] = useState('');
  useEffect(()=>{
    if(!host.current) return;
    const instance = new BpmnModeler({container:host.current});
    modeler.current=instance;
    return ()=>{ instance.destroy(); modeler.current=null; };
  },[]);
  useEffect(()=>{
    let disposed=false;
    const render=async()=>{
      if(!modeler.current)return;
      try { await modeler.current.importXML(xml); if(disposed)return; setRenderError(''); modeler.current.get<CanvasApi>('canvas').zoom('fit-viewport'); }
      catch(error){ if(!disposed){ console.error('Ошибка BPMN:',error);setRenderError('Не удалось отобразить диаграмму. Проверьте структуру схемы.'); } }
    };
    void render(); return ()=>{disposed=true;};
  },[xml]);
  const exportAs=async(kind:'xml'|'svg')=>{
    if(!modeler.current)return;setExportError('');
    try{
      if(kind==='xml'){const result=await modeler.current.saveXML({format:true});if(!result.xml)throw new Error();downloadFile(result.xml,'application/bpmn20-xml;charset=UTF-8','diagram.bpmn');}
      else {const result=await modeler.current.saveSVG();if(!result.svg)throw new Error();downloadFile(result.svg,'image/svg+xml;charset=UTF-8','diagram.svg');}
    }catch{setExportError(kind==='xml'?'Не удалось выгрузить BPMN. Проверьте, что диаграмма построена.':'Не удалось выгрузить SVG. Проверьте, что диаграмма построена.');}
  };
  return <div className="bpmn-stage" data-testid="bpmn-stage">
    <div ref={host} className="bjs-container" />
    {renderError&&<div className="render-alert" role="status" data-testid="status-render-error">{renderError}</div>}
    <div className="export-float">
      <button type="button" onClick={()=>void exportAs('xml')} data-testid="button-download-bpmn"><Download size={12}/> Скачать BPMN (XML)</button>
      <button type="button" onClick={()=>void exportAs('svg')} data-testid="button-download-svg"><Download size={12}/> Скачать SVG</button>
    </div>
    {exportError&&<div className="render-alert" style={{top:'auto',bottom:58}} role="status" data-testid="status-export-error">{exportError}</div>}
  </div>;
}
