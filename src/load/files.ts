/** Turn dropped files into tables: route by suffix, apply limits, collect what was skipped. */

import type { RawTable } from "../audit/models";
import { compareText } from "../audit/py";
import { MAX_FILE_BYTES, buildTable, checkShape, stem, suffix } from "../audit/tables";
import { readCsvRows, type CsvEngine } from "./csv";
import { readWorkbook } from "./excel";

export const CSV_SUFFIXES = new Set([".csv", ".txt"]);
export const EXCEL_SUFFIXES = new Set([".xlsx", ".xlsm"]);

export interface InputFile {
  name: string;
  bytes: Uint8Array;
}

export interface SkippedFile {
  file: string;
  reason: string;
}

export interface LoadResult {
  tables: RawTable[];
  skipped: SkippedFile[];
}

export type LoadProgress = (done: number, total: number, fileName: string) => void;

export function isSupported(fileName: string): boolean {
  const ending = suffix(fileName);
  return CSV_SUFFIXES.has(ending) || EXCEL_SUFFIXES.has(ending);
}

/** One table per CSV, one per non-empty Excel sheet (`book/sheet` when there are several). */
export async function loadFile(file: InputFile, engine: CsvEngine): Promise<RawTable[]> {
  if (file.bytes.byteLength > MAX_FILE_BYTES) {
    throw new Error(`${file.name} is over ${MAX_FILE_BYTES / 2 ** 20} MB`);
  }
  const ending = suffix(file.name);
  if (CSV_SUFFIXES.has(ending)) {
    const rows = await readCsvRows(engine, file.name, file.bytes);
    checkShape(file.name, rows);
    return [buildTable(stem(file.name), file.name, rows)];
  }
  if (EXCEL_SUFFIXES.has(ending)) {
    const sheets = readWorkbook(file.bytes);
    const tables: RawTable[] = [];
    for (const sheet of sheets) {
      checkShape(file.name, sheet.rows);
      if (!sheet.rows.some((row) => row.some((cell) => cell !== null))) continue;
      const name = sheets.length === 1 ? stem(file.name) : `${stem(file.name)}/${sheet.title}`;
      tables.push(buildTable(name, file.name, sheet.rows));
    }
    return tables;
  }
  throw new Error(`Unsupported file type: ${file.name}`);
}

/**
 * Load every supported file, in name order like DataIntake's folder listing. A file that
 * cannot be read is skipped with its reason instead of stopping the rest.
 */
export async function loadFiles(
  files: readonly InputFile[],
  engine: CsvEngine,
  onProgress?: LoadProgress,
): Promise<LoadResult> {
  const ordered = [...files].sort((a, b) => compareText(a.name, b.name));
  const tables: RawTable[] = [];
  const skipped: SkippedFile[] = [];
  for (const [index, file] of ordered.entries()) {
    onProgress?.(index, ordered.length, file.name);
    if (!isSupported(file.name)) {
      skipped.push({ file: file.name, reason: "not a CSV or Excel (.xlsx, .xlsm) file" });
      continue;
    }
    try {
      tables.push(...(await loadFile(file, engine)));
    } catch (error) {
      skipped.push({
        file: file.name,
        reason: error instanceof Error ? error.message : String(error),
      });
    }
  }
  onProgress?.(ordered.length, ordered.length, "");
  return { tables, skipped };
}
