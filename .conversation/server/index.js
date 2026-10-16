import express from 'express'
import {
  BPMN_GRAPH_SYSTEM_PROMPT,
  BPMN_SPEC_SYSTEM_PROMPT,
} from '../src/constants/bpmnSystemPrompt.ts'

const PORT = process.env.PORT ?? 3001

/**
 * Бэкенд работает с любым OpenAI-совместимым эндпоинтом:
 *   Gemini   — https://generativelanguage.googleapis.com/v1beta/openai
 *   Ollama   — http://localhost:11434/v1
 *   OpenRouter — https://openrouter.ai/api/v1
 */
const AI_BASE_URL = (process.env.AI_BASE_URL ?? 'https://generativelanguage.googleapis.com/v1beta/openai').replace(/\/+$/, '')
const AI_MODEL_NAME = process.env.AI_MODEL_NAME ?? 'gemini-1.5-flash'
const AI_API_KEY = process.env.AI_API_KEY ?? process.env.OPENROUTER_API_KEY ?? ''
/** OpenRouter требует заголовки атрибуции приложения, Ollama их просто игнорирует */
const AI_SITE_URL = process.env.AI_SITE_URL ?? 'http://localhost:5173'
const AI_APP_TITLE = process.env.AI_APP_TITLE ?? 'Text-to-BPMN Studio'

const MAX_TOKENS = 8000

const app = express()
app.use(express.json({ limit: '256kb' }))

/**
 * Достаёт JSON-граф из ответа модели: срезает markdown-ограждения и
 * пояснения, берёт фрагмент от первой { до последней }.
 * Возвращает null, если распарсить не удалось.
 */
function extractJsonGraph(raw) {
  const cleaned = raw.replace(/```[a-z]*/gi, '').trim()

  const start = cleaned.indexOf('{')
  const end = cleaned.lastIndexOf('}')
  if (start === -1 || end === -1 || end < start) return null

  try {
    return JSON.parse(cleaned.slice(start, end + 1))
  } catch {
    return null
  }
}

/** Текст ошибки из тела ответа (учитывает и ошибки внутри 200-ответа) */
async function readApiError(response) {
  try {
    const body = await response.json()
    const error = body.error
    if (!error) return ''
    return typeof error === 'string' ? error : (error.message ?? '')
  } catch {
    return ''
  }
}

/**
 * Запрос к модели в OpenAI-совместимом формате.
 * Возвращает { content } при успехе либо { status, error } — исключения не пробрасываются.
 */
async function callModel(messages, logTag) {
  let response
  try {
    response = await fetch(`${AI_BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(AI_API_KEY ? { 'Authorization': `Bearer ${AI_API_KEY}` } : {}),
      },
      body: JSON.stringify({
        model: AI_MODEL_NAME,
        max_tokens: MAX_TOKENS,
        messages,
      }),
    })
  } catch (err) {
    console.error(`[${logTag}] ${AI_BASE_URL} недоступен:`, err.message)
    return {
      status: 502,
      error: `Не удалось связаться с моделью по адресу ${AI_BASE_URL}. Проверьте, что Ollama запущена.`,
    }
  }

  if (!response.ok) {
    const details = await readApiError(response)
    console.error(`[${logTag}] ${AI_MODEL_NAME} ответил ${response.status}: ${details}`)
    return {
      status: response.status,
      error: `Модель ответила ошибкой ${response.status}. ${details}`.trim(),
    }
  }

  const data = await response.json()
  const content = data.choices?.[0]?.message?.content ?? ''
  if (!content && data.error) {
    const details = typeof data.error === 'string' ? data.error : (data.error.message ?? '')
    console.error(`[${logTag}] ошибка в теле ответа:`, details)
    return { status: 502, error: `Модель вернула ошибку: ${details}` }
  }

  return { content }
}

app.post('/api/generate', async (req, res) => {
  const description =
    typeof req.body?.description === 'string' ? req.body.description.trim() : ''

  if (!description) {
    return res.status(400).json({ error: 'Поле description обязательно и не может быть пустым.' })
  }

  const result = await callModel(
    [
      { role: 'system', content: BPMN_GRAPH_SYSTEM_PROMPT },
      { role: 'user', content: description },
    ],
    'generate',
  )
  if (result.error) {
    return res.status(result.status).json({ error: result.error })
  }

  const graph = extractJsonGraph(result.content)
  if (!graph) {
    console.error('[generate] в ответе модели нет JSON-графа:', result.content.slice(0, 300))
    return res.status(502).json({ error: 'Модель вернула не JSON-граф процесса.' })
  }

  // XML и геометрию собирает фронтенд (src/utils/bpmnBuilder.ts)
  return res.json({ graph })
})

/**
 * Генерация технического задания по утверждённому JSON-графу.
 * Вызывается только по кнопке — чтобы не тратить токены на каждый запрос.
 */
app.post('/api/generate-spec', async (req, res) => {
  const graph = req.body?.graph

  if (typeof graph !== 'object' || graph === null || !Array.isArray(graph.nodes)) {
    return res
      .status(400)
      .json({ error: 'Поле graph обязательно и должно содержать список nodes.' })
  }
  if (graph.nodes.length === 0) {
    return res.status(400).json({ error: 'Граф процесса пуст — нечего описывать в ТЗ.' })
  }

  const result = await callModel(
    [
      { role: 'system', content: BPMN_SPEC_SYSTEM_PROMPT },
      { role: 'user', content: `JSON-граф процесса:\n${JSON.stringify(graph, null, 2)}` },
    ],
    'generate-spec',
  )
  if (result.error) {
    return res.status(result.status).json({ error: result.error })
  }

  // Модель иногда всё же заворачивает ответ в markdown-ограждение — снимаем его
  const spec = result.content
    .replace(/^\s*```[a-z]*\n?/i, '')
    .replace(/```\s*$/, '')
    .trim()

  if (!spec) {
    return res.status(502).json({ error: 'Модель вернула пустой текст ТЗ.' })
  }

  return res.json({ spec })
})

app.listen(PORT, () => {
  console.log(`Сервер Text-to-BPMN запущен на http://localhost:${PORT}`)
  console.log(`  Эндпоинт: ${AI_BASE_URL}/chat/completions`)
  console.log(`  Модель:   ${AI_MODEL_NAME}`)
  console.log(`  Статус API-ключа: ${AI_API_KEY ? 'Настроен (Google Gemini)' : 'Не найден'}`)
})
