import { useEffect, useRef, useState } from 'react'
import BPMNViewer from './components/BPMNViewer'
import HintTooltip from './components/HintTooltip'
import SpecExportButton from './components/SpecExportButton'
import {
  MOCK_BPMN_NOTIFICATION_XML,
  MINIMAL_BPMN_XML,
} from './constants/mockBpmn'
import { generateBpmnViaAI } from './services/claudeClient'
import { mergeBpmnXml, extractGraphFromXml } from './utils/bpmnBuilder'
import { generateSqlSchema } from './utils/generateSqlSchema'

type ChatMessage = { sender: 'ai' | 'user'; text: string }
type UiError = { title: string; details?: string }

/** Подсказки для ИИ-валидатора, чтобы симулировать контекстную проверку */
const VALIDATOR_QUESTIONS = [
  'Я построил базовый процесс. Но я заметил, что у вас есть развилка (ромб). Что должно произойти, если на этапе «{{task}}» возникнет ошибка или отказ? Мы должны завершить процесс или отправить уведомление клиенту?',
  'Схема готова. У меня вопрос по шагу «{{task}}»: требуется ли здесь какая-то дополнительная валидация данных перед переходом к следующему этапу?',
  'Логика процесса понятна. Однако стоит уточнить: на этапе «{{task}}» предусмотрено ли автоматическое уведомление ответственных лиц о выполнении задачи?',
]

/** Подсказка активной кнопки «Очистить текст» */
const CLEAR_TEXT_HINT =
  'Описание текущего процесса будет очищено. Вы сможете построить связанную диаграмму ниже существующей'
/** Подсказка, когда очищать нечего */
const CLEAR_TEXT_EMPTY_HINT = 'Очищать пока нечего: все текстовые поля уже пусты'

/** Подсказка кнопки «Завершить сценарий» */
const FINISH_SCENARIO_HINT = 'Сценарий может быть завершен с ошибками'

/** Реплика валидатора после принудительного завершения сценария */
const FINISH_SCENARIO_REPLY = 'Процесс завершен пользователем'

/** Ответ валидатора после уточнения от пользователя */
const VALIDATOR_UPDATE_REPLY =
  'Отлично, логика обновлена! Я добавил промежуточное событие отправки уведомления перед завершением процесса.'

/** Заголовок ошибки генерации (по требованиям ТЗ) */
const AI_GENERATION_ERROR_TITLE =
  'Ошибка генерации структуры ИИ. Пожалуйста, попробуйте изменить описание'

const ASIDE_MIN_WIDTH = 360
const ASIDE_MAX_WIDTH = 800
const ASIDE_DEFAULT_WIDTH = 450

