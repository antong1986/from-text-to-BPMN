import { useEffect, useRef, useState } from 'react';
import { FileText, ChevronDown, X } from 'lucide-react';
import { useGenerateSpec } from '@workspace/api-client-react';
import { extractGraphFromXml } from '../utils/bpmnBuilder';
import { buildDocxFromMarkdown } from '../utils/exportDocx';
import { downloadFile } from '../utils/downloadFile';

const SPEC_ERROR_MESSAGE = 'Достигнут лимит запросов. Описание сохранено — повторите запрос позже.';

export default function SpecExportButton({xml,disabled}:{xml:string;disabled:boolean}) {
  const [open,setOpen]=useState(false),[error,setError]=useState('');
  const ref=useRef<HTMLDivElement>(null);
  const specMutation=useGenerateSpec();
  useEffect(()=>{setError('');},[xml]);
  useEffect(()=>{
    if(!open)return;
    const outside=(e:MouseEvent)=>{if(!ref.current?.contains(e.target as Node))setOpen(false);};
    const escape=(e:KeyboardEvent)=>{if(e.key==='Escape')setOpen(false);};
    document.addEventListener('mousedown',outside);document.addEventListener('keydown',escape);
    return()=>{document.removeEventListener('mousedown',outside);document.removeEventListener('keydown',escape);};
  },[open]);
  const download=async(format:'md'|'docx')=>{
    setOpen(false);setError('');
    try{
      const graph=extractGraphFromXml(xml);
      const response=await specMutation.mutateAsync({data:{graph}});
      if(!response.spec)throw new Error('Сервер вернул пустое техническое задание.');
      if(format==='md')downloadFile(response.spec,'text/markdown;charset=UTF-8','tech-spec.md');
      else {
        const docx = buildDocxFromMarkdown(response.spec);
        const docxBuffer = new ArrayBuffer(docx.byteLength);
        new Uint8Array(docxBuffer).set(docx);
        downloadFile(docxBuffer,'application/vnd.openxmlformats-officedocument.wordprocessingml.document','tech-spec.docx');
      }
    }catch{setError(SPEC_ERROR_MESSAGE);}
  };
  return <div ref={ref} style={{position:'relative'}}>
    <span style={{display:'inline-flex'}} title={disabled?'Ответьте на вопрос ИИ-валидатора, чтобы подтвердить логику процесса':undefined}>
    <button type="button" className="secondary-btn" style={disabled?{pointerEvents:'none'}:undefined} disabled={disabled||specMutation.isPending} onClick={()=>setOpen(v=>!v)} aria-expanded={open} data-testid="button-generate-spec">
      {specMutation.isPending?<><span className="spin"/>Аналитик пишет ТЗ…</>:<>Сгенерировать ТЗ <ChevronDown size={13}/></>}
    </button>
    </span>
    {open&&!disabled&&<div className="spec-menu" role="menu" data-testid="menu-spec-export">
      <button type="button" role="menuitem" onClick={()=>void download('md')} data-testid="button-spec-markdown"><FileText size={13}/> Скачать в формате Markdown (.md)</button>
      <button type="button" role="menuitem" onClick={()=>void download('docx')} data-testid="button-spec-docx"><FileText size={13}/> Скачать в формате Word (.docx)</button>
    </div>}
    {error&&<div className="spec-error" role="alert" data-testid="status-spec-error">
      <button type="button" className="spec-error-close" onClick={()=>setError('')} aria-label="Закрыть сообщение об ошибке" title="Закрыть" data-testid="button-close-spec-error"><X size={16} aria-hidden="true"/></button>
      <strong>Ошибка генерации ТЗ</strong><br/>{SPEC_ERROR_MESSAGE}
    </div>}
  </div>;
}
