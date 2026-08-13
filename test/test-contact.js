// test-contact.js
import { chromium } from "playwright";

const TEST_TOKEN = "gauBS8iW"; // use any token you know exists
const PROFILE_PATH = "/home/mhmk/Documents/git/owjcrawler/.browser-profile";

(async () => {
  const context = await chromium.launchPersistentContext(PROFILE_PATH, {
    headless: false,
  });
  const page = await context.newPage();

  console.log("1. Going to divar.ir...");
  await page.goto("https://divar.ir/", { waitUntil: "domcontentloaded" });

  console.log("2. Checking cookies in context...");
  const cookies = await context.cookies("https://api.divar.ir");
  console.log(`   Cookies for api.divar.ir: ${cookies.length}`);
  cookies.forEach(c => console.log(`   - ${c.name}: ${c.value.slice(0, 30)}...`));

  console.log("\n3. Calling contact API from page...");
  const result = await page.evaluate(async (token) => {
    const r = await fetch(
      `https://api.divar.ir/v8/postcontact/web/contact_info_v2/${token}`,
      {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          "Accept": "application/json",
          "x-standard-divar-error": "true",
        },
        body: JSON.stringify({}),
      }
    );
    return { status: r.status, body: await r.text() };
  }, TEST_TOKEN);

  console.log(`\n4. Result: HTTP ${result.status}`);
  console.log("   Body:", result.body.slice(0, 400));

  console.log("\nPress Ctrl+C to exit...");
  await new Promise(() => {});
})();