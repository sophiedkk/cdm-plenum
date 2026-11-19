// SPDX-FileCopyrightText: Sophie de Klerk
// SPDX-License-Identifier: Apache-2.0

/** A generated export as the server function returns it (`ExportFile`). */
export interface DownloadFile {
  filename: string;
  mediaType: string;
  content: string;
}

/**
 * Offers `file` to the browser as a download with the server's file name. The text becomes
 * UTF-8, so a byte order mark at its start stays in the file.
 */
export function saveFile(file: DownloadFile): void {
  const url = URL.createObjectURL(new Blob([file.content], { type: file.mediaType }));
  const link = document.createElement("a");
  link.href = url;
  link.download = file.filename;
  link.style.display = "none";
  document.body.append(link);
  link.click();
  link.remove();
  // The click has handed the file to the browser; the next task may release it.
  setTimeout(() => URL.revokeObjectURL(url), 0);
}
