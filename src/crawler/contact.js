export async function inspectListing(page, url) {
  console.log("Opening listing:");
  console.log(url);

  await page.goto(url, {
    waitUntil: "domcontentloaded",
  });

  console.log("Listing loaded");
  console.log("Title:", await page.title());
}
