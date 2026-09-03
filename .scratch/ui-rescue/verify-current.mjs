import { existsSync, mkdirSync } from "node:fs";
import { chromium } from "playwright-core";
const executablePath = ["C:/Users/Duy/AppData/Local/ms-playwright/chromium-1234/chrome-win64/chrome.exe"].find(existsSync);
const ORIGIN = process.env.ORIGIN || "http://localhost:8080";
const OUT = ".scratch/ui-rescue/shots"; mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ executablePath, headless: true });
// Emulate the user's dark system theme on purpose: that is what their screenshots show.
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, colorScheme: "dark" });
const errs = [];
page.on("pageerror", (e) => errs.push("pageerror: " + e.message));
page.on("console", (m) => { if (m.type() === "error") errs.push("console: " + m.text()); });

// --- Strategy Engine: does ADD STRATEGY actually work on the deployed build? ---
await page.goto(`${ORIGIN}/strategy-engine`, { waitUntil: "networkidle" });
await page.waitForTimeout(1500);
const addButtons = await page.getByRole("button", { name: "+ ADD STRATEGY" }).count();
console.log("ADD STRATEGY buttons:", addButtons);
console.log("body starts:", (await page.locator("body").innerText()).slice(0, 120).replace(/\n/g, " | "));
await page.screenshot({ path: `${OUT}/now-engine-empty.png`, fullPage: true });

if (addButtons > 0) {
  await page.getByRole("button", { name: "+ ADD STRATEGY" }).nth(0).click();
  await page.waitForTimeout(500);
  const after1 = await page.locator(".component-card").count();
  await page.getByRole("button", { name: "+ ADD STRATEGY" }).nth(1).click();
  await page.waitForTimeout(500);
  const after2 = await page.locator(".component-card").count();
  console.log("component cards after 1 click:", after1, "after 2 clicks:", after2);
  const saveDisabled = await page.getByRole("button", { name: "SAVE COMPOSITE" }).isDisabled();
  console.log("SAVE COMPOSITE disabled with 2 components and no name:", saveDisabled);
}
await page.screenshot({ path: `${OUT}/now-engine.png`, fullPage: true });

// --- Discovery: what the config + leaderboard look like right now ---
await page.goto(`${ORIGIN}/discovery`, { waitUntil: "networkidle" });
await page.waitForTimeout(1500);
const labels = await page.locator(".field-label").allInnerTexts();
console.log("Discovery field labels:", JSON.stringify(labels));
await page.screenshot({ path: `${OUT}/now-discovery.png`, fullPage: true });

console.log("page errors:", errs.length ? errs : "none");
await browser.close();
