const tokenApiUrl = (process.env.TOKEN_API_URL || "http://127.0.0.1:3456").replace(/\/$/, "");

export async function sendCrawlerAlert(message, severity = "error") {
  try {
    const response = await fetch(`${tokenApiUrl}/alert`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        source: "crawler",
        severity,
        message: String(message || "Unknown crawler error").slice(0, 3600),
      }),
      signal: AbortSignal.timeout(5_000),
    });
    return response.ok;
  } catch (error) {
    console.error(`[ALERT] Telegram notification failed: ${error.message}`);
    return false;
  }
}
