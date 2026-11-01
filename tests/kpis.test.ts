import { describe, expect, it } from "vitest";
import { suggest } from "../src/audit/kpis";
import { context } from "./helpers/context";

describe("metric suggestions", () => {
  it("suggests revenue, order value and cohorts for an orders table", () => {
    const orders = context(
      ["order_id", "order_date", "customer_id", "amount"],
      Array.from({ length: 30 }, (_, i) => [
        String(i),
        `2024-01-0${1 + (i % 9)}`,
        `C${i % 4}`,
        "10.50",
      ]),
      "orders",
    );
    expect(suggest([orders]).map((s) => s.name)).toEqual([
      "Revenue and orders by month",
      "Average order value and repeat purchase rate",
      "Customer cohort retention",
    ]);
  });

  it("suggests billing and hours for invoices and timesheets", () => {
    const invoices = context(
      ["invoice_id", "issued", "amount", "paid_on"],
      Array.from({ length: 5 }, (_, i) => [`I${i}`, "2024-02-01", "100", "2024-02-10"]),
      "invoices",
    );
    const timesheets = context(
      ["date", "client_id", "hours"],
      Array<string[]>(5).fill(["2024-02-01", "C1", "3.5"]),
      "timesheets",
    );
    const suggestions = suggest([invoices, timesheets]);
    expect(new Set(suggestions.map((s) => s.name))).toEqual(
      new Set(["Billed vs collected, and days to pay", "Billable hours and utilisation"]),
    );
    expect(suggestions[0]?.why).toBe(
      "issued and amount give billing by month; paid_on shows what was collected.",
    );
  });
});
