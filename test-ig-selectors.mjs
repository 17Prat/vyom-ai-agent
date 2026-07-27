import puppeteer from "puppeteer-core";

const CHROME_PATH = "C:/Program Files/Google/Chrome/Application/chrome.exe";

const browser = await puppeteer.launch({
  executablePath: CHROME_PATH,
  headless: false,
  args: ["--no-sandbox"],
});
const page = await browser.newPage();
await page.setViewport({ width: 1366, height: 768 });
await page.goto("https://www.instagram.com/accounts/login/", { waitUntil: "networkidle2", timeout: 30000 });
await new Promise(r => setTimeout(r, 3000));

// Find the login button
const btnInfo = await page.evaluate(() => {
  // Try to find clickable elements that say "Log in" or "Submit"
  const allButtons = [];
  document.querySelectorAll("button, input[type=submit], div[role=button]").forEach(el => {
    allButtons.push({
      tag: el.tagName,
      type: el.type || "",
      text: el.textContent?.trim()?.substring(0, 50),
      id: el.id,
      class: el.className?.substring(0, 50),
      ariaLabel: el.getAttribute("aria-label") || "",
    });
  });
  return allButtons;
});
console.log("Buttons:", JSON.stringify(btnInfo, null, 2));

// Also check the form structure
const formInfo = await page.evaluate(() => {
  const forms = document.querySelectorAll("form");
  return Array.from(forms).map(f => ({
    id: f.id,
    action: f.action,
    method: f.method,
  }));
});
console.log("Forms:", JSON.stringify(formInfo));

await browser.close();
