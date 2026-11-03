import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, ChevronDown, Crown, Network, Paperclip, Send, Undo2, X } from 'lucide-react';
import { useRefineBpmn, useUploadDocument, type BpmnGraph } from '@workspace/api-client-react';
import BPMNViewer from './components/BPMNViewer';
import SpecExportButton from './components/SpecExportButton';
import AdminPanel from './components/AdminPanel';
import {
  appendGraphBelowXml,
  extractBpmnXmlModel,
  generateBpmnXmlFromJson,
  mergeRefinementGraphs,
  mergeRefinementXml,
} from './utils/bpmnBuilder';
import { MINIMAL_BPMN_XML } from './utils/mockBpmn';
import { generateSqlSchema } from './utils/generateSqlSchema';
import { parseGeneratedGraph } from './utils/parseGeneratedGraph';
import { detectSourceLanguage, getInitialLanguage, getUiText, localizeKnownError, type Language } from './i18n';

type ChatMessage={sender:'ai'|'user';text:string;canRollback?:boolean};
type DiagramSnapshot={
  graph:BpmnGraph;
  xml:string;
  chatMessages:ChatMessage[];
  isValidated:boolean;
  isScenarioFinished:boolean;
  sqlSchema:string|null;
};
type AuthStatus={
  authenticated:boolean;
  user?:{
    email:string;
    hasActivePremium:boolean;
    freeGenerationsLeft?:number;
    isWhitelisted:boolean;
  };
};
type PaymentProvider='aaio'|'lemonsqueezy';
type LemonSqueezyWindow=Window&{
  LemonSqueezy?:{
    Setup?:(options:{eventHandler:(event:unknown)=>void})=>void;
    Url?:{
      Open?:(url:string)=>void;
      Close?:()=>void;
    };
  };
};

function getErrorText(error: unknown): string | null {
  if (error && typeof error === 'object' && 'data' in error) {
    const data = (error as {data?:unknown}).data;
    if (data && typeof data === 'object' && 'error' in data &&
      typeof data.error === 'string' && data.error.trim()) return data.error;
  }
  if (error instanceof Error && error.message.trim()) return error.message;
  return null;
}

function refinementErrorMessage(error: unknown, language: Language): string {
  const message = getErrorText(error);
  return message
    ? localizeKnownError(message, language)
    : getUiText(language).refinementErrorFallback;
}

const DESCRIPTION_DRAFT_KEY = 'text-to-bpmn-description-draft';

function getApiUrl(path: string): string {
  const apiBaseUrl = import.meta.env.VITE_API_URL?.trim().replace(/\/+$/, "");
  if (!apiBaseUrl) return path;
  return `${apiBaseUrl}${path.startsWith("/") ? path : `/${path}`}`;
}

function isAllowedPaymentUrl(value: unknown, provider: PaymentProvider): value is string {
  if (typeof value !== 'string') return false;
  try {
    const url=new URL(value);
    const domains=provider==='aaio'?['aaio.so','aaio.io']:['lemonsqueezy.com'];
    return url.protocol==='https:'&&domains.some(domain=>url.hostname===domain||url.hostname.endsWith(`.${domain}`));
  }catch{
    return false;
  }
}

function readDescriptionDraft(): string {
  try {
    return typeof window === 'undefined'
      ? ''
      : window.sessionStorage.getItem(DESCRIPTION_DRAFT_KEY) ?? '';
  } catch {
    return '';
  }
}

function saveDescriptionDraft(value: string): void {
  try {
    if (typeof window === 'undefined') return;
    if (value) window.sessionStorage.setItem(DESCRIPTION_DRAFT_KEY, value);
    else window.sessionStorage.removeItem(DESCRIPTION_DRAFT_KEY);
  } catch {
    // Storage can be unavailable in private or restricted browsing contexts.
  }
}

function getGoogleLoginHref(): string {
  const apiBaseUrl = import.meta.env.VITE_API_URL?.trim().replace(/\/+$/, "");
  if (!apiBaseUrl) return "/api/auth/google?next=%2F";

  const loginUrl = new URL("/api/auth/google", apiBaseUrl);
  loginUrl.searchParams.set("next", `${window.location.origin}/`);
  return loginUrl.toString();
}

