import { useEffect, useRef, useState } from 'react';
import { FileText, ChevronDown, X } from 'lucide-react';
import { useGenerateSpec } from '@workspace/api-client-react';
import { extractGraphFromXml } from '../utils/bpmnBuilder';
import { buildDocxFromMarkdown } from '../utils/exportDocx';
import { downloadFile } from '../utils/downloadFile';

import { getUiText, type Language } from '../i18n';

export default function SpecExportButton({xml,disabled,hasDiagram,language}:{xml:string;disabled:boolean;hasDiagram:boolean;language:Language}) {
  const copy=getUiText(language);
  const [open,setOpen]=useState(false),[error,setError]=useState(false);
  const ref=useRef<HTMLDivElement>(null);
  const specMutation=useGenerateSpec();
  useEffect(()=>{setError(false);},[xml]);
  useEffect(()=>{
    if(!open)return;
    const outside=(e:MouseEvent)=>{if(!ref.current?.contains(e.target as Node))setOpen(false);};
    const escape=(e:KeyboardEvent)=>{if(e.key==='Escape')setOpen(false);};
    document.addEventListener('mousedown',outside);document.addEventListener('keydown',escape);
    return()=>{document.removeEventListener('mousedown',outside);document.removeEventListener('keydown',escape);};
  },[open]);
  const download=async(format:'md'|'docx')=>{
    setOpen(false);setError(false);
    try{
      const graph=extractGraphFromXml(xml);
      const response=await specMutation.mutateAsync({data:{graph}});
      if(!response.spec)throw new Error('Server returned an empty specification.');
      if(format==='md')downloadFile(response.spec,'text/markdown;charset=UTF-8','tech-spec.md');
      else {
        const docx = buildDocxFromMarkdown(response.spec);
        const docxBuffer = new ArrayBuffer(docx.byteLength);
        new Uint8Array(docxBuffer).set(docx);
        downloadFile(docxBuffer,'application/vnd.openxmlformats-officedocument.wordprocessingml.document','tech-spec.docx');
      }
    }catch{setError(true);}
  };
  return <div ref={ref} style={{position:'relative'}}>
    <span style={{display:'inline-flex'}} title={disabled&&hasDiagram?copy.specTooltip:undefined}>
    <button type="button" className="secondary-btn" style={disabled?{pointerEvents:'none'}:undefined} disabled={disabled||specMutation.isPending} onClick={()=>setOpen(v=>!v)} aria-expanded={open} data-testid="button-generate-spec">
      {specMutation.isPending?<><span className="spin"/>{copy.specGenerating}</>:<>{copy.specGenerate} <ChevronDown size={13}/></>}
    </button>
    </span>
    {open&&!disabled&&<div className="spec-menu" role="menu" data-testid="menu-spec-export">
      <button type="button" role="menuitem" onClick={()=>void download('md')} data-testid="button-spec-markdown"><FileText size={13}/> {copy.specDownloadMarkdown}</button>
      <button type="button" role="menuitem" onClick={()=>void download('docx')} data-testid="button-spec-docx"><FileText size={13}/> {copy.specDownloadWord}</button>
    </div>}
    {error&&<div className="spec-error" role="alert" data-testid="status-spec-error">
      <button type="button" className="spec-error-close" onClick={()=>setError(false)} aria-label={copy.closeError} title={copy.close} data-testid="button-close-spec-error"><X size={16} aria-hidden="true"/></button>
      <strong>{copy.specErrorTitle}</strong><br/>{copy.specErrorMessage}
    </div>}
  </div>;
}
