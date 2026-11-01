import { expect, test, type Page, type Request } from "@playwright/test";

/** Every request the page makes, and the CSP violations the browser reports. */
function watch(page: Page): { requests: Request[]; violations: string[] } {
  const requests: Request[] = [];
  const violations: string[] = [];
  page.on("request", (request) => requests.push(request));
  page.on("worker", (worker) => {
    worker.on("console", (message) => {
      if (message.text().includes("Content Security Policy")) violations.push(message.text());
    });
  });
  page.on("console", (message) => {
    if (message.text().includes("Content Security Policy")) violations.push(message.text());
  });
  return { requests, violations };
}

async function engineReady(page: Page): Promise<void> {
  await expect(page.locator("body")).toHaveAttribute("data-engine", "ready", { timeout: 60_000 });
}

test("the sample audit runs with no request after load and none to another origin", async ({
  page,
  baseURL,
}) => {
  const { requests, violations } = watch(page);
  await page.goto("/");
  await engineReady(page);
  const beforeAudit = requests.length;

  await page.getByRole("button", { name: "Try the sample store" }).click();
  const report = page.locator("#report");
  await expect(report.locator(".finding")).toHaveCount(18);
  await expect(report).toContainText("Data audit: Pinecrest Goods");
  await expect(report).toContainText("Rows repeated exactly");
  await expect(report.locator(".tile.critical b")).toHaveText("3");
  await expect(report.locator(".tile.warning b")).toHaveText("12");

  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download report (.html)" }).click();
  expect((await download).suggestedFilename()).toBe("data-audit-pinecrest-goods.html");

  const json = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download findings (.json)" }).click();
  expect((await json).suggestedFilename()).toBe("findings-pinecrest-goods.json");

  const origin = new URL(baseURL ?? "").origin;
  const elsewhere = requests
    .map((r) => r.url())
    .filter((url) => !url.startsWith("blob:") && !url.startsWith("data:"))
    .filter((url) => new URL(url).origin !== origin);
  expect(elsewhere).toEqual([]);
  const afterLoad = requests.slice(beforeAudit).map((r) => r.url());
  expect(afterLoad.filter((url) => !url.startsWith("blob:"))).toEqual([]);
  expect(violations).toEqual([]);
});

test("a visitor's own files are audited and unsupported ones listed", async ({ page }) => {
  await page.goto("/");
  await engineReady(page);
  await page.locator("#file-input").setInputFiles([
    {
      name: "orders.csv",
      mimeType: "text/csv",
      buffer: Buffer.from('order_id,amount\n1,10\n1,10\n2,"$1,200"\n'),
    },
    { name: "notes.pdf", mimeType: "application/pdf", buffer: Buffer.from("%PDF-1.4") },
  ]);
  await expect(page.locator("#report")).toContainText("Rows repeated exactly");
  await expect(page.locator("#notice")).toContainText("notes.pdf");
});

test("the drop zone opens the file picker from the keyboard", async ({ page }) => {
  await page.goto("/");
  await engineReady(page);
  await page.locator("#drop-zone").focus();
  const chooser = page.waitForEvent("filechooser");
  await page.keyboard.press("Enter");
  expect((await chooser).isMultiple()).toBe(true);
});

test("the page and report fit a phone screen", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 740 });
  await page.goto("/");
  await engineReady(page);
  await page.getByRole("button", { name: "Try the sample studio" }).click();
  await expect(page.locator("#report .finding").first()).toBeVisible();
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
});
