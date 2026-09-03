import { existsSync } from "node:fs";
import { chromium } from "playwright-core";
const executablePath = ["C:/Users/Duy/AppData/Local/ms-playwright/chromium-1234/chrome-win64/chrome.exe"].find(existsSync);
const browser = await chromium.launch({ executablePath, headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await page.goto("http://localhost:5173/discovery");
// Plant a spec id that no longer exists, exactly like a reset demo database.
await page.evaluate(() => window.localStorage.setItem("discovery.specId", "00000000-0000-4000-8000-000000000000"));
await page.reload({ waitUntil: "networkidle" });
await page.waitForTimeout(2500);
console.log("alerts on screen:", await page.locator("[role=alert]").count());
console.log("error banners:", await page.locator(".banner-error").count());
console.log("stored key after failed restore:", await page.evaluate(() => window.localStorage.getItem("discovery.specId")));
console.log("body mentions 'Could not restore':", (await page.evaluate(() => document.body.innerText)).includes("Could not restore"));
await browser.close();
