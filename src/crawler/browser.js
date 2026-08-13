import { chromium } from "playwright";
import path from "node:path";
import { config } from "../config.js";

const profilePath = path.resolve(".browser-profile");

export async function createBrowser() {
  console.log("Browser profile:", profilePath);

  const context = await chromium.launchPersistentContext(
    profilePath,
    {
      headless: config.browser.headless,
      slowMo: config.browser.slowMo,

      viewport: {
        width: 1440,
        height: 900,
      },

      locale: "fa-IR",
    }
  );

  let page = context.pages()[0];

  if (!page) {
    page = await context.newPage();
  }

  page.setDefaultTimeout(
    config.crawler.navigationTimeout
  );

  page.setDefaultNavigationTimeout(
    config.crawler.navigationTimeout
  );

  return {
    context,
    page,
  };
}
