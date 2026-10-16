import type { ReactNode } from 'react'

type HintTooltipProps = {
  /** Текст подсказки */
  text: string
  /** Показывать ли подсказку при наведении */
  visible: boolean
  /** id подсказки — на него ссылается aria-describedby у кнопки */
  id: string
  children: ReactNode
}

/**
 * Единый паттерн подсказки для кнопок шапки панели.
 *
 * Обёртка не блокируется, поэтому hover срабатывает даже когда внутри лежит
 * disabled-кнопка (у неё самой браузер подавляет события мыши).
 */
export default function HintTooltip({ text, visible, id, children }: HintTooltipProps) {
  return (
    <div className="group relative">
      {children}

      {visible && (
        <span
          id={id}
          role="tooltip"
          className="pointer-events-none absolute right-0 top-full z-20 mt-2 w-64 rounded-lg bg-slate-800 px-3 py-2 text-xs leading-snug text-white opacity-0 shadow-lg transition-opacity duration-150 group-hover:opacity-100"
        >
          {text}
          <span className="absolute -top-1 right-6 h-2 w-2 rotate-45 bg-slate-800" />
        </span>
      )}
    </div>
  )
}
