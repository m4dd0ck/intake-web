/**
 * Excel through SheetJS, turned into the text a person sees in each cell, the way DataIntake's
 * openpyxl loader does it: dates with a date format become ISO text, whole numbers lose ".0",
 * booleans read True/False and empty strings are empty cells.
 */

import * as XLSX from "xlsx";
import { MAX_COLUMNS, MAX_ROWS, type Row } from "../audit/tables";
import { floatRepr, intText } from "../audit/py";

// Reason: SheetJS types its bundled number-format library as `any`; this is the part we use.
interface DateFormatLibrary {
  is_date(format: string | number): boolean;
}
const SSF = XLSX.SSF as DateFormatLibrary;

const MS_PER_DAY = 86_400_000;
const WINDOWS_EPOCH = Date.UTC(1899, 11, 30);
const MAC_EPOCH = Date.UTC(1904, 0, 1);

export interface Sheet {
  title: string;
  rows: Row[];
}

function pad(value: number, width = 2): string {
  return String(value).padStart(width, "0");
}

/** openpyxl's `from_excel` rendered as `_cell_text` would print it. */
export function excelDateText(serial: number, is1904: boolean): string {
  const day = Math.floor(serial);
  const ms = Math.round((serial - day) * MS_PER_DAY);
  const time = (total: number): string => {
    const seconds = Math.floor(total / 1000);
    const fraction = total % 1000 ? `.${pad((total % 1000) * 1000, 6)}` : "";
    return `${pad(Math.floor(seconds / 3600))}:${pad(Math.floor(seconds / 60) % 60)}:${pad(seconds % 60)}${fraction}`;
  };
  if (serial >= 0 && serial < 1 && ms < MS_PER_DAY) return time(ms);
  // Reason: Excel's 1900 calendar has a fake 29 Feb 1900; openpyxl shifts serials below 60.
  const shift = !is1904 && serial > 0 && serial < 60 ? 1 : 0;
  const stamp = (is1904 ? MAC_EPOCH : WINDOWS_EPOCH) + (day + shift) * MS_PER_DAY + ms;
  const when = new Date(stamp);
  const date = `${pad(when.getUTCFullYear(), 4)}-${pad(when.getUTCMonth() + 1)}-${pad(when.getUTCDate())}`;
  const rest = stamp - Date.UTC(when.getUTCFullYear(), when.getUTCMonth(), when.getUTCDate());
  return rest === 0 ? date : `${date} ${time(rest)}`;
}

/** Cell value as the text a person would see, without reformatting numbers. */
export function cellText(cell: XLSX.CellObject | undefined, is1904: boolean): string | null {
  if (!cell || cell.v === undefined || cell.t === "z") return null;
  switch (cell.t) {
    case "b":
      return cell.v ? "True" : "False";
    case "e":
      return cell.w ?? null;
    case "n": {
      const value = Number(cell.v);
      if (cell.z !== undefined && SSF.is_date(cell.z)) return excelDateText(value, is1904);
      return Number.isInteger(value) ? intText(value) : floatRepr(value);
    }
    default: {
      const text = cell.v instanceof Date ? cell.v.toISOString() : String(cell.v);
      return text === "" ? null : text;
    }
  }
}

/** Every worksheet (not chart sheet) as text rows; limits as DataIntake applies them. */
export function readWorkbook(bytes: Uint8Array): Sheet[] {
  // Reason: dense + nodim so a sheet that declares A1:XFD1048576 costs only its real cells.
  const workbook = XLSX.read(bytes, {
    type: "array",
    dense: true,
    nodim: true,
    cellNF: true,
    cellDates: false,
    cellFormula: false,
    cellHTML: false,
  });
  const is1904 = Boolean(workbook.Workbook?.WBProps?.date1904);
  const sheets: Sheet[] = [];
  for (const title of workbook.SheetNames) {
    const sheet = workbook.Sheets[title];
    if (!sheet || sheet["!type"] === "chart") continue;
    const data = (sheet["!data"] ?? []) as (XLSX.CellObject[] | undefined)[];
    const rows: Row[] = [];
    for (let r = 0; r < data.length && rows.length <= MAX_ROWS; r += 1) {
      const cells = data[r] ?? [];
      const width = Math.min(cells.length, MAX_COLUMNS + 1);
      const row: Row = [];
      for (let c = 0; c < width; c += 1) row.push(cellText(cells[c], is1904));
      rows.push(row);
    }
    sheets.push({ title, rows });
  }
  return sheets;
}
