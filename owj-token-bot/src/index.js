import "dotenv/config";
import { Telegraf } from "telegraf";
import {
  auth,
  start,
  loginCmd,
  textHandler,
  accountsCmd,
  deleteCmd,
  cancelCmd,
} from "./bot/handlers.js";
import { createApiServer, notifyAdmins, setBotReference } from "./api/server.js";
import { listAccounts } from "./divar/tokens.js";

if (!process.env.TELEGRAM_BOT_TOKEN) {
  console.error("❌ TELEGRAM_BOT_TOKEN missing in .env");
  process.exit(1);
}

const bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN);
const ALLOWED_USERS = (process.env.ALLOWED_TELEGRAM_USERS || "")
  .split(",")
  .map((value) => value.trim())
  .filter(Boolean);

if (ALLOWED_USERS.length === 0) {
  console.error("❌ ALLOWED_TELEGRAM_USERS missing in .env");
  process.exit(1);
}

bot.use(auth);
bot.start(start);
bot.help(start);
bot.command("login", loginCmd);
bot.command("accounts", accountsCmd);
bot.command("delete", deleteCmd);
bot.command("cancel", cancelCmd);
bot.on("text", textHandler);

bot.catch((err, ctx) => {
  console.error("Bot error:", err);
  void ctx.reply(`💥 Error: ${err.message}`).catch(() => {});
  void notifyAdmins(`💥 Telegram bot handler error\n\n${err.stack || err.message || err}`);
});

setBotReference(bot, ALLOWED_USERS);

const port = Number.parseInt(process.env.API_PORT || "3456", 10);
const host = process.env.API_HOST || "127.0.0.1";
const apiServer = createApiServer(port, host);
let botStarted = false;
let shuttingDown = false;

apiServer.on("error", async (error) => {
  console.error("Token API error:", error);
  await notifyAdmins(`💥 Token API error\n\n${error.stack || error.message || error}`).catch(() => {});
  process.exit(1);
});

async function announceStartup() {
  botStarted = true;
  console.log("🤖 Telegram bot running");
  const accounts = await listAccounts();
  const active = accounts.filter((account) => account.status === "active");
  const loginPrompt = active.length
    ? `The crawler can start with ${active.length} active account(s). Use /login 09xxxxxxxxx to add or renew one.`
    : "No active login is available. Send /login 09xxxxxxxxx, then send the OTP code.";
  await notifyAdmins(`🚀 Owj crawler system started\n\n${loginPrompt}`);
}

bot.launch({}, () => {
  void announceStartup().catch((error) => {
    console.error("Startup notification failed:", error);
  });
}).catch(async (error) => {
  console.error("Telegram launch error:", error);
  await notifyAdmins(`💥 Telegram bot failed to start\n\n${error.stack || error.message || error}`);
  process.exitCode = 1;
  apiServer.close();
});

async function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`\n[SHUTDOWN] ${signal}`);
  apiServer.close();
  if (botStarted) bot.stop(signal);
}

process.once("SIGINT", () => void shutdown("SIGINT"));
process.once("SIGTERM", () => void shutdown("SIGTERM"));

process.on("unhandledRejection", (reason) => {
  console.error("Unhandled rejection:", reason);
  void notifyAdmins(`💥 Bot unhandled rejection\n\n${reason?.stack || reason}`);
});
