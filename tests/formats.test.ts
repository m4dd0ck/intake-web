import { describe, expect, it } from "vitest";
import { check } from "../src/audit/checks/formats";
import { byCode, codes, context } from "./helpers/context";

describe("formats check", () => {
  it("reports dates written in several formats", () => {
    const finding = check(
      context(["order_date"], [["2024-03-04"], ["2024-03-05"], ["3/6/2024"]]),
    )[0];
    expect(finding?.code).toBe("mixed_date_formats");
    expect(finding?.affected_rows).toBe(1);
    expect(finding?.detail).toContain("2 like 2024-03-04, 1 like 03/04/2024");
  });

  it("reports currency text and mixed currencies", () => {
    const found = check(context(["price"], [["$10.00"], ["€12.50"], ["$1,200.00"], ["9.99"]]));
    expect(codes(found)).toEqual(new Set(["numbers_as_text", "mixed_currencies"]));
    const mixed = byCode(found, "mixed_currencies");
    expect(mixed.severity).toBe("critical");
    expect(mixed.detail).toBe("Found EUR, USD.");
    expect(mixed.examples).toEqual(["€12.50", "$10.00"]);
  });

  it("reports text inside a number column", () => {
    const rows = [...Array.from({ length: 20 }, (_, i) => [String(i)]), ["TBD"]];
    expect(byCode(check(context(["amount"], rows)), "non_numeric_values").examples).toEqual([
      "TBD",
    ]);
  });

  it("reports dates saved as Excel serial numbers", () => {
    const found = check(context(["issued"], [["45412"], ["45413"], ["45420"]]));
    expect(codes(found)).toContain("excel_serial_dates");
  });

  it("reports labels that differ only by case or spacing", () => {
    const rows = Array<string[][]>(10)
      .fill([["US"], ["us "], ["GB"], ["US"]])
      .flat();
    const found = check(context(["country"], rows));
    expect(codes(found)).toEqual(new Set(["inconsistent_labels", "stray_whitespace"]));
    expect(byCode(found, "inconsistent_labels").examples).toEqual(["'US' / 'us '"]);
  });

  it("says nothing about clean columns", () => {
    const rows = Array<string[][]>(10)
      .fill([
        ["2024-03-04", "10.50", "US"],
        ["2024-03-05", "8.00", "GB"],
      ])
      .flat();
    expect(check(context(["order_date", "amount", "country"], rows))).toEqual([]);
  });
});
