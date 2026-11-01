import { describe, expect, it } from "vitest";
import { analyseColumn, isBlank, parseDate, parseNumber, valueKind } from "../src/audit/kinds";

describe("valueKind", () => {
  it.each([
    ["42", "integer"],
    ["1,234.50", "decimal"],
    ["$1,234.50", "currency"],
    ["12.00 €", "currency"],
    ["USD 99", "currency"],
    ["7.5%", "percent"],
    ["2024-03-04", "date_iso"],
    ["2024-03-04 10:15", "datetime"],
    ["3/4/2024", "date_slash"],
    ["04.03.2024", "date_dot"],
    ["Mar 4, 2024", "date_text"],
    ["yes", "boolean"],
    ["ana@shop.com", "email"],
    ["Blue mug", "text"],
  ])("%s is %s", (value, kind) => {
    expect(valueKind(value)).toBe(kind);
  });
});

describe("parsing", () => {
  it.each([null, "", " ", "N/A", "null", "-", "?"])("treats %j as blank", (value) => {
    expect(isBlank(value)).toBe(true);
  });

  it("parses currency, thousands and percent", () => {
    expect(parseNumber("$1,234.50")).toBe(1234.5);
    expect(parseNumber("-12")).toBe(-12);
    expect(parseNumber("7.5%")).toBeCloseTo(0.075);
    expect(parseNumber("abc")).toBeNull();
  });

  it("reads slash dates as US unless the day is first", () => {
    expect(parseDate("3/4/2024")).toBe("2024-03-04");
    expect(parseDate("25/4/2024")).toBe("2024-04-25");
    expect(parseDate("Mar 4, 2024")).toBe("2024-03-04");
    expect(parseDate("2024-02-30")).toBeNull();
  });
});

describe("analyseColumn", () => {
  it("classifies columns by their majority kind and name", () => {
    expect(analyseColumn("order_date", ["2024-01-01", "1/2/2024", "N/A"]).kind).toBe("date");
    expect(analyseColumn("amount", ["$5.00", "6.50", "7"]).kind).toBe("currency");
    expect(
      analyseColumn(
        "order_id",
        Array.from({ length: 50 }, (_, i) => String(i)),
      ).kind,
    ).toBe("id");
    expect(analyseColumn("country", Array<string[]>(30).fill(["US", "GB"]).flat()).kind).toBe(
      "category",
    );
  });

  it("counts placeholders apart from real values", () => {
    const column = analyseColumn("note", ["x", "N/A", null]);
    expect(column.blankTokens).toEqual(new Map([["N/A", 1]]));
    expect(column.nonBlank).toBe(1);
  });
});
