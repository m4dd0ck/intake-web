/**
 * DataIntake's synthetic demo exports, bundled into the page as base64 so that trying the
 * sample makes no network request.
 */

import shopCustomers from "../../sample/shop/customers.xlsx?base64";
import shopOrders from "../../sample/shop/orders.csv?base64";
import shopProducts from "../../sample/shop/products.csv?base64";
import studioClients from "../../sample/studio/clients.csv?base64";
import studioInvoices from "../../sample/studio/invoices.xlsx?base64";
import studioTimesheets from "../../sample/studio/timesheets.csv?base64";

export interface Sample {
  client: string;
  blurb: string;
  asOf: string;
  files: Record<string, string>;
}

export const SAMPLES: Record<"shop" | "studio", Sample> = {
  shop: {
    client: "Pinecrest Goods",
    blurb: "Online homeware store: orders, customers and products.",
    asOf: "2024-12-31",
    files: {
      "customers.xlsx": shopCustomers,
      "orders.csv": shopOrders,
      "products.csv": shopProducts,
    },
  },
  studio: {
    client: "Northline Studio",
    blurb: "Design studio: invoices, clients and timesheets.",
    asOf: "2024-12-31",
    files: {
      "clients.csv": studioClients,
      "invoices.xlsx": studioInvoices,
      "timesheets.csv": studioTimesheets,
    },
  },
};

const MIME: Record<string, string> = {
  csv: "text/csv",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
};

function decode(base64: string): Uint8Array<ArrayBuffer> {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/** One sample file as a `File`, the same object a visitor's drop would produce. */
export function sampleFile(name: string, base64: string): File {
  return new File([decode(base64)], name, { type: MIME[name.split(".").pop() ?? ""] ?? "" });
}

export function sampleFiles(sample: Sample): File[] {
  return Object.entries(sample.files).map(([name, data]) => sampleFile(name, data));
}
