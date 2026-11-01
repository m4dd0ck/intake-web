import { describe, expect, it } from "vitest";
import { findJoins, keyName } from "../src/audit/relations";
import { context } from "./helpers/context";

describe("relations", () => {
  it("finds a foreign key join and its orphan values", () => {
    const clients = context(
      ["client_id", "name"],
      Array.from({ length: 10 }, (_, i) => [`C${i}`, `Client ${i}`]),
      "clients",
    );
    const timesheets = context(
      ["Client ID", "hours"],
      [
        ["C1", "2"],
        ["C2", "3"],
        ["C99", "1"],
        ["C1", "4"],
      ],
      "timesheets",
    );
    const { joins, findings } = findJoins([clients, timesheets]);
    const join = joins.find((j) => j.left_table === "timesheets");
    expect([join?.left_column, join?.right_table, join?.right_column]).toEqual([
      "Client ID",
      "clients",
      "client_id",
    ]);
    expect(join?.orphan_values).toBe(1);
    expect(join?.containment).toBe(0.667);
    expect(findings[0]?.code).toBe("orphan_keys");
    expect(findings[0]?.examples).toEqual(["c99"]);
  });

  it("does not join unrelated columns", () => {
    const orders = context(
      ["order_id", "country"],
      Array.from({ length: 10 }, (_, i) => [String(i), "US"]),
      "orders",
    );
    const products = context(
      ["sku", "price"],
      Array.from({ length: 10 }, (_, i) => [`S${i}`, "9"]),
      "products",
    );
    expect(findJoins([orders, products])).toEqual({ joins: [], findings: [] });
  });

  it("normalises key names", () => {
    expect(keyName("Client ID")).toBe("client");
    expect(keyName("customer_code")).toBe("customer");
  });
});
