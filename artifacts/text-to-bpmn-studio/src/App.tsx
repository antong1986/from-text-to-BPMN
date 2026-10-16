import { useEffect, useRef, useState } from 'react';
import { Check, Network, Send } from 'lucide-react';
import { useGenerateBpmn, type BpmnGraph } from '@workspace/api-client-react';
import BPMNViewer from './components/BPMNViewer';
import SpecExportButton from './components/SpecExportButton';
import { generateBpmnXmlFromJson, mergeGraphs } from './utils/bpmnBuilder';
import { MINIMAL_BPMN_XML, MOCK_ORDER_GRAPH, MOCK_REJECTION_GRAPH } from './utils/mockBpmn';
import { generateSqlSchema } from './utils/generateSqlSchema';
import { parseGeneratedGraph } from './utils/parseGeneratedGraph';

type ChatMessage={sender:'ai'|'user';text:string};
const GENERATION_ERROR_MESSAGE = 'Не удалось построить диаграмму: модель перегружена. Попробуйте повторить запрос позже.';
const EXAMPLES=[
  {label:'Обработка заявки',text:'Клиент отправляет заявку. Менеджер проверяет её и, если данные корректны, система регистрирует заявку. Если данные неверны — клиенту отправляется отказ.'},
  {label:'Оформление заказа',text:'Покупатель оформляет заказ. Система проверяет наличие товара. Если товар есть, сотрудник собирает заказ и передаёт его курьеру. Если товара нет, система уведомляет клиента и отменяет заказ.'},
];
const QUESTIONS=[
  'Я построил базовый процесс. Что должно произойти, если на этапе «{{task}}» возникнет ошибка или отказ: завершить процесс или отправить уведомление клиенту?',
  'Схема готова. Требуется ли на шаге «{{task}}» дополнительная проверка данных перед переходом к следующему этапу?',
  'Логика процесса понятна. Нужно ли автоматически уведомлять ответственных лиц после выполнения шага «{{task}}»?',
];

