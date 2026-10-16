/**
 * Скачивание файла через временную ссылку на Blob.
 * Blob выбран вместо data-URI: содержимое может быть бинарным (.docx) или
 * содержать символы «#» (цвета и ссылки url(#…)) в SVG — в data-URI их
 * пришлось бы экранировать, а сам файл может быть большим.
 */
export function downloadFile(
  content: BlobPart,
  mimeType: string,
  fileName: string,
): void {
  const url = URL.createObjectURL(new Blob([content], { type: mimeType }))

  const link = document.createElement('a')
  link.href = url
  link.download = fileName
  document.body.appendChild(link)
  link.click()
  link.remove()

  // Отзываем ссылку после того, как браузер поставил загрузку в очередь
  setTimeout(() => URL.revokeObjectURL(url), 0)
}
