import mammoth from "mammoth";

const MAX_FILTERED_CHARS = 24_000;
const SMALL_DOCUMENT_WORD_LIMIT = 2_000;
const SECTION_CONTEXT_BEFORE = 1;
const SECTION_CONTEXT_AFTER = 16;

const sectionMarker =
  /бизнес[\s-]?процесс|алгоритм|user\s*story|сценар(?:ий|ии|иев)|шаги|требования|вариант[ыа]?\s+использования|use cases?|acceptance criteria/i;

const metadataLine =
  /^(?:автор|создано(?: пользователем)?|дата создания|дата изменения|последнее изменение|имя файла|author|created by|last modified|file name|version|версия)\s*[:—-]/i;
const pageFooter = /^(?:page|страница)\s+\d+(?:\s*(?:of|из)\s+\d+)?$/i;

function decodeTextFile(bytes: Uint8Array): string {
  const utf8 = new TextDecoder("utf-8").decode(bytes);
  if (!utf8.includes("\uFFFD")) return utf8;
  return new TextDecoder("windows-1251").decode(bytes);
}

function cleanText(text: string): string {
  const lines = text
    .replace(/^\uFEFF/, "")
    .replace(/\r\n?/g, "\n")
    .replace(/\f/g, "\n")
    .replace(/\0/g, "")
    .split("\n")
    .map((line) => line.replace(/\t/g, " ").replace(/[ ]{2,}/g, " ").trim())
    .filter((line) => !metadataLine.test(line) && !pageFooter.test(line));

  const compact: string[] = [];
  for (const line of lines) {
    if (!line && (!compact.length || !compact.at(-1))) continue;
    compact.push(line);
  }
  return compact.join("\n").trim();
}

function truncateAtWordBoundary(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text;
  const prefix = text.slice(0, maxChars);
  const boundary = prefix.lastIndexOf(" ");
  return `${prefix.slice(0, boundary > maxChars * 0.8 ? boundary : maxChars).trimEnd()}… [текст сокращён]`;
}

function filterLongDocument(text: string): string {
  const lines = text.split("\n");
  const markerIndexes = lines.flatMap((line, index) => sectionMarker.test(line) ? [index] : []);
  if (!markerIndexes.length) return truncateAtWordBoundary(text, MAX_FILTERED_CHARS);

  const ranges: Array<{start:number;end:number}> = [];
  for (const index of markerIndexes) {
    const start = Math.max(0, index - SECTION_CONTEXT_BEFORE);
    const end = Math.min(lines.length, index + SECTION_CONTEXT_AFTER + 1);
    const previous = ranges.at(-1);
    if (previous && start <= previous.end) previous.end = Math.max(previous.end, end);
    else ranges.push({start,end});
  }

  const selected = ranges.map(({start,end}) => lines.slice(start,end).join("\n"));
  return truncateAtWordBoundary(selected.join("\n\n…\n\n"), MAX_FILTERED_CHARS);
}

/**
 * Extracts usable process text from plain-text or Word documents and removes
 * common document noise before the description is sent to the AI provider.
 */
export async function extractAndFilterText(
  fileBytes: Uint8Array,
  fileExtension: string,
): Promise<string> {
  const extension = fileExtension.toLowerCase().replace(/^\./, "");
  let extracted: string;

  if (extension === "txt") {
    extracted = decodeTextFile(fileBytes);
  } else if (extension === "docx") {
    if (fileBytes.length < 4 || fileBytes[0] !== 0x50 || fileBytes[1] !== 0x4b) {
      throw new Error("The uploaded file is not a valid DOCX archive.");
    }
    const result = await mammoth.extractRawText({buffer:Buffer.from(fileBytes)});
    extracted = result.value;
  } else {
    throw new Error("Only .docx and .txt files are supported.");
  }

  const cleaned = cleanText(extracted);
  if (!cleaned) throw new Error("The document does not contain readable text.");

  const wordCount = cleaned.split(/\s+/).filter(Boolean).length;
  if (wordCount <= SMALL_DOCUMENT_WORD_LIMIT && cleaned.length <= MAX_FILTERED_CHARS) {
    return cleaned;
  }
  return filterLongDocument(cleaned);
}