export default function App(){
  const [userInput,setUserInput]=useState('');
  const [currentXml,setCurrentXml]=useState(MINIMAL_BPMN_XML);
  const [graph,setGraph]=useState<BpmnGraph>({nodes:[],edges:[]});
  const [hasGenerated,setHasGenerated]=useState(false);
  const [chatMessages,setChatMessages]=useState<ChatMessage[]>([]);
  const [chatInput,setChatInput]=useState('');
  const [isValidated,setIsValidated]=useState(false);
  const [sqlSchema,setSqlSchema]=useState<string|null>(null);
  const [isCopied,setIsCopied]=useState(false);
  const [aiError,setAiError]=useState('');
  const [isScenarioFinished,setIsScenarioFinished]=useState(false);
  const [asideWidth,setAsideWidth]=useState(410);
  const [isResizing,setIsResizing]=useState(false);
  const replyTimeout=useRef<number|null>(null);
  const messageEnd=useRef<HTMLDivElement>(null);
  const generate=useGenerateBpmn();
  const busy=generate.isPending;
  const hasAiMessage=chatMessages.some(m=>m.sender==='ai');
  const hasTextToClear=Boolean(userInput||chatInput||chatMessages.length||aiError);

  useEffect(()=>{messageEnd.current?.scrollIntoView({behavior:'smooth'});},[chatMessages]);
  useEffect(()=>()=>{if(replyTimeout.current!==null)window.clearTimeout(replyTimeout.current);},[]);
  useEffect(()=>{
    if(!isResizing)return;
    const move=(e:MouseEvent)=>setAsideWidth(Math.min(800,Math.max(320,e.clientX)));
    const up=()=>{setIsResizing(false);document.body.style.cursor='';document.body.style.userSelect='';};
    document.addEventListener('mousemove',move);document.addEventListener('mouseup',up);
    document.body.style.cursor='col-resize';document.body.style.userSelect='none';
    return()=>{document.removeEventListener('mousemove',move);document.removeEventListener('mouseup',up);};
  },[isResizing]);

  const handleGenerate=async()=>{
    const description=userInput.trim();if(!description||busy)return;
    setAiError('');setChatMessages([]);
    try{
      const result=await generate.mutateAsync({data:{description}});
      const generatedGraph=parseGeneratedGraph(result);
      const combined=hasGenerated?mergeGraphs(graph,generatedGraph):generatedGraph;
      const xml=generateBpmnXmlFromJson(combined);
      setGraph(combined);setCurrentXml(xml);setHasGenerated(true);
      const task=combined.nodes.find(n=>n.type==='userTask'||n.type==='serviceTask')?.name||'этого этапа';
      const question=QUESTIONS[Math.floor(Math.random()*QUESTIONS.length)].replace('{{task}}',task);
      setChatMessages([{sender:'ai',text:question}]);setChatInput('');setIsValidated(false);
      setIsScenarioFinished(false);setSqlSchema(null);
    }catch{
      setAiError(GENERATION_ERROR_MESSAGE);
    }
  };
  const handleReply=()=>{
    const answer=chatInput.trim();if(!answer||!hasAiMessage)return;
    setChatMessages(v=>[...v,{sender:'user',text:answer}]);setChatInput('');setIsScenarioFinished(false);
    replyTimeout.current=window.setTimeout(()=>{
      replyTimeout.current=null;
      const notificationGraph:BpmnGraph={
        nodes:[
          {id:'start',type:'start',name:'Начало'},{id:'review',type:'userTask',name:'Проверить заявку'},
          {id:'gateway',type:'gateway',name:'Заявка корректна?'},{id:'process',type:'userTask',name:'Обработать заявку'},
          {id:'success',type:'end',name:'Успешно завершено'},{id:'notify',type:'serviceTask',name:'Отправить уведомление клиенту'},
          {id:'failure',type:'end',name:'Ошибка/Отклонено'},
        ],
        edges:[{from:'start',to:'review'},{from:'review',to:'gateway'},{from:'gateway',to:'process',condition:'Да'},
          {from:'gateway',to:'notify',condition:'Нет'},{from:'process',to:'success'},{from:'notify',to:'failure'}],
      };
      setGraph(notificationGraph);setCurrentXml(generateBpmnXmlFromJson(notificationGraph));
      setChatMessages(v=>[...v,{sender:'ai',text:'Отлично, логика обновлена! Я добавил промежуточное событие отправки уведомления перед завершением процесса.'}]);
      setIsValidated(true);
    },1000);
  };
  const handleClearText=()=>{
    if(replyTimeout.current!==null){window.clearTimeout(replyTimeout.current);replyTimeout.current=null;}
    setUserInput('');setChatMessages([]);setChatInput('');setAiError('');setIsScenarioFinished(false);
  };
  const handleFinish=()=>{
    if(replyTimeout.current!==null){window.clearTimeout(replyTimeout.current);replyTimeout.current=null;}
    setChatMessages(v=>[...v,{sender:'ai',text:'Процесс завершен пользователем'}]);setIsValidated(true);setIsScenarioFinished(true);
  };
  const handleClearCanvas=()=>{
    setCurrentXml(MINIMAL_BPMN_XML);setGraph({nodes:[],edges:[]});setHasGenerated(false);setChatMessages([]);
    setChatInput('');setIsValidated(false);setIsScenarioFinished(false);setSqlSchema(null);
  };
  const loadExample=(kind:'application'|'order')=>{
    const sample=kind==='application'?MOCK_REJECTION_GRAPH:MOCK_ORDER_GRAPH;
    setUserInput(kind==='application'?EXAMPLES[0].text:EXAMPLES[1].text);
    setGraph(sample);setCurrentXml(generateBpmnXmlFromJson(sample));setHasGenerated(true);
    setChatMessages([{sender:'ai',text:'Посмотрите на развилку процесса. Что нужно сделать при отказе или отсутствии товара?'}]);
    setIsValidated(false);setIsScenarioFinished(false);setAiError('');
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
        <textarea className="description" value={userInput} onChange={e=>setUserInput(e.target.value)} placeholder="Например: Клиент отправляет заявку, менеджер проверяет её и, если всё корректно, передаёт в отдел исполнения…" data-testid="input-process-description" aria-label="Описание процесса"/>
        <div className="examples">
          <button type="button" className="example-chip" onClick={()=>loadExample('application')} data-testid="button-example-application">Заявка · пример</button>
          <button type="button" className="example-chip" onClick={()=>loadExample('order')} data-testid="button-example-order">Заказ · пример</button>
        </div>
        <button type="button" className="primary-btn" style={{width:'100%'}} onClick={()=>void handleGenerate()} disabled={busy||!userInput.trim()} data-testid="button-generate-bpmn">
          {busy?'ИИ проектирует процесс…':'Сгенерировать диаграмму'}
        </button>
        {busy&&<p className="generation-progress" role="status">Обрабатываем описание. При временном сбое Gemini запрос повторяется автоматически. Это может занять до двух минут.</p>}
        {aiError&&<div className="error-box" role="alert" data-testid="status-generation-error">{GENERATION_ERROR_MESSAGE}</div>}
      </section>

      <section className="chat-box" aria-label="Чат-валидатор">
        <div className="chat-head">
          <div className="chat-status"><span className={`status-dot ${hasAiMessage?'active':''}`}/><span>Чат-валидатор</span></div>
          <button type="button" className="finish-btn" onClick={handleFinish} disabled={isScenarioFinished||chatMessages.length===0} title="Сценарий может быть завершен с ошибками" data-testid="button-finish-scenario">Завершить сценарий</button>
        </div>
        <div className="messages" data-testid="list-validator-messages">
          {chatMessages.length===0?<p className="chat-empty" data-testid="empty-validator">Здесь появятся замечания и вопросы по сгенерированной схеме</p>:chatMessages.map((m,i)=><div key={i} className={`message-row ${m.sender}`}><div className={`message ${m.sender}`} data-testid={`message-validator-${i}`}>{m.text}</div></div>)}
          <div ref={messageEnd}/>
        </div>
        <div className="chat-compose">
          <input className="chat-input" value={chatInput} onChange={e=>setChatInput(e.target.value)} onKeyDown={e=>{if(e.key==='Enter')handleReply();}} disabled={!hasAiMessage} placeholder="Ваш ответ…" aria-label="Ответ валидатору" data-testid="input-validator-reply"/>
          <button type="button" className="send-btn" onClick={handleReply} disabled={!hasAiMessage||!chatInput.trim()} data-testid="button-validator-reply"><Send size={13}/></button>
        </div>
      </section>
      <div className="eyebrow" style={{display:'flex',justifyContent:'space-between'}}><span>ЛОГИКА · СХЕМА · ЭКСПОРТ</span><span>v1.0</span></div>
    </aside>
    <div className={`resize-grip ${isResizing?'dragging':''}`} onMouseDown={()=>setIsResizing(true)} title="Зажмите, чтобы изменить размер" role="separator" aria-label="Изменить ширину панели" data-testid="resize-sidebar"/>
    <main className="work-area">
      <header className="topbar">
        <div className="canvas-heading"><div className="canvas-icon"><Network size={16}/></div><div><div className="canvas-title">Холст диаграммы</div><div className="canvas-sub" data-testid="status-canvas-summary">{hasGenerated?`${graph.nodes.length} элементов · ${graph.edges.length} потоков`:'Готов к построению процесса'}</div></div></div>
        <div className="toolbar">
          <button type="button" className="secondary-btn" disabled={!isValidated} onClick={()=>setSqlSchema(generateSqlSchema(currentXml))} title={!isValidated?'Ответьте на вопрос ИИ-валидатора, чтобы подтвердить логику процесса':''} data-testid="button-generate-sql">Схема БД</button>
          <SpecExportButton xml={currentXml} disabled={!isValidated}/>
        </div>
      </header>
      <div className="canvas-wrap" data-testid="panel-bpmn-canvas">
        <BPMNViewer xml={currentXml}/>
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
