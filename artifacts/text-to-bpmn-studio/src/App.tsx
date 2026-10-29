import { useCallback, useEffect, useRef, useState } from 'react';
import { Check, Network, Paperclip, Send, Undo2 } from 'lucide-react';
import { useRefineBpmn, useUploadDocument, type BpmnGraph } from '@workspace/api-client-react';
import BPMNViewer from './components/BPMNViewer';
import SpecExportButton from './components/SpecExportButton';
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
    freeGenerationsLeft:number;
    isWhitelisted:boolean;
  };
};
const GENERATION_ERROR_MESSAGE = 'Не удалось построить диаграмму: модель перегружена. Попробуйте повторить запрос позже.';
const QUESTIONS=[
  'Я построил базовый процесс. Что должно произойти, если на этапе «{{task}}» возникнет ошибка или отказ: завершить процесс или отправить уведомление клиенту?',
  'Схема готова. Требуется ли на шаге «{{task}}» дополнительная проверка данных перед переходом к следующему этапу?',
  'Логика процесса понятна. Нужно ли автоматически уведомлять ответственных лиц после выполнения шага «{{task}}»?',
];

function refinementErrorMessage(error: unknown): string {
  if (error && typeof error === 'object' && 'data' in error) {
    const data = (error as {data?:unknown}).data;
    if (data && typeof data === 'object' && 'error' in data &&
      typeof data.error === 'string' && data.error.trim()) return data.error;
  }
  return 'Не удалось обновить диаграмму. Исходная схема сохранена — попробуйте уточнить ответ ещё раз.';
}

function documentErrorMessage(error: unknown): string {
  if (error && typeof error === 'object' && 'data' in error) {
    const data = (error as {data?:unknown}).data;
    if (data && typeof data === 'object' && 'error' in data &&
      typeof data.error === 'string' && data.error.trim()) return data.error;
  }
  return 'Не удалось импортировать документ. Проверьте формат файла и попробуйте ещё раз.';
}

function apiErrorMessage(error: unknown, fallback: string): string {
  if (error && typeof error === 'object' && 'data' in error) {
    const data = (error as {data?:unknown}).data;
    if (data && typeof data === 'object' && 'error' in data &&
      typeof data.error === 'string' && data.error.trim()) return data.error;
  }
  if (error instanceof Error && error.message.trim()) return error.message;
  return fallback;
}

const DESCRIPTION_DRAFT_KEY = 'text-to-bpmn-description-draft';

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

