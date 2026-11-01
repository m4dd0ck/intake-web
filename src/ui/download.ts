/** Save generated text as a file, entirely in the browser (a Blob URL, not a request). */
export function downloadText(fileName: string, text: string, type: string): void {
  downloadBlob(fileName, new Blob([text], { type }));
}

export function downloadBlob(fileName: string, blob: Blob): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.append(link);
  link.click();
  link.remove();
  // Reason: revoke on the next task so the browser has started the download first.
  setTimeout(() => {
    URL.revokeObjectURL(url);
  }, 0);
}

/** `Acme Ltd.` -> `acme-ltd`, for file names. */
export function slug(text: string): string {
  const cleaned = text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return cleaned || "client";
}
