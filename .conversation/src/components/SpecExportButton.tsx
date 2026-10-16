import { useEffect, useRef, useState } from 'react'
import { generateSpecViaAI } from '../services/claudeClient'
import { buildDocxFromMarkdown } from '../utils/exportDocx'
import { downloadFile } from '../utils/downloadFile'
import HintTooltip from './HintTooltip'

type SpecExportButtonProps = {
  /** XML текущей диаграммы — из него восстанавливается граф для запроса ТЗ */
  xml: string
  /** Схема не валидирована: кнопка блокируется и показывает подсказку */
  disabled: boolean
}

const SPEC_DISABLED_HINT =
  'Исправьте ошибки в схеме или завершите сценарий в чате, чтобы выбрать формат и скачать ТЗ'

const MARKDOWN_MIME = 'text/markdown;charset=UTF-8'
const DOCX_MIME =
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document'

/** Кнопка «Сгенерировать ТЗ» с выбором формата выгрузки */
export default function SpecExportButton({ xml, disabled }: SpecExportButtonProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  // Закрытие меню по клику вне него и по Escape
  useEffect(() => {
    if (!isOpen) return

    const handlePointerDown = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) setIsOpen(false)
    }
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setIsOpen(false)
    }

    document.addEventListener('mousedown', handlePointerDown)
    document.addEventListener('keydown', handleKeyDown)

    return () => {
      document.removeEventListener('mousedown', handlePointerDown)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [isOpen])

  // Новая схема — прежняя ошибка к ней не относится
  useEffect(() => {
    setError(null)
  }, [xml])

  const handleDownload = async (format: 'md' | 'docx') => {
    if (disabled || isLoading) return

    setIsOpen(false)
    setIsLoading(true)
    setError(null)

    try {
      const spec = await generateSpecViaAI(xml)

      if (format === 'md') {
        downloadFile(spec, MARKDOWN_MIME, 'tech-spec.md')
      } else {
        downloadFile(buildDocxFromMarkdown(spec), DOCX_MIME, 'tech-spec.docx')
      }
    } catch (err) {
      console.error('Ошибка генерации ТЗ:', err)
      setError(err instanceof Error ? err.message : 'Не удалось сгенерировать ТЗ.')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <HintTooltip id="spec-export-hint" text={SPEC_DISABLED_HINT} visible={disabled}>
      <div ref={containerRef} className="relative">
        <button
          type="button"
          onClick={() => setIsOpen((open) => !open)}
          disabled={disabled || isLoading}
          aria-haspopup="menu"
          aria-expanded={isOpen}
          aria-describedby={disabled ? 'spec-export-hint' : undefined}
          className="flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:border-slate-400 hover:bg-slate-50 active:bg-slate-100 disabled:cursor-not-allowed disabled:border-slate-200 disabled:bg-slate-200 disabled:text-slate-400"
        >
          {isLoading ? (
            <>
              <span className="pointer-events-none h-3.5 w-3.5 animate-spin rounded-full border-2 border-slate-300 border-t-blue-600" />
              <span className="pointer-events-none">Аналитик пишет ТЗ…</span>
            </>
          ) : (
            <>
              <span className="pointer-events-none">Сгенерировать ТЗ</span>
              <svg
                viewBox="0 0 16 16"
                aria-hidden="true"
                className={`pointer-events-none h-3.5 w-3.5 transition-transform duration-150 ${
                  isOpen ? 'rotate-180' : ''
                }`}
              >
                <path
                  d="M4 6.5 8 10.5 12 6.5"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.6"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </>
          )}
        </button>

        {isOpen && !disabled && (
          <div
            role="menu"
            className="absolute right-0 top-full z-20 mt-2 w-max overflow-hidden rounded-lg border border-slate-200 bg-white py-1 shadow-lg"
          >
            <button
              type="button"
              role="menuitem"
              onClick={() => handleDownload('md')}
              className="flex w-full items-center gap-2 whitespace-nowrap px-3 py-2 text-left text-sm text-slate-700 transition hover:bg-slate-50"
            >
              📄 Скачать в формате Markdown (.md)
            </button>
            <button
              type="button"
              role="menuitem"
              onClick={() => handleDownload('docx')}
              className="flex w-full items-center gap-2 whitespace-nowrap px-3 py-2 text-left text-sm text-slate-700 transition hover:bg-slate-50"
            >
              📝 Скачать в формате Word (.docx)
            </button>
          </div>
        )}

        {error && (
          <div className="absolute right-0 top-full z-20 mt-2 w-72 rounded-lg border border-red-200 bg-red-50 px-3 py-2 shadow-lg">
            <p className="text-xs font-medium text-red-700">Ошибка генерации ТЗ</p>
            <p className="mt-1 text-[11px] leading-snug text-red-600/80">{error}</p>
          </div>
        )}
      </div>
    </HintTooltip>
  )
}
