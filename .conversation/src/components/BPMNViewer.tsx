import { useEffect, useRef, useState } from 'react'
import BpmnModeler from 'bpmn-js/lib/Modeler'
import { downloadFile } from '../utils/downloadFile'

type CanvasLike = { zoom: (value: string | number) => void }

interface BPMNViewerProps {
  /** XML, который отрисовывается на холсте. При изменении холст перезагружается. */
  xml: string
}

export default function BPMNViewer({ xml }: BPMNViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const modelerRef = useRef<BpmnModeler | null>(null)
  const [exportError, setExportError] = useState<string | null>(null)
  const [renderError, setRenderError] = useState<string | null>(null)

  // Создание и уничтожение инстанса bpmn-js (не зависит от xml)
  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const modeler = new BpmnModeler({ container })
    modelerRef.current = modeler

    return () => {
      modeler.destroy()
      modelerRef.current = null
    }
  }, [])

  // Перерисовка холста при каждом изменении xml снаружи
  useEffect(() => {
    const modeler = modelerRef.current
    if (!modeler) return

    let disposed = false

    const render = async () => {
      try {
        await modeler.importXML(xml)
        // В StrictMode инстанс уничтожается до завершения importXML —
        // обновлять состояние уже размонтированного компонента нельзя
        if (disposed) return

        setRenderError(null)
        modeler.get<CanvasLike>('canvas').zoom('fit-viewport')
      } catch (err) {
        if (disposed) return

        console.error('Не удалось отрисовать BPMN-схему:', err)
        setRenderError('Ошибка рендеринга геометрии. Попробуйте ещё раз')
      }
    }

    render()

    return () => {
      disposed = true
    }
  }, [xml])

  const handleExportXml = async () => {
    const modeler = modelerRef.current
    if (!modeler) return

    setExportError(null)
    try {
      const { xml: savedXml } = await modeler.saveXML({ format: true })
      if (!savedXml) throw new Error('схема не содержит XML')

      downloadFile(savedXml, 'application/bpmn20-xml;charset=UTF-8', 'diagram.bpmn')
    } catch (err) {
      console.error('Не удалось экспортировать BPMN:', err)
      setExportError('Не удалось выгрузить BPMN. Проверьте, что диаграмма построена.')
    }
  }

  const handleExportSvg = async () => {
    const modeler = modelerRef.current
    if (!modeler) return

    setExportError(null)
    try {
      const { svg } = await modeler.saveSVG()
      if (!svg) throw new Error('схема не содержит SVG')

      downloadFile(svg, 'image/svg+xml;charset=UTF-8', 'diagram.svg')
    } catch (err) {
      console.error('Не удалось экспортировать SVG:', err)
      setExportError('Не удалось выгрузить SVG. Проверьте, что диаграмма построена.')
    }
  }

  return (
    <div className="relative h-full w-full overflow-hidden rounded-lg border border-slate-200 bg-white">
      <div ref={containerRef} className="h-full w-full" />

      {/* Схема дошла до bpmn-js, но DI-разметка не отрисовалась */}
      {renderError && (
        <div className="absolute left-1/2 top-3 z-10 -translate-x-1/2 rounded-md border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-medium text-red-700 shadow-sm">
          {renderError}
        </div>
      )}

      {/* Плавающая панель экспорта в центре нижней части холста */}
      <div className="absolute bottom-3 left-1/2 z-10 flex -translate-x-1/2 flex-col items-center gap-1.5">
        {exportError && (
          <p className="rounded-md bg-red-50 px-2 py-1 text-[11px] text-red-600 shadow-sm">
            {exportError}
          </p>
        )}
        <div className="flex gap-1 rounded-lg border border-slate-200 bg-white/95 p-1.5 shadow-md backdrop-blur">
          <button
            type="button"
            onClick={handleExportXml}
            className="rounded-md px-3 py-1.5 text-xs font-medium text-slate-600 transition hover:bg-slate-100 hover:text-slate-900"
          >
            📄 Скачать BPMN (XML)
          </button>
          <button
            type="button"
            onClick={handleExportSvg}
            className="rounded-md px-3 py-1.5 text-xs font-medium text-slate-600 transition hover:bg-slate-100 hover:text-slate-900"
          >
            🖼️ Скачать SVG
          </button>
        </div>
      </div>
    </div>
  )
}