export default function App(){
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
  const [rollbackSnapshot,setRollbackSnapshot]=useState<DiagramSnapshot|null>(null);
  const [asideWidth,setAsideWidth]=useState(410);
  const [isResizing,setIsResizing]=useState(false);
  const replyRequestId=useRef(0);
  const uploadRequestId=useRef(0);
  const currentXmlRef=useRef(MINIMAL_BPMN_XML);
  const flushDiagramXml=useRef<(()=>Promise<string>)|null>(null);
  const documentInput=useRef<HTMLInputElement>(null);
  const messageEnd=useRef<HTMLDivElement>(null);
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
      const response=await fetch('/api/auth/me',{credentials:'same-origin'});
      const status=await response.json() as AuthStatus;
      setAuthStatus(response.ok?status:{authenticated:false});
    }catch{
      setAuthStatus({authenticated:false});
    }
  },[]);
  const handleLogout=async()=>{
    try{await fetch('/api/auth/logout',{method:'POST',credentials:'same-origin'});}
    finally{await refreshAuth();}
  };

  useEffect(()=>{messageEnd.current?.scrollIntoView({behavior:'smooth'});},[chatMessages]);
  useEffect(()=>{void refreshAuth();},[refreshAuth]);
  useEffect(()=>{saveDescriptionDraft(userInput);},[userInput]);
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
    const xml=appended?.xml??generatedXml??generateBpmnXmlFromJson(generatedGraph);
    setUserInput(description);setGraph(combined);replaceDiagramXml(xml);setHasGenerated(true);
    const task=generatedGraph.nodes.find(n=>n.type==='userTask'||n.type==='serviceTask')?.name||'этого этапа';
    const question=QUESTIONS[Math.floor(Math.random()*QUESTIONS.length)].replace('{{task}}',task);
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
      const response=await fetch('/api/bpmn/generate',{
        method:'POST',
        credentials:'same-origin',
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
      setAiError(apiErrorMessage(error,GENERATION_ERROR_MESSAGE));
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
      setAiError(documentErrorMessage(error));
    }finally{
      if(requestId===uploadRequestId.current)setIsDocumentUploading(false);
    }
  };
  const handleReply=async()=>{
    const answer=chatInput.trim();if(!answer||!hasAiMessage||isReplyPending)return;
    setChatMessages(v=>[...v,{sender:'user',text:answer}]);setChatInput('');setIsScenarioFinished(false);
    setIsReplyPending(true);
    const requestId=++replyRequestId.current;
    setRollbackSnapshot(null);
    try{
      const baselineXml=await flushDiagramXml.current?.()??currentXmlRef.current;
      const baselineModel=extractBpmnXmlModel(baselineXml);
      const baselineGraph=baselineModel.graph;
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
      setChatMessages(v=>[...v,{sender:'ai',text:refinementErrorMessage(error),canRollback:true}]);
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
    setIsReplyPending(false);setChatMessages(v=>[...v,{sender:'ai',text:'Процесс завершен пользователем'}]);setIsValidated(true);setIsScenarioFinished(true);
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
        <div className="brand-mark" aria-hidden="true">tb</div>
        <div><div className="brand-title">Text-to-BPMN</div><div className="brand-caption">Студия моделирования процессов</div></div>
      </header>
      <section>
        <div className="eyebrow" style={{marginBottom:5}}>ШАГ 01 · ОПИСАНИЕ</div>
        <div className="description-head">
          <div className="section-title">Опишите бизнес-процесс</div>
          <button type="button" className="text-action" onClick={handleClearText} disabled={!hasTextToClear} title={hasTextToClear?'Очистить описание, чат и сообщение об ошибке':'Очищать пока нечего: все текстовые поля уже пусты'} data-testid="button-clear-text">Очистить текст</button>
        </div>
        <div className="description-import-row">
          <button type="button" className="import-btn" onClick={()=>documentInput.current?.click()} disabled={busy||isDocumentUploading||authStatus?.authenticated===false} data-testid="button-import-document">
            {isDocumentUploading?<span className="spin import-spinner" aria-hidden="true"/>:<Paperclip size={13}/>}
            {isDocumentUploading?'Обрабатываю документ…':'Импорт документа'}
          </button>
          <span className="import-note">DOCX, TXT · до 5 МБ</span>
          <input ref={documentInput} type="file" accept=".docx,.txt,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain" hidden aria-label="Выбрать DOCX или TXT файл" data-testid="input-import-document" onChange={event=>{
            const file=event.target.files?.[0];
            if(file)void handleDocumentSelected(file);
            event.target.value='';
          }}/>
        </div>
        <div className={`description-wrap${busy?' is-generating':''}`} aria-busy={busy} data-testid="description-loading-state">
          <textarea className={`description${busy?' is-blurred':''}`} value={userInput} onChange={e=>setUserInput(e.target.value)} placeholder="Например: Клиент отправляет заявку, менеджер проверяет её и, если всё корректно, передаёт в отдел исполнения…" disabled={isDocumentUploading||busy} data-testid="input-process-description" aria-label="Описание процесса"/>
          {busy&&<span className="description-loader" role="status" aria-label="ИИ проектирует процесс">
            <span className="spin description-spinner" aria-hidden="true"/>
          </span>}
        </div>
        <div
          className={`generate-button-wrap${needsGoogleLoginForGenerate?' auth-required':''}`}
          tabIndex={needsGoogleLoginForGenerate?0:undefined}
          aria-label={needsGoogleLoginForGenerate?'Войдите через Google, чтобы сгенерировать диаграмму':undefined}
          aria-describedby={needsGoogleLoginForGenerate?'generate-login-tooltip':undefined}
          data-testid="generate-button-tooltip"
        >
          <button type="button" className="primary-btn" style={{width:'100%'}} onClick={()=>void handleGenerate()} disabled={busy||isDocumentUploading||!userInput.trim()||authStatus?.authenticated===false} data-testid="button-generate-bpmn">
            {isDocumentUploading?'Импортирую документ…':busy?'ИИ проектирует процесс…':'Сгенерировать диаграмму'}
          </button>
          {needsGoogleLoginForGenerate&&<span className="generate-tooltip" id="generate-login-tooltip" role="tooltip">Войдите через Google</span>}
        </div>
        {busy&&<p className="generation-progress" role="status">Модель строит диаграмму. Пожалуйста, не закрывайте страницу.</p>}
        {isDocumentUploading&&<p className="generation-progress" role="status" data-testid="status-document-upload">Извлекаю текст и строю диаграмму…</p>}
        {aiError&&<div className="error-box" role="alert" data-testid="status-generation-error">{aiError}</div>}
      </section>

      <section className="chat-box" aria-label="Чат-валидатор">
        <div className="chat-head">
          <div className="chat-status"><span className={`status-dot ${hasAiMessage?'active':''}`}/><span>Чат-валидатор</span></div>
          <button type="button" className="finish-btn" onClick={handleFinish} disabled={isScenarioFinished||chatMessages.length===0||isDocumentUploading} title="Сценарий может быть завершен с ошибками" data-testid="button-finish-scenario">Завершить сценарий</button>
        </div>
        <div className="messages" data-testid="list-validator-messages">
          {chatMessages.length===0?<p className="chat-empty" data-testid="empty-validator">Здесь появятся замечания и вопросы<br/>по сгенерированной схеме</p>:chatMessages.map((m,i)=><div key={i} className={`message-row ${m.sender}${m.canRollback?' has-rollback':''}`}><div className={`message ${m.sender}`} data-testid={`message-validator-${i}`}>{m.text}</div>{m.canRollback&&i===chatMessages.length-1&&rollbackSnapshot&&<button type="button" className="rollback-btn" onClick={handleRollback} data-testid="button-rollback-validator-step"><Undo2 size={12}/>Вернуться назад</button>}</div>)}
          {isReplyPending&&<p className="generation-progress" role="status" data-testid="status-refining-diagram">Обновляю диаграмму по вашему уточнению…</p>}
          <div ref={messageEnd}/>
        </div>
        <div className="chat-compose">
          <input className="chat-input" value={chatInput} onChange={e=>setChatInput(e.target.value)} onKeyDown={e=>{if(e.key==='Enter')handleReply();}} disabled={!hasAiMessage||isReplyPending||isDocumentUploading} placeholder="Ваш ответ…" aria-label="Ответ валидатору" data-testid="input-validator-reply"/>
          <button type="button" className="send-btn" onClick={handleReply} disabled={!hasAiMessage||!chatInput.trim()||isReplyPending||isDocumentUploading||authStatus?.authenticated===false} data-testid="button-validator-reply"><Send size={13}/></button>
        </div>
      </section>
      <div className="eyebrow" style={{display:'flex',justifyContent:'space-between'}}><span>ЛОГИКА · СХЕМА · ЭКСПОРТ</span><span>v1.0</span></div>
    </aside>
    <div className={`resize-grip ${isResizing?'dragging':''}`} onMouseDown={()=>setIsResizing(true)} title="Зажмите, чтобы изменить размер" role="separator" aria-label="Изменить ширину панели" data-testid="resize-sidebar"/>
    <main className="work-area">
      <header className="topbar">
        <div className="canvas-heading"><div className="canvas-icon"><Network size={16}/></div><div><div className="canvas-title">Холст диаграммы</div><div className="canvas-sub" data-testid="status-canvas-summary">{hasGenerated?`${graph.nodes.length} элементов · ${graph.edges.length} потоков`:'Готов к построению процесса'}</div></div></div>
        <div className="toolbar">
          <button type="button" className="secondary-btn" disabled={!isValidated} onClick={()=>setSqlSchema(generateSqlSchema(currentXml))} title={!isValidated&&hasGenerated?'Ответьте на вопрос ИИ-валидатора, чтобы подтвердить логику процесса или завершите сценарий вручную':undefined} data-testid="button-generate-sql">Схема БД</button>
          <SpecExportButton xml={currentXml} disabled={!isValidated} hasDiagram={hasGenerated}/>
          <div className={`auth-bar${signedInUser?' is-authenticated':''}`} data-testid="auth-status">
            {signedInUser?<>
              <div className="auth-summary">
                <span className="auth-email" title={signedInUser.email}>{signedInUser.email}</span>
                <span className="auth-quota">{signedInUser.isWhitelisted?'Безлимитный доступ':signedInUser.hasActivePremium?'Активная подписка':`Бесплатно: ${signedInUser.freeGenerationsLeft}`}</span>
              </div>
              <button type="button" className="auth-action" onClick={()=>void handleLogout()}>Выйти</button>
            </>:<>
              <span className="auth-prompt" title="Войдите для генерации">{authStatus===null?'Проверка входа…':'Войдите для генерации'}</span>
              <a className="auth-action" href="/api/auth/google?next=%2F" onClick={()=>saveDescriptionDraft(userInput)}>Войти через Google</a>
            </>}
          </div>
        </div>
      </header>
      <div className="canvas-wrap" data-testid="panel-bpmn-canvas">
        <BPMNViewer
          xml={currentXml}
          importVersion={diagramImportVersion}
          onXmlChange={handleModelerXmlChange}
          onRegisterXmlFlush={registerDiagramXmlFlush}
        />
        <button type="button" className="canvas-clear" onClick={handleClearCanvas} disabled={!hasGenerated} data-testid="button-clear-canvas">Очистить холст</button>
      </div>
      <footer className="footer-note"><span data-testid="status-validation">{isValidated?<><Check size={11} style={{verticalAlign:'-2px',marginRight:4}}/>ЛОГИКА ПОДТВЕРЖДЕНА</>:'ОЖИДАЕТ ПРОВЕРКИ ВАЛИДАТОРОМ'}</span><span>ЧЕРТЁЖ BPMN 2.0</span></footer>
    </main>
    {sqlSchema!==null&&<div className="modal-backdrop" onClick={()=>setSqlSchema(null)} role="presentation">
      <div className="sql-modal" role="dialog" aria-modal="true" aria-labelledby="sql-heading" onClick={e=>e.stopPropagation()}>
        <div className="modal-head"><div><h2 id="sql-heading">Схема базы данных</h2><p>DDL сгенерирован по текущей BPMN-диаграмме</p></div><div className="modal-actions">
          <button type="button" onClick={()=>void copySql()} data-testid="button-copy-sql">{isCopied?'Скопировано':'Копировать SQL'}</button>
          <button type="button" onClick={()=>setSqlSchema(null)} data-testid="button-close-sql">Закрыть</button>
        </div></div>
        <pre className="sql-code" data-testid="result-sql-schema"><code>{sqlSchema}</code></pre>
      </div>
    </div>}
  </div>;
}
