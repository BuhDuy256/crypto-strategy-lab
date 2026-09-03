// UI Rescue browser audit: visit each demo page, capture a screenshot and a
// compact DOM/interaction report. Read-only; no app change.
import { existsSync, mkdirSync } from "node:fs";
import { chromium } from "playwright-core";

const candidates = [
  process.env.CHROME_EXECUTABLE,
  "C:/Users/Duy/AppData/Local/ms-playwright/chromium-1234/chrome-win64/chrome.exe",
  "C:/Program Files/Google/Chrome/Application/chrome.exe"
].filter(Boolean);
const executablePath = candidates.find(existsSync);
if (!executablePath) throw new Error("no chromium found");

const ORIGIN = process.env.UI_ORIGIN ?? "http://localhost:5173";
const OUT = ".scratch/ui-rescue/shots";
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({ executablePath, headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const consoleErrors = [];
page.on("console", (m) => { if (m.type() === "error") consoleErrors.push(m.text()); });
page.on("pageerror", (e) => consoleErrors.push(`pageerror: ${e.message}`));

const routes = ["backtest", "realtime", "strategy-engine", "discovery", "news"];
for (const route of routes) {
  consoleErrors.length = 0;
  await page.goto(`${ORIGIN}/${route}`, { waitUntil: "networkidle" });
  await page.waitForTimeout(2500);
  await page.screenshot({ path: `${OUT}/${route}.png`, fullPage: true });
  const report = await page.evaluate(() => {
    const controls = [...document.querySelectorAll("input,select,button,textarea")].map((el) => ({
      tag: el.tagName.toLowerCase(),
      type: el.getAttribute("type"),
      label: (el.getAttribute("aria-label") ?? el.textContent ?? "").trim().slice(0, 40),
      disabled: el.disabled === true
    }));
    const body = document.body;
    return {
      controls: controls.length,
      disabledControls: controls.filter((c) => c.disabled).map((c) => `${c.tag}:${c.label}`),
      alerts: [...document.querySelectorAll("[role=alert]")].map((e) => e.textContent.trim().slice(0, 120)),
      bodyBg: getComputedStyle(body).backgroundColor,
      scrollHeight: body.scrollHeight,
      text: body.innerText.replace(/\n{2,}/g, "\n").slice(0, 2200)
    };
  });
  console.log(`\n===== /${route} =====`);
  console.log(JSON.stringify({ ...report, consoleErrors: [...consoleErrors].slice(0, 5) }, null, 1));
}
await browser.close();
