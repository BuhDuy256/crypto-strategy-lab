import { existsSync, mkdirSync } from "node:fs";
import { chromium } from "playwright-core";
const executablePath = ["C:/Users/Duy/AppData/Local/ms-playwright/chromium-1234/chrome-win64/chrome.exe"].find(existsSync);
const ORIGIN = "http://localhost:8080";
const OUT = ".scratch/ui-rescue/shots"; mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ executablePath, headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, colorScheme: "dark" });
for (const [route, file] of [["/backtest", "now-backtest"], ["/realtime", "now-realtime"], ["/news", "now-news"]]) {
  await page.goto(`${ORIGIN}${route}`, { waitUntil: "networkidle" });
  await page.waitForTimeout(3000);
  await page.screenshot({ path: `${OUT}/${file}.png`, fullPage: true });
  console.log(route, "captured");
}
await browser.close();
