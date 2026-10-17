import { chmod, mkdir } from "node:fs/promises";
import { chromium, type BrowserContext, type Page } from "playwright";
import type { LabConfig } from "./types.js";

export class LabBrowser {
  context: BrowserContext | null = null;
  page: Page | null = null;

  constructor(private readonly config: LabConfig, readonly profilePath: string) {}

  async open(): Promise<{ context: BrowserContext; page: Page }> {
    await mkdir(this.profilePath, { recursive: true, mode: 0o700 });
    await chmod(this.profilePath, 0o700);
    this.context = await chromium.launchPersistentContext(this.profilePath, {
      headless: false,
      locale: "fa-IR",
      viewport: { width: 1440, height: 900 },
    });
    this.page = this.context.pages()[0] ?? await this.context.newPage();
    this.page.setDefaultTimeout(this.config.navigationTimeoutMs);
    this.page.setDefaultNavigationTimeout(this.config.navigationTimeoutMs);
    return { context: this.context, page: this.page };
  }

  async navigateStart(): Promise<void> {
    if (!this.page) throw new Error("Browser is not open");
    await this.page.goto(this.config.startUrl, { waitUntil: "domcontentloaded" });
  }

  running(): boolean {
    return Boolean(this.context && this.page && !this.page.isClosed());
  }

  async close(): Promise<void> {
    const context = this.context;
    this.context = null;
    this.page = null;
    await context?.close().catch(() => undefined);
  }

  async restart(): Promise<{ context: BrowserContext; page: Page }> {
    await this.close();
    return this.open();
  }
}
