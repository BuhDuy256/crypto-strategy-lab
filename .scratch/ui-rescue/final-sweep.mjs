import { existsSync, mkdirSync } from "node:fs";
import { chromium } from "playwright-core";
const executablePath = ["C:/Users/Duy/AppData/Local/ms-playwright/chromium-1234/chrome-win64/chrome.exe"].find(existsSync);
const ORIGIN = "http://localhost:5173";
const OUT = ".scratch/ui-rescue/shots"; mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ executablePath, headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
const errs = [];
page.on("pageerror", (e) => errs.push("pageerror: " + e.message));
page.on("console", (m) => { if (m.type() === "error") errs.push(m.text()); });

// 1. Realtime sanity: four charts, four independent timeframe selects.
await page.goto(`${ORIGIN}/realtime`, { waitUntil: "networkidle" });
await page.waitForTimeout(3000);
const charts = await page.locator("[data-subscription-state]").count();
const selects = await page.locator(".chart-widget-controls select").count();
const before = await page.locator('[data-chart-id="chart-2"], .chart-widget').nth(1).innerText().catch(()=>"");
await page.locator(".chart-widget-controls select").nth(0).selectOption("1h");
await page.waitForTimeout(2500);
const after = await page.locator(".chart-widget").nth(1).innerText().catch(()=>"");
console.log("REALTIME charts=", charts, "selects=", selects, "chart2 unchanged by chart1 timeframe change:", before === after);
await page.screenshot({ path: `${OUT}/final-realtime.png` });

// 2. News sanity.
await page.goto(`${ORIGIN}/news`, { waitUntil: "networkidle" });
await page.waitForTimeout(2000);
await page.screenshot({ path: `${OUT}/final-news.png`, fullPage: true });
console.log("NEWS first row:", (await page.locator("tbody tr").first().innerText()).replace(/\n/g, " | "));

// 3. Discovery: open a leaderboard entry (detail panel + provenance).
await page.goto(`${ORIGIN}/discovery`, { waitUntil: "networkidle" });
await page.waitForTimeout(1200);
await page.getByLabel("Relative Strength Index").check();
await page.getByLabel("Composite size").fill("2");
await page.getByLabel("Candidate limit").fill("4");
await page.getByLabel("Seed").fill("ui-rescue-final");
await page.getByRole("button", { name: "Start Search" }).click();
await page.waitForFunction(() => /Status: (stopped|completed|cancelled)/.test(document.body.innerText), null, { timeout: 120000 }).catch(()=>console.log("DISCOVERY TIMEOUT"));
await page.waitForTimeout(1500);
const rows = await page.locator(".data-table tbody tr").count();
console.log("DISCOVERY leaderboard rows:", rows);
if (rows > 0) {
  await page.locator(".data-table tbody tr").first().click();
  await page.waitForTimeout(4000);
  await page.locator("details.provenance summary").click().catch(()=>{});
  await page.waitForTimeout(400);
  console.log("DISCOVERY detail open:", (await page.locator("section[aria-labelledby=entry-detail-heading]").innerText()).replace(/\n/g," | ").slice(0, 400));
}
await page.screenshot({ path: `${OUT}/final-discovery.png`, fullPage: true });

console.log("CONSOLE ERRORS:", errs.slice(0, 6));
await browser.close();
