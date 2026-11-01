import { describe, expect, it } from "vitest";
import { check } from "../src/audit/checks/outliers";
import { codes, context } from "./helpers/context";

describe("outliers check", () => {
  it("flags a value far outside the middle half", () => {
    const rows = [...Array.from({ length: 40 }, (_, i) => [String(20 + (i % 10))]), ["5000"]];
    const finding = check(context(["amount"], rows))[0];
    expect(finding?.code).toBe("outliers");
    expect(finding?.examples).toEqual(["5,000"]);
  });

  it("flags negatives only in amount-like columns", () => {
    const rows = [["10"], ["-4"], ["12"]];
    expect(codes(check(context(["amount"], rows)))).toEqual(new Set(["negative_amounts"]));
    expect(check(context(["temperature"], rows))).toEqual([]);
  });

  it("flags future and implausibly old dates", () => {
    const rows = [["2024-01-05"], ["2025-02-01"], ["1900-01-01"], ["2024-03-01"]];
    expect(codes(check(context(["order_date"], rows)))).toEqual(
      new Set(["future_dates", "implausible_dates"]),
    );
  });
});
