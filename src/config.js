import "dotenv/config";

export const config = {
  baseUrl: "https://divar.ir",

  searchUrl:
    process.env.DIVAR_SEARCH_URL ||
    "https://divar.ir/s/tehran/real-estate",

  browser: {
    headless: process.env.HEADLESS === "true",
    slowMo: Number(process.env.SLOW_MO || 100),
  },

  crawler: {
    navigationTimeout: Number(
      process.env.NAVIGATION_TIMEOUT || 60000
    ),
  },
};
