import { describe, expect, it } from "vitest";
import { buildTable, cleanHeaders, findHeaderRow, stem } from "../src/audit/tables";

describe("table building", () => {
  it("skips title rows above the header", () => {
    const built = buildTable("orders", "orders.csv", [
      ["Order export", null, null],
      ["Generated 2024-05-01", null, null],
      ["order_id", "amount", "status"],
      ["1", "10", "paid"],
    ]);
    expect(built.headerRow).toBe(2);
    expect(built.columns).toEqual(["order_id", "amount", "status"]);
    expect(built.rows).toEqual([["1", "10", "paid"]]);
  });

  it("renames blank and repeated headers and records the originals", () => {
    const { columns, renamed } = cleanHeaders(["id", " name ", null, "id"]);
    expect(columns).toEqual(["id", "name", "unnamed_3", "id_2"]);
    expect(renamed).toEqual(
      new Map([
        ["name", " name "],
        ["unnamed_3", ""],
        ["id_2", "id"],
      ]),
    );
  });

  it("defaults to the first row when every row is full", () => {
    expect(
      findHeaderRow([
        ["a", "b"],
        ["1", "2"],
      ]),
    ).toBe(0);
  });

  it("drops empty rows and pads short ones", () => {
    const built = buildTable("t", "t.csv", [["a", "b"], [null, ""], ["1"]]);
    expect(built.rows).toEqual([["1", null]]);
  });

  it("names tables after the file without its suffix", () => {
    expect(stem("Sales [2024].csv")).toBe("Sales [2024]");
    expect(stem(".csv")).toBe(".csv");
  });
});
