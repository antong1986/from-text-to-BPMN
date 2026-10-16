/**
 * Сборка .docx (OOXML) из Markdown-текста ТЗ без внешних зависимостей.
 *
 * Пакет .docx — это ZIP. Здесь он собирается способом STORE (без сжатия):
 * так не нужен ни zlib, ни CompressionStream, а CRC32 считается вручную.
 */

type Block =
  | { kind: 'heading'; level: number; text: string }
  | { kind: 'bullet'; text: string }
  | { kind: 'number'; marker: string; text: string }
  | { kind: 'paragraph'; text: string }

type Run = { text: string; bold?: boolean; italic?: boolean; mono?: boolean }

type ZipEntry = { name: string; data: Uint8Array }

const CRC_TABLE = (() => {
  const table = new Uint32Array(256)
  for (let index = 0; index < 256; index += 1) {
    let value = index
    for (let bit = 0; bit < 8; bit += 1) {
      value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1
    }
    table[index] = value >>> 0
  }
  return table
})()

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff
  for (const byte of bytes) {
    crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8)
  }
  return (crc ^ 0xffffffff) >>> 0
}

const encode = (value: string): Uint8Array => new TextEncoder().encode(value)

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/** ZIP со способом STORE: локальные заголовки, центральный каталог, EOCD */
function buildZip(entries: ZipEntry[]): Uint8Array<ArrayBuffer> {
  const localParts: Uint8Array[] = []
  const centralParts: Uint8Array[] = []
  let offset = 0

  entries.forEach((entry) => {
    const nameBytes = encode(entry.name)
    const crc = crc32(entry.data)
    const size = entry.data.length

    const local = new Uint8Array(30 + nameBytes.length)
    const localView = new DataView(local.buffer)
    localView.setUint32(0, 0x04034b50, true) // сигнатура локального заголовка
    localView.setUint16(4, 20, true) // требуемая версия
    localView.setUint16(6, 0x0800, true) // имена файлов в UTF-8
    localView.setUint16(8, 0, true) // метод 0 = STORE
    localView.setUint16(12, 0x0021, true) // дата 1980-01-01 (DOS-формат)
    localView.setUint32(14, crc, true)
    localView.setUint32(18, size, true)
    localView.setUint32(22, size, true)
    localView.setUint16(26, nameBytes.length, true)
    local.set(nameBytes, 30)

    localParts.push(local, entry.data)

    const central = new Uint8Array(46 + nameBytes.length)
    const centralView = new DataView(central.buffer)
    centralView.setUint32(0, 0x02014b50, true) // сигнатура записи каталога
    centralView.setUint16(4, 20, true) // версия создателя
    centralView.setUint16(6, 20, true) // требуемая версия
    centralView.setUint16(8, 0x0800, true)
    centralView.setUint16(14, 0x0021, true) // дата 1980-01-01 (DOS-формат)
    centralView.setUint32(16, crc, true)
    centralView.setUint32(20, size, true)
    centralView.setUint32(24, size, true)
    centralView.setUint16(28, nameBytes.length, true)
    centralView.setUint32(42, offset, true)
    central.set(nameBytes, 46)

    centralParts.push(central)
    offset += local.length + size
  })

  const centralSize = centralParts.reduce((sum, part) => sum + part.length, 0)

  const end = new Uint8Array(22)
  const endView = new DataView(end.buffer)
  endView.setUint32(0, 0x06054b50, true) // сигнатура EOCD
  endView.setUint16(8, entries.length, true)
  endView.setUint16(10, entries.length, true)
  endView.setUint32(12, centralSize, true)
  endView.setUint32(16, offset, true)

  const parts = [...localParts, ...centralParts, end]
  const total = parts.reduce((sum, part) => sum + part.length, 0)

  const zip = new Uint8Array(total)
  let cursor = 0
  parts.forEach((part) => {
    zip.set(part, cursor)
    cursor += part.length
  })

  return zip
}

/** Разбор строк Markdown в абзацы: заголовки, списки, обычный текст */
function parseBlocks(markdown: string): Block[] {
  const blocks: Block[] = []

  markdown.split(/\r?\n/).forEach((rawLine) => {
    const line = rawLine.trim()
    if (!line) return

    const heading = /^(#{1,4})\s+(.*)$/.exec(line)
    if (heading) {
      blocks.push({ kind: 'heading', level: heading[1].length, text: heading[2] })
      return
    }

    const bullet = /^[-*+]\s+(.*)$/.exec(line)
    if (bullet) {
      blocks.push({ kind: 'bullet', text: bullet[1] })
      return
    }

    const numbered = /^(\d+[.)])\s+(.*)$/.exec(line)
    if (numbered) {
      blocks.push({ kind: 'number', marker: numbered[1], text: numbered[2] })
      return
    }

    const quote = /^>\s?(.*)$/.exec(line)
    blocks.push({ kind: 'paragraph', text: quote ? quote[1] : line })
  })

  return blocks
}

