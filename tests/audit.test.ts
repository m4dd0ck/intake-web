import { describe, expect, it } from "vitest";
import { runAudit, withoutExamples } from "../src/audit/audit";
import { buildTable } from "../src/audit/tables";

const orders = buildTable("orders", "orders.csv", [
  ["order_id", "order_date", "customer_id", "amount"],
  ["1", "2024-01-02", "C1", "$10.00"],
  ["2", "2024-01-03", "C2", "12.00"],
  ["2", "2024-01-03", "C2", "12.00"],
  ["3", "1/4/2024", "C9", "8.00"],
]);
const customers = buildTable("customers", "customers.csv", [
  ["customer_id", "name"],
  ["C1", "Ana"],
  ["C2", "Bo"],
]);

describe("runAudit", () => {
  it("profiles tables and puts the most severe findings first", () => {
    const audit = runAudit([customers, orders], "Test Co", "2024-06-30");
    expect(audit.tables.map((t) => t.name)).toEqual(["customers", "orders"]);
    const orderColumns = audit.tables[1]?.columns ?? [];
    expect(orderColumns.find((c) => c.name === "order_date")?.kind).toBe("date");
    expect(orderColumns.find((c) => c.name === "amount")).toMatchObject({
      minimum: "8.00",
      maximum: "12.00",
    });
    expect(audit.findings[0]?.severity).toBe("critical");
    const found = new Set(audit.findings.map((f) => f.code));
    for (const code of ["duplicate_rows", "mixed_date_formats", "numbers_as_text", "orphan_keys"]) {
      expect(found).toContain(code);
    }
    expect(audit.kpis.some((k) => k.name.startsWith("Revenue"))).toBe(true);
  });

  it("can drop every example value but keep the findings", () => {
    const people = buildTable("people", "people.csv", [["email"], ["ana@x.com"], ["ANA@x.com"]]);
    const audit = withoutExamples(runAudit([people], "Co", "2024-01-01"));
    expect(audit.findings.length).toBeGreaterThan(0);
    expect(audit.findings.every((f) => f.examples.length === 0)).toBe(true);
    expect(JSON.stringify(audit).toLowerCase()).not.toContain("ana@x.com");
  });
});
