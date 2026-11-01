/**
 * Which standard metrics the data can support, based on the shape of each table.
 *
 * Rule-based on purpose: a client should be able to read the "why" and see which columns make
 * a metric possible.
 */

import type { TableContext } from "./context";
import type { KpiSuggestion } from "./models";

const CUSTOMER = /(customer|client|account|buyer)/i;
const AMOUNT = /(amount|total|price|revenue|value|subtotal)/i;
const HOURS = /(hours|duration|time_spent)/i;
const PAID = /(paid|payment|settled)/i;
const DUE = /(due)/i;
const LOCATION = /(country|city|region|state|postcode|zip)/i;
const PRODUCT = /(product|sku|item)/i;
const COST = /(cost|cogs)/i;
const MONEY = new Set(["currency", "decimal", "integer"]);

function find(ctx: TableContext, pattern: RegExp, kinds?: Set<string>): string | null {
  for (const [name, column] of ctx.columns) {
    if (pattern.test(name) && (kinds === undefined || kinds.has(column.kind))) return name;
  }
  return null;
}

function dateColumn(ctx: TableContext): string | null {
  for (const [name, column] of ctx.columns) {
    if (column.kind === "date") return name;
  }
  return null;
}

/** Metrics each table can support, in table order. */
export function suggest(contexts: readonly TableContext[]): KpiSuggestion[] {
  return contexts.flatMap(suggestForTable);
}

function suggestForTable(ctx: TableContext): KpiSuggestion[] {
  const suggestions: KpiSuggestion[] = [];
  const name = ctx.table.name;
  const when = dateColumn(ctx);
  const amount = find(ctx, AMOUNT, MONEY);
  const customer = find(ctx, CUSTOMER);
  if (name.toLowerCase().includes("invoice") && when && amount) {
    const paid = find(ctx, PAID);
    const due = find(ctx, DUE);
    suggestions.push({
      name: "Billed vs collected, and days to pay",
      tables: [name],
      why:
        `${when} and ${amount} give billing by month` +
        (paid ? `; ${paid} shows what was collected` : "") +
        (due ? `; ${due} allows overdue ageing` : "") +
        ".",
    });
  } else if (when && amount && customer) {
    suggestions.push(
      {
        name: "Revenue and orders by month",
        tables: [name],
        why: `${when} and ${amount} are enough for monthly revenue and order counts.`,
      },
      {
        name: "Average order value and repeat purchase rate",
        tables: [name],
        why: `${customer} links orders to buyers, so repeat buying is measurable.`,
      },
      {
        name: "Customer cohort retention",
        tables: [name],
        why: `First order month per ${customer} defines cohorts; later months show who comes back.`,
      },
    );
  }
  const hours = find(ctx, HOURS, MONEY);
  if (hours && when) {
    suggestions.push({
      name: "Billable hours and utilisation",
      tables: [name],
      why:
        `${hours} per ${when}` +
        (customer ? ` per ${customer}` : "") +
        " gives hours by week and client; with invoices, an effective hourly rate.",
    });
  }
  const location = find(ctx, LOCATION);
  if (customer && location && !amount) {
    suggestions.push({
      name: "Customer base by location" + (when ? " and signup month" : ""),
      tables: [name],
      why: `${location} gives geography` + (when ? ` and ${when} gives growth over time.` : "."),
    });
  }
  const product = find(ctx, PRODUCT);
  if (product && amount && !customer) {
    const cost = find(ctx, COST, MONEY);
    suggestions.push({
      name: "Price mix" + (cost ? " and gross margin" : ""),
      tables: [name],
      why: `${amount} per ${product}` + (cost ? ` with ${cost} gives margin per product.` : "."),
    });
  }
  return suggestions;
}
