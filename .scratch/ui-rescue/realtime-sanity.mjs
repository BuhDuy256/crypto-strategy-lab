import { existsSync } from "node:fs";
import { chromium } from "playwright-core";
const executablePath = ["C:/Users/Duy/AppData/Local/ms-playwright/chromium-1234/chrome-win64/chrome.exe"].find(existsSync);
const browser = await chromium.launch({ executablePath, headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
await page.goto("http://localhost:5173/realtime", { waitUntil: "networkidle" });
await page.waitForTimeout(3000);
const selects = page.locator(".chart-widget-controls select");
const read = async () => Promise.all(
  [0, 1, 2, 3].map((i) => selects.nth(i).inputValue())
);
console.log("charts:", await page.locator("[data-subscription-state]").count());
console.log("states:", await page.locator("[data-subscription-state]").evaluateAll(
  (els) => els.map((e) => e.getAttribute("data-subscription-state"))
));
console.log("timeframes before:", await read());
await selects.nth(0).selectOption("1h");
await page.waitForTimeout(2500);
console.log("timeframes after chart-1 -> 1h:", await read());
console.log("canvases:", await page.locator(".chart-widget canvas").count());
await browser.close();
