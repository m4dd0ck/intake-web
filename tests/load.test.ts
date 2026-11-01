import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";
import { cellText, excelDateText, readWorkbook } from "../src/load/excel";
import { loadFiles, type InputFile } from "../src/load/files";
import { nodeEngine } from "./helpers/node-engine";

const text = (name: string, content: string): InputFile => ({
  name,
  bytes: new TextEncoder().encode(content),
});

// Reason: SheetJS types its zip helper as `any`; this is the part the hostile-sheet test uses.
interface ZipEntry {
  content?: Uint8Array;
}
interface ZipLibrary {
  read(bytes: Uint8Array, options: { type: "array" }): object;
  find(zip: object, path: string): ZipEntry | null;
  write(zip: object, options: { fileType: "zip"; type: "array" }): number[];
}
const CFB = XLSX.CFB as ZipLibrary;

function workbook(sheets: Record<string, XLSX.WorkSheet>): Uint8Array {
  const book = XLSX.utils.book_new();
  for (const [title, sheet] of Object.entries(sheets))
    XLSX.utils.book_append_sheet(book, sheet, title);
  return new Uint8Array(XLSX.write(book, { type: "array", bookType: "xlsx" }) as ArrayBuffer);
}

describe("CSV loading through DuckDB", () => {
  it("reads every cell as text and skips title rows", async () => {
    const { tables } = await loadFiles(
      [
        text(
          "orders.csv",
          "Order export,,\nGenerated 2024-05-01,,\norder_id,amount,status\n1,10.50,paid\n",
        ),
      ],
      await nodeEngine(),
    );
    expect(tables[0]).toMatchObject({
      name: "orders",
      source: "orders.csv",
      headerRow: 2,
      columns: ["order_id", "amount", "status"],
      rows: [["1", "10.50", "paid"]],
    });
  });

  it("reads a file whose name looks like a glob", async () => {
    const { tables } = await loadFiles([text("Sales [2024].csv", "id\n1\n")], await nodeEngine());
    expect(tables.map((t) => [t.name, t.rows])).toEqual([["Sales [2024]", [["1"]]]]);
  });

  it("lists unsupported and unreadable files without stopping the rest", async () => {
    const result = await loadFiles(
      [
        text("notes.pdf", "%PDF"),
        text("orders.csv", "id\n1\n"),
        text("broken.csv", 'a,b\n"unterminated\n'),
      ],
      await nodeEngine(),
    );
    expect(result.tables.map((t) => t.name)).toContain("orders");
    expect(result.skipped.map((s) => s.file)).toContain("notes.pdf");
  });

  it("sorts files by name like a folder listing", async () => {
    const { tables } = await loadFiles(
      [text("b.csv", "x\n1\n"), text("a.csv", "x\n1\n")],
      await nodeEngine(),
    );
    expect(tables.map((t) => t.name)).toEqual(["a", "b"]);
  });
});

describe("Excel loading through SheetJS", () => {
  it("loads each sheet separately with dates as ISO text", async () => {
    const first = XLSX.utils.aoa_to_sheet([
      ["Invoices", null],
      ["invoice_id", "issued"],
    ]);
    XLSX.utils.sheet_add_aoa(first, [["A-1", { t: "n", v: 45720, z: "yyyy-mm-dd" }]], {
      origin: "A3",
    });
    const second = XLSX.utils.aoa_to_sheet([
      ["invoice_id", "issued"],
      ["B-1", 46000],
    ]);
    const bytes = workbook({ "2025": first, "2026": second });
    const { tables } = await loadFiles([{ name: "invoices.xlsx", bytes }], await nodeEngine());
    expect(tables.map((t) => t.name)).toEqual(["invoices/2025", "invoices/2026"]);
    expect(tables[0]?.rows).toEqual([["A-1", "2025-03-04"]]);
    expect(tables[1]?.rows).toEqual([["B-1", "46000"]]);
  });

  it("writes cells the way openpyxl's values print", () => {
    expect(cellText({ t: "b", v: true }, false)).toBe("True");
    expect(cellText({ t: "n", v: 12 }, false)).toBe("12");
    expect(cellText({ t: "n", v: 0.00001 }, false)).toBe("1e-05");
    expect(cellText({ t: "s", v: "" }, false)).toBeNull();
    expect(cellText({ t: "e", v: 42, w: "#N/A" }, false)).toBe("#N/A");
    expect(excelDateText(45412.5, false)).toBe("2024-04-30 12:00:00");
    expect(excelDateText(0.25, false)).toBe("06:00:00");
  });

  it("reads only real cells from a sheet that declares a huge size", () => {
    const bytes = workbook({
      Sheet1: XLSX.utils.aoa_to_sheet([
        ["id", "value"],
        ["1", "a"],
      ]),
    });
    // Rewrite the sheet XML to declare the largest possible range, as a hostile file could.
    const zip = CFB.read(bytes, { type: "array" });
    const entry = CFB.find(zip, "/xl/worksheets/sheet1.xml");
    if (!entry?.content) throw new Error("sheet XML not found");
    const xml = new TextDecoder().decode(entry.content);
    const hostile = xml.replace(/<dimension ref="[^"]+"\s*\/>/, '<dimension ref="A1:XFD1048576"/>');
    expect(hostile).not.toBe(xml);
    entry.content = new TextEncoder().encode(hostile);
    const rewritten = CFB.write(zip, { fileType: "zip", type: "array" });
    const sheets = readWorkbook(new Uint8Array(rewritten));
    expect(sheets[0]?.rows).toEqual([
      ["id", "value"],
      ["1", "a"],
    ]);
  });
});
