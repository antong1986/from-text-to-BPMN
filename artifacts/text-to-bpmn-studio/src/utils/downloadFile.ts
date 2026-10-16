export function downloadFile(content: BlobPart, mimeType: string, fileName: string): void {
  const url = URL.createObjectURL(new Blob([content], {type:mimeType}));
  const link = document.createElement('a'); link.href = url; link.download = fileName;
  document.body.appendChild(link); link.click(); link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}