export default function App() {
  const [userInput, setUserInput] = useState('')
  /** XML единственного холста; MINIMAL_BPMN_XML — холст очищен, но палитра видна */
  const [currentXml, setCurrentXml] = useState(MINIMAL_BPMN_XML)
  /** Есть ли на холсте сгенерированная диаграмма (мок-заглушка не в счёт) */
  const [hasGenerated, setHasGenerated] = useState(false)
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([])
  const [chatInput, setChatInput] = useState('')
  /** Схема считается валидированной после того, как валидатор подтвердил логику */
  const [isValidated, setIsValidated] = useState(false)
  /** null — модальное окно со SQL закрыто */
  const [sqlSchema, setSqlSchema] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [aiError, setAiError] = useState<UiError | null>(null)
  const [isCopied, setIsCopied] = useState(false)
  /** Сценарий завершён вручную: повторное завершение доступно только после новых сообщений */
  const [isScenarioFinished, setIsScenarioFinished] = useState(false)

  /** Ширина левой панели в пикселях */
  const [asideWidth, setAsideWidth] = useState(ASIDE_DEFAULT_WIDTH)
  const [isResizing, setIsResizing] = useState(false)

  const messagesEndRef = useRef<HTMLDivElement>(null)
  /** Отложенный ответ валидатора: очистка должна его отменять */
  const replyTimeoutRef = useRef<number | null>(null)

  // Прокрутка чата к последнему сообщению
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [chatMessages])

  // Отмена отложенного ответа при размонтировании
  useEffect(() => {
    return () => {
      if (replyTimeoutRef.current !== null) {
        window.clearTimeout(replyTimeoutRef.current)
      }
    }
  }, [])

  // Обработка изменения размера панели
  useEffect(() => {
    if (!isResizing) return

    const handleMouseMove = (e: MouseEvent) => {
      const newWidth = Math.min(Math.max(e.clientX, ASIDE_MIN_WIDTH), ASIDE_MAX_WIDTH)
      setAsideWidth(newWidth)
    }

    const handleMouseUp = () => {
      setIsResizing(false)
      document.body.style.cursor = 'default'
      document.body.style.userSelect = 'auto'
    }

    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleMouseUp)
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'

    return () => {
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
    }
  }, [isResizing])

  const hasAiMessage = chatMessages.some((message) => message.sender === 'ai')
  /** Есть ли хоть какое-то текстовое поле, которое можно очистить */
  const hasTextToClear =
    userInput.length > 0 ||
    chatInput.length > 0 ||
    chatMessages.length > 0 ||
    aiError !== null

  const handleGenerate = async () => {
    const description = userInput.trim()
    if (!description || isLoading) return

    setIsLoading(true)
    setAiError(null)
    // Очищаем чат сразу при начале новой генерации, чтобы пользователь не видел старый контекст
    setChatMessages([])

    try {
      const xml = await generateBpmnViaAI(description)

      // Первая схема заменяет заглушку, каждая следующая достраивается
      // блоками ниже по тому же единственному холсту
      setCurrentXml((prev) => (hasGenerated && prev ? mergeBpmnXml(prev, xml) : xml))
      setHasGenerated(true)

      // Подбираем вопрос исходя из контекста сгенерированной схемы
      const graph = extractGraphFromXml(xml)
      const tasks = graph.nodes.filter((n) => n.type === 'userTask' || n.type === 'serviceTask')
      const taskName = tasks.length > 0 ? (tasks[0].name || 'обработки данных') : 'этого этапа'

      const randomQuestionTemplate =
        VALIDATOR_QUESTIONS[Math.floor(Math.random() * VALIDATOR_QUESTIONS.length)]
      const question = randomQuestionTemplate.replace('{{task}}', taskName)

      setChatMessages([{ sender: 'ai', text: question }])
      setChatInput('')
      setIsValidated(false)
      setIsScenarioFinished(false)
      setSqlSchema(null)
    } catch (err) {
      console.error('Ошибка генерации BPMN через Claude API:', err)
      setAiError({
        title: AI_GENERATION_ERROR_TITLE,
        details: err instanceof Error ? err.message : undefined,
      })
    } finally {
      setIsLoading(false)
    }
  }

  const handleReply = () => {
    const answer = chatInput.trim()
    if (!answer || !hasAiMessage) return

    setChatMessages((prev) => [...prev, { sender: 'user', text: answer }])
    setChatInput('')
    // Новые сообщения в чате снова делают сценарий активным
    setIsScenarioFinished(false)

    // Имитация «раздумий» ИИ-валидатора перед обновлением схемы
    replyTimeoutRef.current = window.setTimeout(() => {
      replyTimeoutRef.current = null
      setChatMessages((prev) => [
        ...prev,
        { sender: 'ai', text: VALIDATOR_UPDATE_REPLY },
      ])
      setCurrentXml(MOCK_BPMN_NOTIFICATION_XML)
      setIsValidated(true)
    }, 1000)
  }

  /** «Очистить текст»: стирает все текстовые поля — описание, чат-валидатор и ошибки */
  const handleClearText = () => {
    if (replyTimeoutRef.current !== null) {
      window.clearTimeout(replyTimeoutRef.current)
      replyTimeoutRef.current = null
    }

    setUserInput('')
    setChatMessages([])
    setChatInput('')
    setAiError(null)
    setIsScenarioFinished(false)
  }

  /** «Завершить сценарий»: прерываем диалог с валидатором и разблокируем экспорт */
  const handleFinishScenario = () => {
    if (replyTimeoutRef.current !== null) {
      window.clearTimeout(replyTimeoutRef.current)
      replyTimeoutRef.current = null
    }

    setChatMessages((prev) => [
      ...prev,
      { sender: 'ai', text: FINISH_SCENARIO_REPLY },
    ])
    setIsValidated(true)
    setIsScenarioFinished(true)
  }

  /** «Очистить холст»: процесс можно построить заново */
  const handleClearCanvas = () => {
    setCurrentXml(MINIMAL_BPMN_XML)
    setHasGenerated(false)
    setChatMessages([])
    setChatInput('')
    setIsValidated(false)
    setIsScenarioFinished(false)
    setSqlSchema(null)
  }

  const handleGenerateSql = () => {
    setSqlSchema(generateSqlSchema(currentXml))
  }

  const handleCopySql = async () => {
    if (!sqlSchema) return
    try {
      await navigator.clipboard.writeText(sqlSchema)
      setIsCopied(true)
      setTimeout(() => setIsCopied(false), 2000)
    } catch (err) {
      console.error('Ошибка копирования:', err)
    }
  }

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-slate-100 text-slate-800">
      {/* ── Левая панель: панель управления ────────────────────────────── */}
      <aside
        style={{ width: asideWidth }}
        className="flex h-full flex-col gap-4 border-r border-slate-200 bg-white p-4"
      >
        <header>
          <h1 className="text-lg font-semibold">Text-to-BPMN</h1>
          <p className="text-xs text-slate-500">
            Опишите бизнес-процесс текстом — получите BPMN-диаграмму
          </p>
        </header>

        <section className="flex flex-col gap-2">
          <div className="flex items-center justify-between gap-2">
            <label
              htmlFor="process-description"
              className="text-sm font-medium text-slate-700"
            >
              Описание процесса
            </label>
            <HintTooltip
              id="clear-text-hint"
              text={hasTextToClear ? CLEAR_TEXT_HINT : CLEAR_TEXT_EMPTY_HINT}
              visible
            >
              <button
                type="button"
                onClick={handleClearText}
                disabled={!hasTextToClear}
                aria-describedby={hasTextToClear ? undefined : 'clear-text-hint'}
                className="rounded-md border border-slate-300 bg-white px-2.5 py-1 text-xs font-medium text-slate-600 transition hover:border-red-300 hover:bg-red-50 hover:text-red-600 active:bg-red-100 disabled:cursor-not-allowed disabled:border-slate-200 disabled:bg-slate-100 disabled:text-slate-400 disabled:hover:border-slate-200 disabled:hover:bg-slate-100 disabled:hover:text-slate-400"
              >
                Очистить текст
              </button>
            </HintTooltip>
          </div>
          <textarea
            id="process-description"
            value={userInput}
            onChange={(e) => setUserInput(e.target.value)}
            placeholder="Например: Клиент отправляет заявку, менеджер проверяет её и, если всё корректно, передаёт в отдел исполнения…"
            className="h-48 resize-none rounded-lg border border-slate-300 p-3 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
          />
          <button
            type="button"
            onClick={handleGenerate}
            disabled={isLoading || !userInput.trim()}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-blue-700 active:bg-blue-800 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-400"
          >
            {isLoading ? 'ИИ проектирует процесс…' : 'Сгенерировать диаграмму'}
          </button>

          {aiError && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2">
              <p className="text-xs font-medium text-red-700">{aiError.title}</p>
              {aiError.details && (
                <p className="mt-1 text-[11px] leading-snug text-red-600/80">
                  {aiError.details}
                </p>
              )}
            </div>
          )}
        </section>

        {/* Блок чата-валидатора */}
        <section className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border border-slate-200 bg-white">
          <div className="flex items-center justify-between gap-2 border-b border-slate-200 px-3 py-2">
            <span className="truncate text-sm font-medium text-slate-600">
              Чат-валидатор
            </span>
            <HintTooltip id="finish-scenario-hint" text={FINISH_SCENARIO_HINT} visible>
              <button
                type="button"
                onClick={handleFinishScenario}
                disabled={isScenarioFinished || chatMessages.length === 0}
                aria-describedby="finish-scenario-hint"
                className="whitespace-nowrap rounded-md border border-slate-300 bg-white px-2.5 py-1 text-xs font-medium text-slate-600 transition hover:border-amber-300 hover:bg-amber-50 hover:text-amber-700 active:bg-amber-100 disabled:cursor-not-allowed disabled:border-slate-200 disabled:bg-slate-100 disabled:text-slate-400 disabled:hover:border-slate-200 disabled:hover:bg-slate-100 disabled:hover:text-slate-400"
              >
                Завершить сценарий
              </button>
            </HintTooltip>
          </div>

          <div className="min-h-0 flex-1 space-y-2 overflow-y-auto p-3">
            {chatMessages.length === 0 ? (
              <p className="px-4 pt-8 text-center text-xs text-slate-400">
                Здесь появятся замечания и вопросы по сгенерированной схеме
              </p>
            ) : (
              chatMessages.map((message, index) => (
                <div
                  key={index}
                  className={
                    message.sender === 'ai' ? 'flex justify-start' : 'flex justify-end'
                  }
                >
                  <div
                    className={`max-w-[85%] rounded-lg px-3 py-2 text-xs leading-relaxed ${
                      message.sender === 'ai'
                        ? 'rounded-tl-sm bg-slate-100 text-slate-700'
                        : 'rounded-tr-sm bg-blue-600 text-white'
                    }`}
                  >
                    {message.text}
                  </div>
                </div>
              ))
            )}
            <div ref={messagesEndRef} />
          </div>

          <div className="flex gap-2 border-t border-slate-200 p-3">
            <input
              type="text"
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleReply()
              }}
              disabled={!hasAiMessage}
              placeholder="Ваш ответ…"
              className="min-w-0 flex-1 rounded-lg border border-slate-300 px-3 py-2 text-xs outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 disabled:bg-slate-50 disabled:text-slate-400"
            />
            <button
              type="button"
              onClick={handleReply}
              disabled={!hasAiMessage || !chatInput.trim()}
              className="rounded-lg bg-blue-600 px-3 py-2 text-xs font-medium text-white transition hover:bg-blue-700 active:bg-blue-800 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-400"
            >
              Ответить
            </button>
          </div>
        </section>
      </aside>

      {/* Разделитель для изменения размера (Resize Handle) */}
      <div
        onMouseDown={() => setIsResizing(true)}
        className={`z-20 w-1.5 cursor-col-resize transition-colors hover:bg-blue-400/30 ${
          isResizing ? 'bg-blue-500/50' : 'bg-transparent'
        }`}
        title="Зажмите, чтобы изменить размер"
      />

      {/* ── Правая панель: холст диаграммы ──────────────────────────────── */}
      <main className="flex h-full min-w-0 flex-1 flex-col">
        <div className="flex items-center justify-between gap-3 border-b border-slate-200 bg-white px-4 py-2">
          <span className="text-sm font-medium text-slate-600">Холст диаграммы</span>
          <div className="flex items-center gap-2">
            <HintTooltip
              id="generate-sql-hint"
              text="Кнопка станет активной после валидации схемы: ответьте на вопрос ИИ-валидатора в чате слева, чтобы подтвердить логику процесса."
              visible={!isValidated}
            >
              <button
                type="button"
                onClick={handleGenerateSql}
                disabled={!isValidated}
                aria-describedby={isValidated ? undefined : 'generate-sql-hint'}
                className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-blue-700 active:bg-blue-800 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-400"
              >
                Генерировать схему БД
              </button>
            </HintTooltip>

            <SpecExportButton xml={currentXml} disabled={!isValidated} />
          </div>
        </div>

        {/* Единственный экземпляр холста: новые подпроцессы достраиваются внутри него */}
        <div className="relative min-h-0 flex-1 p-3">
          <BPMNViewer xml={currentXml} />

          {!hasGenerated && (
            <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center p-3">
              <div className="flex h-full w-full items-center justify-center rounded-lg border border-dashed border-slate-300 bg-white/50 backdrop-blur-[1px]">
                <p className="max-w-xs px-6 text-center text-xs text-slate-400">
                  Холст пуст. Опишите процесс слева и нажмите «Сгенерировать диаграмму»
                </p>
              </div>
            </div>
          )}

          {/* Отдельная кнопка очистки холста — левее панели скачивания диаграммы */}
          <button
            type="button"
            onClick={handleClearCanvas}
            disabled={!currentXml}
            className="absolute bottom-6 left-6 z-10 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-600 shadow-md transition hover:border-red-300 hover:bg-red-50 hover:text-red-600 active:bg-red-100 disabled:cursor-not-allowed disabled:border-slate-200 disabled:bg-slate-100 disabled:text-slate-400 disabled:hover:border-slate-200 disabled:hover:bg-slate-100 disabled:hover:text-slate-400"
          >
            Очистить холст
          </button>
        </div>
      </main>

      {/* ── Модальное окно со сгенерированной схемой БД ─────────────────── */}
      {sqlSchema !== null && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-6"
          onClick={() => setSqlSchema(null)}
        >
          <div
            className="flex max-h-[85vh] w-full max-w-3xl flex-col overflow-hidden rounded-xl bg-white shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
              <div>
                <h2 className="text-sm font-semibold text-slate-700">Схема БД</h2>
                <p className="text-xs text-slate-500">
                  DDL сгенерирован по текущей BPMN-диаграмме
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleCopySql}
                  className={`rounded-lg px-3 py-1 text-sm transition ${
                    isCopied
                      ? 'bg-green-100 text-green-700'
                      : 'bg-blue-50 text-blue-600 hover:bg-blue-100'
                  }`}
                >
                  {isCopied ? 'Скопировано! ✅' : 'Копировать'}
                </button>
                <button
                  type="button"
                  onClick={() => setSqlSchema(null)}
                  className="rounded-lg px-3 py-1 text-sm text-slate-500 transition hover:bg-slate-100 hover:text-slate-700"
                >
                  Закрыть
                </button>
              </div>
            </div>
            <pre className="min-h-0 flex-1 overflow-auto bg-slate-900 p-4 text-xs leading-relaxed text-slate-100">
              <code>{sqlSchema}</code>
            </pre>
          </div>
        </div>
      )}
    </div>
  )
}
