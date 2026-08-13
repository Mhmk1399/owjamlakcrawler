export function attachNetworkLogger(page) {
  page.on("request", (request) => {
    const type = request.resourceType();

    if (!["xhr", "fetch"].includes(type)) {
      return;
    }

    console.log("\n================ REQUEST ================");

    console.log("METHOD:", request.method());
    console.log("URL:", request.url());

    const postData = request.postData();

    if (postData) {
      console.log("BODY:", postData);
    }
  });

  page.on("response", async (response) => {
    const request = response.request();

    const type = request.resourceType();

    if (!["xhr", "fetch"].includes(type)) {
      return;
    }

    console.log("\n================ RESPONSE ================");

    console.log("STATUS:", response.status());
    console.log("URL:", response.url());
  });
}
