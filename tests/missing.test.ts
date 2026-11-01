import { describe, expect, it } from "vitest";
import { check } from "../src/audit/checks/missing";
import { byCode, codes, context } from "./helpers/context";

describe("missing check", () => {
  it("reports placeholders with examples", () => {
    const found = check(context(["customer_id"], [["C1"], ["N/A"], ["-"], ["C2"], ["C3"], ["C4"]]));
    const placeholders = byCode(found, "blank_placeholders");
    expect(placeholders.affected_rows).toBe(2);
    expect(placeholders.examples).toEqual(["N/A", "-"]);
  });

  it("leaves mostly filled columns alone", () => {
    const rows = [...Array<string[]>(9).fill(["Leeds"]), [null]];
    expect(codes(check(context(["city"], rows)))).toEqual(new Set());
  });

  it("flags a high share of missing values", () => {
    const found = check(context(["phone"], [["1"], [null], [null], ["2"]]));
    expect(codes(found)).toEqual(new Set(["high_missing"]));
    expect(found[0]?.title).toBe("50% of values are missing");
    expect(found[0]?.severity).toBe("warning");
  });

  it("downgrades a mostly empty column to a note", () => {
    const found = check(context(["fax"], [["1"], [null], [null], [null]]));
    expect(byCode(found, "high_missing").severity).toBe("info");
  });
});
