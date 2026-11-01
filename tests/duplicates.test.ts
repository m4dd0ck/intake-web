import { describe, expect, it } from "vitest";
import { check, likelySame } from "../src/audit/checks/duplicates";
import { byCode, codes, context } from "./helpers/context";

describe("duplicates check", () => {
  it("counts exact copies, ignoring stray spaces", () => {
    const found = check(
      context(
        ["order_id", "amount"],
        [
          ["1", "5"],
          ["1", "5"],
          ["2", "7"],
          ["1", "5 "],
        ],
      ),
    );
    expect(byCode(found, "duplicate_rows").affected_rows).toBe(2);
  });

  it("flags IDs on rows that disagree, not plain copies", () => {
    const rows = [
      ...Array.from({ length: 40 }, (_, i) => [String(i), "10"]),
      ["3", "10"],
      ["7", "99"],
    ];
    const found = check(context(["order_id", "amount"], rows));
    expect(codes(found)).toEqual(new Set(["duplicate_rows", "duplicate_keys"]));
    const keys = byCode(found, "duplicate_keys");
    expect(keys.examples).toEqual(["7"]);
    expect(keys.severity).toBe("critical");
  });

  it("ignores foreign keys that repeat by design", () => {
    const rows = Array.from({ length: 50 }, (_, i) => [String(i), `C${i % 5}`]);
    expect(check(context(["order_id", "customer_id"], rows))).toEqual([]);
  });

  it("finds email case variants and similar names", () => {
    const found = check(
      context(
        ["customer_name", "email"],
        [
          ["Harbor Supply Co", "ops@harbor.com"],
          ["Harbour Supply Co", "OPS@harbor.com"],
          ["Maple Studio", "hi@maple.io"],
        ],
      ),
    );
    const near = found.filter((f) => f.code === "near_duplicate_records");
    expect(new Set(near.map((f) => f.column))).toEqual(new Set(["customer_name", "email"]));
  });

  it("does not treat names that differ only by a number as duplicates", () => {
    expect(check(context(["product_name"], [["Item 1"], ["Item 11"], ["Item 2"]]))).toEqual([]);
    expect(likelySame("Grace Pine", "Grace Pne")).toBe(true);
  });
});