/** Разбор инлайновой разметки: **жирный**, *курсив*, `код` */
function parseRuns(text: string): Run[] {
  const runs: Run[] = []
  const pattern = /\*\*[^*]+\*\*|__[^_]+__|`[^`]+`|\*[^*]+\*/g
  let lastIndex = 0
  let match: RegExpExecArray | null

  while ((match = pattern.exec(text)) !== null) {
    if (match.index > lastIndex) {
      runs.push({ text: text.slice(lastIndex, match.index) })
    }

    const token = match[0]
    if (token.startsWith('**') || token.startsWith('__')) {
      runs.push({ text: token.slice(2, -2), bold: true })
    } else if (token.startsWith('`')) {
      runs.push({ text: token.slice(1, -1), mono: true })
    } else {
      runs.push({ text: token.slice(1, -1), italic: true })
    }

    lastIndex = match.index + token.length
  }

  if (lastIndex < text.length) {
    runs.push({ text: text.slice(lastIndex) })
  }

  return runs
}

function runXml(run: Run, extraProps = ''): string {
  const props = [
    extraProps,
    run.bold ? '<w:b/>' : '',
    run.italic ? '<w:i/>' : '',
    run.mono ? '<w:rFonts w:ascii="Consolas" w:hAnsi="Consolas"/>' : '',
  ].join('')

  const properties = props ? `<w:rPr>${props}</w:rPr>` : ''

  return `<w:r>${properties}<w:t xml:space="preserve">${escapeXml(run.text)}</w:t></w:r>`
}

/** Размеры заголовков в полупунктах (Word измеряет шрифт так же) */
const HEADING_SIZES = [0, 32, 28, 26, 24]

function blockXml(block: Block): string {
  if (block.kind === 'heading') {
    const size = HEADING_SIZES[Math.min(block.level, 4)]
    const runs = parseRuns(block.text)
      .map((run) => runXml(run, `<w:b/><w:sz w:val="${size}"/><w:szCs w:val="${size}"/>`))
      .join('')

    return `<w:p><w:pPr><w:spacing w:before="280" w:after="140"/></w:pPr>${runs}</w:p>`
  }

  if (block.kind === 'bullet' || block.kind === 'number') {
    // Маркер рисуем текстом: так не нужен numbering.xml с определениями списков
    const marker = block.kind === 'bullet' ? '•' : block.marker
    const runs = [
      runXml({ text: `${marker}\t` }),
      ...parseRuns(block.text).map((run) => runXml(run)),
    ].join('')

    return `<w:p><w:pPr><w:ind w:left="360" w:hanging="180"/><w:spacing w:after="80"/></w:pPr>${runs}</w:p>`
  }

  const runs = parseRuns(block.text).map((run) => runXml(run)).join('')
  return `<w:p><w:pPr><w:spacing w:after="140"/></w:pPr>${runs}</w:p>`
}

const CONTENT_TYPES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
<Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>
</Types>`

const ROOT_RELS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`

const DOCUMENT_RELS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`

const STYLES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
<w:docDefaults>
<w:rPrDefault>
<w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri" w:cs="Calibri"/><w:sz w:val="22"/><w:szCs w:val="22"/></w:rPr>
</w:rPrDefault>
</w:docDefaults>
</w:styles>`

/** Собирает .docx из Markdown: заголовки, списки, жирный текст и код */
export function buildDocxFromMarkdown(markdown: string): Uint8Array<ArrayBuffer> {
  const body = parseBlocks(markdown).map(blockXml).join('')

  const document = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
<w:body>${body}<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1134" w:right="850" w:bottom="1134" w:left="1701"/></w:sectPr></w:body>
</w:document>`

  return buildZip([
    { name: '[Content_Types].xml', data: encode(CONTENT_TYPES) },
    { name: '_rels/.rels', data: encode(ROOT_RELS) },
    { name: 'word/_rels/document.xml.rels', data: encode(DOCUMENT_RELS) },
    { name: 'word/styles.xml', data: encode(STYLES) },
    { name: 'word/document.xml', data: encode(document) },
  ])
}