function StudioApp(){
  const [language,setLanguage]=useState<Language>(getInitialLanguage);
  const copy=getUiText(language);
  const [userInput,setUserInput]=useState(readDescriptionDraft);
  const [currentXml,setCurrentXml]=useState(MINIMAL_BPMN_XML);
  const [diagramImportVersion,setDiagramImportVersion]=useState(0);
  const [graph,setGraph]=useState<BpmnGraph>({nodes:[],edges:[]});
  const [hasGenerated,setHasGenerated]=useState(false);
  const [chatMessages,setChatMessages]=useState<ChatMessage[]>([]);
  const [chatInput,setChatInput]=useState('');
  const [isValidated,setIsValidated]=useState(false);
  const [sqlSchema,setSqlSchema]=useState<string|null>(null);
  const [isCopied,setIsCopied]=useState(false);
  const [aiError,setAiError]=useState('');
  const [isScenarioFinished,setIsScenarioFinished]=useState(false);
  const [isReplyPending,setIsReplyPending]=useState(false);
  const [isDocumentUploading,setIsDocumentUploading]=useState(false);
  const [isGenerating,setIsGenerating]=useState(false);
  const [authStatus,setAuthStatus]=useState<AuthStatus|null>(null);
  const [isPaymentMenuOpen,setIsPaymentMenuOpen]=useState(false);
  const [isPaymentPending,setIsPaymentPending]=useState(false);
  const [isLemonCheckoutOpen,setIsLemonCheckoutOpen]=useState(false);
  const [paymentFailed,setPaymentFailed]=useState(false);
  const [rollbackSnapshot,setRollbackSnapshot]=useState<DiagramSnapshot|null>(null);
  const [asideWidth,setAsideWidth]=useState(410);
  const [isResizing,setIsResizing]=useState(false);
  const replyRequestId=useRef(0);
  const uploadRequestId=useRef(0);
  const currentXmlRef=useRef(MINIMAL_BPMN_XML);
  const flushDiagramXml=useRef<(()=>Promise<string>)|null>(null);
  const documentInput=useRef<HTMLInputElement>(null);
  const messageEnd=useRef<HTMLDivElement>(null);
  const paymentMenuRef=useRef<HTMLDivElement>(null);
  const refine=useRefineBpmn();
  const uploadDocument=useUploadDocument();
  const busy=isGenerating;
  const hasAiMessage=chatMessages.some(m=>m.sender==='ai');
  const hasTextToClear=Boolean(userInput||chatInput||chatMessages.length||aiError);
  const replaceDiagramXml=(xml:string)=>{
    currentXmlRef.current=xml;
    setCurrentXml(xml);
    setDiagramImportVersion(version=>version+1);
  };
  const handleModelerXmlChange=(xml:string)=>{
    currentXmlRef.current=xml;
    setCurrentXml(xml);
    try { setGraph(extractBpmnXmlModel(xml).graph); }
    catch(error) { console.error('Не удалось синхронизировать граф с холстом:',error); }
  };
  const registerDiagramXmlFlush=(flush:(()=>Promise<string>)|null)=>{
    flushDiagramXml.current=flush;
  };

  const refreshAuth=useCallback(async()=>{
    try{
      const response=await fetch(getApiUrl('/api/auth/me'),{credentials:'include',cache:'no-store'});
      const status=await response.json() as AuthStatus;
      setAuthStatus(response.ok?status:{authenticated:false});
    }catch{
      setAuthStatus({authenticated:false});
    }
  },[]);
  const handleLogout=async()=>{
    try{await fetch(getApiUrl('/api/auth/logout'),{method:'POST',credentials:'include'});}
    finally{await refreshAuth();}
  };
  const handlePaymentCheckout=async(provider:PaymentProvider)=>{
    if(authStatus?.authenticated!==true||!authStatus.user||isPaymentPending)return;
    setIsPaymentPending(true);setPaymentFailed(false);
    try{
      const response=await fetch(getApiUrl('/api/payment/create'),{
        method:'POST',
        credentials:'include',
        headers:{'Content-Type':'application/json','Accept':'application/json'},
        body:JSON.stringify({provider}),
      });
      const payload=await response.json().catch(()=>null) as {url?:unknown}|null;
      if(response.status===401)await refreshAuth();
      if(!response.ok||!isAllowedPaymentUrl(payload?.url,provider))throw new Error('Payment checkout failed');
      if(provider==='lemonsqueezy'){
        const lemonSqueezy=(window as LemonSqueezyWindow).LemonSqueezy;
        if(lemonSqueezy?.Url?.Open){
          try{
            lemonSqueezy.Setup?.({
              eventHandler:(event)=>{
                if(event==='close')setIsLemonCheckoutOpen(false);
              },
            });
            lemonSqueezy.Url.Open(payload.url);
            setIsLemonCheckoutOpen(true);
            setIsPaymentMenuOpen(false);
            return;
          }catch{
            window.location.href=payload.url;
            return;
          }
        }
        window.location.href=payload.url;
        return;
      }
      window.location.assign(payload.url);
    }catch{
      setPaymentFailed(true);
    }finally{
      setIsPaymentPending(false);
    }
  };
  const closeLemonCheckout=()=>{
    try{
      (window as LemonSqueezyWindow).LemonSqueezy?.Url?.Close?.();
      setIsLemonCheckoutOpen(false);
    }catch{
      // Keep the return control visible if the overlay API could not close the checkout.
    }
  };

  useEffect(()=>{messageEnd.current?.scrollIntoView({behavior:'smooth'});},[chatMessages]);
  useEffect(()=>{void refreshAuth();},[refreshAuth]);
  useEffect(()=>{
    if(!isPaymentMenuOpen)return;
    const onPointerDown=(event:PointerEvent)=>{
      if(event.target instanceof Node&&!paymentMenuRef.current?.contains(event.target))setIsPaymentMenuOpen(false);
    };
    const onKeyDown=(event:KeyboardEvent)=>{
      if(event.key==='Escape'){
        setIsPaymentMenuOpen(false);
        paymentMenuRef.current?.querySelector<HTMLButtonElement>('[data-testid="button-premium-payment"]')?.focus();
      }
    };
    document.addEventListener('pointerdown',onPointerDown);
    document.addEventListener('keydown',onKeyDown);
    return()=>{
      document.removeEventListener('pointerdown',onPointerDown);
      document.removeEventListener('keydown',onKeyDown);
    };
  },[isPaymentMenuOpen]);
  useEffect(()=>{
    if(authStatus?.authenticated!==true){
      setIsPaymentMenuOpen(false);
      setPaymentFailed(false);
    }
  },[authStatus?.authenticated]);
  useEffect(()=>{saveDescriptionDraft(userInput);},[userInput]);
  useEffect(()=>{
    document.documentElement.lang=language;
    document.title=copy.pageTitle;
    document.querySelector('meta[name="description"]')?.setAttribute('content',copy.pageDescription);
    document.querySelector('meta[property="og:description"]')?.setAttribute('content',copy.pageDescription);
    document.querySelector('meta[name="twitter:description"]')?.setAttribute('content',copy.pageDescription);
    try{window.localStorage.setItem('text-to-bpmn-language',language);}catch{/* Storage may be unavailable. */}
  },[language,copy]);
  useEffect(()=>{
    setSqlSchema(current=>current===null?null:generateSqlSchema(currentXml,language));
  },[language]);
  useEffect(()=>()=>{replyRequestId.current+=1;uploadRequestId.current+=1;},[]);
  useEffect(()=>{
    if(!isResizing)return;
    const move=(e:MouseEvent)=>setAsideWidth(Math.min(800,Math.max(320,e.clientX)));
    const up=()=>{setIsResizing(false);document.body.style.cursor='';document.body.style.userSelect='';};
    document.addEventListener('mousemove',move);document.addEventListener('mouseup',up);
    document.body.style.cursor='col-resize';document.body.style.userSelect='none';
    return()=>{document.removeEventListener('mousemove',move);document.removeEventListener('mouseup',up);};
  },[isResizing]);

  const applyGeneratedResult=(response:unknown,description:string,generatedXml?:string)=>{
    const generatedGraph=parseGeneratedGraph(response);
    const appended=hasGenerated?appendGraphBelowXml(currentXmlRef.current,generatedGraph):null;
    const combined=appended?.graph??generatedGraph;
    const xml=appended?.xml??generatedXml??generateBpmnXmlFromJson(generatedGraph,undefined,language);
    setUserInput(description);setGraph(combined);replaceDiagramXml(xml);setHasGenerated(true);
    const conversationCopy=getUiText(detectSourceLanguage(description));
    const task=generatedGraph.nodes.find(n=>n.type==='userTask'||n.type==='serviceTask')?.name||conversationCopy.fallbackTaskName;
    const question=conversationCopy.questions[Math.floor(Math.random()*conversationCopy.questions.length)].replace('{{task}}',task);
    setChatMessages([{sender:'ai',text:question}]);setChatInput('');setIsValidated(false);
    setIsScenarioFinished(false);setSqlSchema(null);
  };

  const handleGenerate=async()=>{
    const description=userInput.trim();if(!description||busy||isDocumentUploading)return;
    uploadRequestId.current+=1;
    replyRequestId.current+=1;
    setIsReplyPending(false);
    setIsGenerating(true);setAiError('');setChatMessages([]);setRollbackSnapshot(null);
    try{
      const response=await fetch(getApiUrl('/api/bpmn/generate'),{
        method:'POST',
        credentials:'include',
        headers:{'Content-Type':'application/json','Accept':'application/xml, application/json'},
        body:JSON.stringify({textPrompt:description}),
      });
      if(!response.ok){
        const payload=await response.json().catch(()=>null) as {error?:string}|null;
        throw new Error(payload?.error||`Ошибка генерации: HTTP ${response.status}.`);
      }
      const generatedXml=await response.text();
      const generatedGraph=extractBpmnXmlModel(generatedXml).graph;
      applyGeneratedResult({graph:generatedGraph},description,generatedXml);
      await refreshAuth();
    }catch(error){
      setAiError(getErrorText(error)??copy.generationError);
    }finally{
      setIsGenerating(false);
    }
  };

  const handleDocumentSelected=async(file:File)=>{
    const requestId=++uploadRequestId.current;
    replyRequestId.current+=1;
    setIsReplyPending(false);
    setIsDocumentUploading(true);setAiError('');
    try{
      const result=await uploadDocument.mutateAsync({data:{file}});
      if(requestId!==uploadRequestId.current)return;
      setChatMessages([]);setRollbackSnapshot(null);
      applyGeneratedResult(result,result.description);
      await refreshAuth();
    }catch(error){
      if(requestId!==uploadRequestId.current)return;
      setAiError(getErrorText(error)??copy.documentErrorFallback);
    }finally{
      if(requestId===uploadRequestId.current)setIsDocumentUploading(false);
    }
  };
  const handleReply=async()=>{
    const answer=chatInput.trim();if(!answer||!hasAiMessage||isReplyPending)return;
    const sourceLanguage=detectSourceLanguage(userInput.trim());
    setChatMessages(v=>[...v,{sender:'user',text:answer}]);setChatInput('');setIsScenarioFinished(false);
    setIsReplyPending(true);
    const requestId=++replyRequestId.current;
    setRollbackSnapshot(null);
    try{
      const baselineXml=await flushDiagramXml.current?.()??currentXmlRef.current;
      const baselineModel=extractBpmnXmlModel(baselineXml);
      const baselineGraph=baselineModel.graph;
      const previousValidatorMessage=[...chatMessages].reverse().find(message=>message.sender==='ai')?.text;
      setGraph(baselineGraph);
      setRollbackSnapshot({
        graph:{nodes:baselineGraph.nodes.map(node=>({...node})),edges:baselineGraph.edges.map(edge=>({...edge}))},
        xml:baselineXml,
        chatMessages:chatMessages.map(message=>({...message})),
        isValidated,
        isScenarioFinished,
        sqlSchema,
      });
      const result=await refine.mutateAsync({data:{
        description:userInput.trim(),
        answer,
        previousValidatorMessage,
        graph:baselineGraph,
      }});
      if(requestId!==replyRequestId.current)return;
       const updatedGraph=parseGeneratedGraph(result.graph);
      const mergedGraph=mergeRefinementGraphs(baselineGraph,updatedGraph);
      const updatedXml=mergeRefinementXml(baselineXml,baselineModel,updatedGraph);
      setGraph(mergedGraph);replaceDiagramXml(updatedXml);
      setChatMessages(v=>[...v,{sender:'ai',text:result.message,canRollback:true}]);
      setIsValidated(true);setSqlSchema(null);
      await refreshAuth();
    }catch(error){
      if(requestId!==replyRequestId.current)return;
      setChatMessages(v=>[...v,{sender:'ai',text:refinementErrorMessage(error,sourceLanguage),canRollback:true}]);
    }finally{
      if(requestId===replyRequestId.current)setIsReplyPending(false);
    }
  };
  const handleRollback=()=>{
    if(!rollbackSnapshot)return;
    replyRequestId.current+=1;
    setGraph(rollbackSnapshot.graph);
    replaceDiagramXml(rollbackSnapshot.xml);
    setChatMessages(rollbackSnapshot.chatMessages);
    setIsValidated(rollbackSnapshot.isValidated);
    setIsScenarioFinished(rollbackSnapshot.isScenarioFinished);
    setSqlSchema(rollbackSnapshot.sqlSchema);
    setChatInput('');
    setIsReplyPending(false);
    setRollbackSnapshot(null);
  };
  const handleClearText=()=>{
    uploadRequestId.current+=1;
    replyRequestId.current+=1;
    setUserInput('');setChatMessages([]);setChatInput('');setAiError('');setIsScenarioFinished(false);setIsReplyPending(false);setIsDocumentUploading(false);setRollbackSnapshot(null);
  };
  const handleFinish=()=>{
    replyRequestId.current+=1;
    const conversationCopy=getUiText(detectSourceLanguage(userInput.trim()));
    setIsReplyPending(false);setChatMessages(v=>[...v,{sender:'ai',text:conversationCopy.finishedByUser}]);setIsValidated(true);setIsScenarioFinished(true);
  };
  const handleClearCanvas=()=>{
    uploadRequestId.current+=1;
    replyRequestId.current+=1;
    replaceDiagramXml(MINIMAL_BPMN_XML);setGraph({nodes:[],edges:[]});setHasGenerated(false);setChatMessages([]);
    setChatInput('');setIsValidated(false);setIsScenarioFinished(false);setSqlSchema(null);setRollbackSnapshot(null);setIsReplyPending(false);setIsDocumentUploading(false);
  };
  const copySql=async()=>{
    if(!sqlSchema)return;
    try{
      await navigator.clipboard.writeText(sqlSchema);
    }catch{
      const temp=document.createElement('textarea');temp.value=sqlSchema;document.body.appendChild(temp);temp.select();document.execCommand('copy');temp.remove();
    }
    setIsCopied(true);window.setTimeout(()=>setIsCopied(false),2000);
  };
  const signedInUser=authStatus?.authenticated?authStatus.user:undefined;
  const needsGoogleLoginForGenerate=authStatus?.authenticated===false&&Boolean(userInput.trim());

  return <div className="studio">
    <aside className="control-rail" style={{width:asideWidth,flexBasis:asideWidth}} data-testid="panel-controls">
      <header className="brand">
        <div className="brand-identity">
          <div className="brand-mark" aria-hidden="true">tb</div>
          <div className="brand-copy"><div className="brand-title">Text-to-BPMN</div><div className="brand-caption">{copy.brandCaption}</div></div>
        </div>
        <div className="language-switch" role="group" aria-label={copy.languageSwitcher} data-testid="language-switch">
          <button type="button" className={language==='en'?'active':''} aria-pressed={language==='en'} aria-label={copy.switchToEnglish} onClick={()=>setLanguage('en')} data-testid="button-language-en">Eng</button>
          <button type="button" className={language==='ru'?'active':''} aria-pressed={language==='ru'} aria-label={copy.switchToRussian} onClick={()=>setLanguage('ru')} data-testid="button-language-ru">Рус</button>
        </div>
      </header>
      <section>
        <div className="eyebrow" style={{marginBottom:5}}>{copy.descriptionStep}</div>
        <div className="description-head">
          <div className="section-title">{copy.describeProcess}</div>
          <button type="button" className="text-action" onClick={handleClearText} disabled={!hasTextToClear} title={hasTextToClear?copy.clearTextTitle:copy.nothingToClearTitle} data-testid="button-clear-text">{copy.clearText}</button>
        </div>
        <div className="description-import-row">
          <button type="button" className="import-btn" onClick={()=>documentInput.current?.click()} disabled={busy||isDocumentUploading||authStatus?.authenticated===false} data-testid="button-import-document">
            {isDocumentUploading?<span className="spin import-spinner" aria-hidden="true"/>:<Paperclip size={13}/>}
            {isDocumentUploading?copy.processingDocument:copy.importDocument}
          </button>
          <span className="import-note">{copy.importNote}</span>
          <input ref={documentInput} type="file" accept=".docx,.txt,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain" hidden aria-label={copy.chooseDocument} data-testid="input-import-document" onChange={event=>{
            const file=event.target.files?.[0];
            if(file)void handleDocumentSelected(file);
            event.target.value='';
          }}/>
        </div>
        <div className={`description-wrap${busy?' is-generating':''}`} aria-busy={busy} data-testid="description-loading-state">
          <textarea className={`description${busy?' is-blurred':''}`} value={userInput} onChange={e=>setUserInput(e.target.value)} placeholder={copy.descriptionPlaceholder} disabled={isDocumentUploading||busy} data-testid="input-process-description" aria-label={copy.descriptionAria}/>
          {busy&&<span className="description-loader" role="status" aria-label={copy.designingAria}>
            <span className="spin description-spinner" aria-hidden="true"/>
          </span>}
        </div>
        <div
          className={`generate-button-wrap${needsGoogleLoginForGenerate?' auth-required':''}`}
          tabIndex={needsGoogleLoginForGenerate?0:undefined}
          aria-label={needsGoogleLoginForGenerate?copy.loginToGenerateAria:undefined}
          aria-describedby={needsGoogleLoginForGenerate?'generate-login-tooltip':undefined}
          data-testid="generate-button-tooltip"
        >
          <button type="button" className="primary-btn" style={{width:'100%'}} onClick={()=>void handleGenerate()} disabled={busy||isDocumentUploading||!userInput.trim()||authStatus?.authenticated===false} data-testid="button-generate-bpmn">
            {isDocumentUploading?copy.importingDocument:busy?copy.designingProcess:copy.generateDiagram}
          </button>
          {needsGoogleLoginForGenerate&&<span className="generate-tooltip" id="generate-login-tooltip" role="tooltip">{copy.loginWithGoogle}</span>}
        </div>
        {busy&&<p className="generation-progress" role="status">{copy.modelBuildingProgress}</p>}
        {isDocumentUploading&&<p className="generation-progress" role="status" data-testid="status-document-upload">{copy.documentBuildingProgress}</p>}
        {aiError&&<div className="error-box" role="alert" data-testid="status-generation-error">{localizeKnownError(aiError,language)}</div>}
      </section>

      <section className="chat-box" aria-label={copy.validatorTitle}>
        <div className="chat-head">
          <div className="chat-status"><span className={`status-dot ${hasAiMessage?'active':''}`}/><span>{copy.validatorTitle}</span></div>
          <button type="button" className="finish-btn" onClick={handleFinish} disabled={isScenarioFinished||chatMessages.length===0||isDocumentUploading} title={copy.finishScenarioTitle} data-testid="button-finish-scenario">{copy.finishScenario}</button>
        </div>
        <div className="messages" data-testid="list-validator-messages">
          {chatMessages.length===0?<p className="chat-empty" data-testid="empty-validator">{copy.chatEmptyFirstLine}<br/>{copy.chatEmptySecondLine}</p>:chatMessages.map((m,i)=><div key={i} className={`message-row ${m.sender}${m.canRollback?' has-rollback':''}`}><div className={`message ${m.sender}`} data-testid={`message-validator-${i}`}>{m.text}</div>{m.canRollback&&i===chatMessages.length-1&&rollbackSnapshot&&<button type="button" className="rollback-btn" onClick={handleRollback} data-testid="button-rollback-validator-step"><Undo2 size={12}/>{copy.rollback}</button>}</div>)}
          {isReplyPending&&<p className="generation-progress" role="status" data-testid="status-refining-diagram">{copy.refiningDiagram}</p>}
          <div ref={messageEnd}/>
        </div>
        <div className="chat-compose">
          <input className="chat-input" value={chatInput} onChange={e=>setChatInput(e.target.value)} onKeyDown={e=>{if(e.key==='Enter')handleReply();}} disabled={!hasAiMessage||isReplyPending||isDocumentUploading} placeholder={copy.replyPlaceholder} aria-label={copy.replyAria} data-testid="input-validator-reply"/>
          <button type="button" className="send-btn" onClick={handleReply} disabled={!hasAiMessage||!chatInput.trim()||isReplyPending||isDocumentUploading||authStatus?.authenticated===false} data-testid="button-validator-reply"><Send size={13}/></button>
        </div>
      </section>
      <div className="eyebrow" style={{display:'flex',justifyContent:'space-between'}}><span>{copy.footerWorkflow}</span><span>v1.0</span></div>
    </aside>
    <div className={`resize-grip ${isResizing?'dragging':''}`} onMouseDown={()=>setIsResizing(true)} title={copy.resizeTitle} role="separator" aria-label={copy.resizeAria} data-testid="resize-sidebar"/>
    <main className="work-area">
      <header className="topbar">
        <div className="canvas-heading"><div className="canvas-icon"><Network size={16}/></div><div><div className="canvas-title">{copy.canvasTitle}</div><div className="canvas-sub" data-testid="status-canvas-summary">{hasGenerated?copy.canvasSummary(graph.nodes.length,graph.edges.length):copy.canvasReady}</div></div></div>
        <div className="toolbar">
          <button type="button" className="secondary-btn" disabled={!isValidated} onClick={()=>setSqlSchema(generateSqlSchema(currentXml,language))} title={!isValidated&&hasGenerated?copy.validatorTooltip:undefined} data-testid="button-generate-sql">{copy.databaseButton}</button>
          <SpecExportButton xml={currentXml} sourceDescription={userInput} disabled={!isValidated} hasDiagram={hasGenerated} language={language}/>
          {signedInUser&&!signedInUser.hasActivePremium&&!signedInUser.isWhitelisted&&<div className="payment-control" ref={paymentMenuRef}>
            <button
              type="button"
              className="payment-trigger"
              aria-expanded={isPaymentMenuOpen}
              aria-controls="premium-payment-menu"
              disabled={isPaymentPending}
              data-testid="button-premium-payment"
              onClick={()=>{
                setPaymentFailed(false);
                setIsPaymentMenuOpen(open=>!open);
              }}
            >
              {isPaymentPending?<><span className="spin" aria-hidden="true"/>{copy.paymentCreating}</>:<><Crown size={13}/>{copy.buyPremium}<ChevronDown size={13}/></>}
            </button>
            {isPaymentMenuOpen&&<div className="payment-menu" id="premium-payment-menu" role="group" aria-label={copy.paymentCurrencyAria}>
              <div className="payment-menu-title">{copy.paymentCurrencyPrompt}</div>
              <button type="button" className="payment-option" disabled={isPaymentPending} data-testid="button-pay-rubles" onClick={()=>void handlePaymentCheckout('aaio')}>
                <span className="payment-currency-mark" aria-hidden="true">₽</span>
                <span>{copy.payInRubles}</span>
              </button>
              <button type="button" className="payment-option" disabled={isPaymentPending} data-testid="button-pay-usd" onClick={()=>void handlePaymentCheckout('lemonsqueezy')}>
                <span className="payment-currency-mark" aria-hidden="true">$</span>
                <span>{copy.payInUsd}</span>
              </button>
              {paymentFailed&&<div className="payment-error" role="alert" data-testid="status-payment-error">{copy.paymentError}</div>}
            </div>}
          </div>}
          <div className={`auth-bar${signedInUser?' is-authenticated':''}`} data-testid="auth-status">
            {signedInUser?<>
              <div className="auth-summary">
                <span className="auth-email" title={signedInUser.email}>{signedInUser.email}</span>
                <span
                  className={`auth-quota${signedInUser.isWhitelisted === true ? ' admin-unlimited' : ''}`}
                  data-testid="status-user-quota"
                >
                  {signedInUser.isWhitelisted === true
                    ? copy.adminUnlimited
                    : signedInUser.hasActivePremium
                      ? copy.unlimited
                      : copy.freeQuota(signedInUser.freeGenerationsLeft ?? 0)}
                </span>
              </div>
              <button type="button" className="auth-action" onClick={()=>void handleLogout()}>{copy.logout}</button>
            </>:<>
              <span className="auth-prompt" title={copy.authPrompt}>{authStatus===null?copy.authChecking:copy.authPrompt}</span>
              <a className="auth-action" href={getGoogleLoginHref()} onClick={()=>saveDescriptionDraft(userInput)}>{copy.loginWithGoogle}</a>
            </>}
          </div>
        </div>
      </header>
      <div className="canvas-wrap" data-testid="panel-bpmn-canvas">
        <BPMNViewer
          xml={currentXml}
          importVersion={diagramImportVersion}
          language={language}
          onXmlChange={handleModelerXmlChange}
          onRegisterXmlFlush={registerDiagramXmlFlush}
        />
        <button type="button" className="canvas-clear" onClick={handleClearCanvas} disabled={!hasGenerated} data-testid="button-clear-canvas">{copy.clearCanvas}</button>
      </div>
      <footer className="footer-note"><span data-testid="status-validation">{isValidated?<><Check size={11} style={{verticalAlign:'-2px',marginRight:4}}/>{copy.validated}</>:copy.waitingForValidator}</span><span>{copy.bpmnDrawing}</span></footer>
    </main>
    {sqlSchema!==null&&<div className="modal-backdrop" onClick={()=>setSqlSchema(null)} role="presentation">
      <div className="sql-modal" role="dialog" aria-modal="true" aria-labelledby="sql-heading" onClick={e=>e.stopPropagation()}>
        <div className="modal-head"><div><h2 id="sql-heading">{copy.sqlTitle}</h2><p>{copy.sqlDescription}</p></div><div className="modal-actions">
          <button type="button" onClick={()=>void copySql()} data-testid="button-copy-sql">{isCopied?copy.copied:copy.copySql}</button>
          <button type="button" onClick={()=>setSqlSchema(null)} data-testid="button-close-sql">{copy.close}</button>
        </div></div>
        <pre className="sql-code" data-testid="result-sql-schema"><code>{sqlSchema}</code></pre>
      </div>
    </div>}
    {isLemonCheckoutOpen&&createPortal(
      <button
        type="button"
        className="flex h-10 w-10 items-center justify-center rounded-full border border-[#d5e0dc] bg-white text-[#267b70] shadow-lg transition hover:bg-[#f0f7f4] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#267b70]"
        style={{position:'fixed',top:'42px',left:'10px',zIndex:2147483647}}
        aria-label={copy.paymentClose}
        title={copy.paymentClose}
        onClick={closeLemonCheckout}
        data-testid="button-close-lemon-checkout"
      >
        <X size={18} aria-hidden="true"/>
      </button>,
      document.body,
    )}
  </div>;
}

export default function App(){
  const isAdminRoute = typeof window !== 'undefined' &&
    window.location.pathname.replace(/\/+$/, '').endsWith('/admin-panel');
  return isAdminRoute ? <AdminPanel/> : <StudioApp/>;
}
