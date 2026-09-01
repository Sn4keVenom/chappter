// src/utils/csv.ts
//
// Turn a table of values into a CSV file and hand it to the browser as a
// download. Excel, Numbers, and Google Sheets all open the result directly;
// the leading BOM is what makes Excel read it as UTF-8 rather than mojibake.

/** Quote a single field when it contains a comma, quote, or newline. */
function escapeField(value: unknown): string {
  const str = value == null ? "" : String(value);
  return /[",\n\r]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
}

/** Serialize rows (first row usually the header) into a CSV string. */
export function toCsv(rows: readonly (readonly unknown[])[]): string {
  return rows.map((row) => row.map(escapeField).join(",")).join("\r\n");
}

/**
 * Trigger a download of `rows` as `<filename>.csv`. Mirrors the blob-URL
 * approach in downloadIcs — the object URL is revoked on the next tick so the
 * blob does not leak for the lifetime of the document.
 */
export function downloadCsv(filename: string, rows: readonly (readonly unknown[])[]): void {
  const blob = new Blob(["﻿" + toCsv(rows)], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename.endsWith(".csv") ? filename : `${filename}.csv`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}
