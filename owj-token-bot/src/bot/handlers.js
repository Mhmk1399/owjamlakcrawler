import { initiateLogin, completeLogin } from "../divar/apiLogin.js";
import { saveAccount, listAccounts, deleteAccount } from "../divar/tokens.js";

const ALLOWED = (process.env.ALLOWED_TELEGRAM_USERS || "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

const sessions = new Map(); // telegramUserId -> login session

export function auth(ctx, next) {
  if (!ALLOWED.includes(String(ctx.from?.id))) {
    return ctx.reply("⛔ Unauthorized");
  }
  return next();
}

export async function start(ctx) {
  await ctx.reply(
    "🤖 *Owj Divar Token Bot (API)*\n\n" +
      "/login `09xxxxxxxxx`\n" +
      "/accounts\n" +
      "/delete `09xxxxxxxxx`\n" +
      "/cancel\n\n" +
      "After /login, just send the OTP digits.",
    { parse_mode: "Markdown" }
  );
}

export async function loginCmd(ctx) {
  const phone = ctx.message.text.split(/\s+/)[1]?.trim();
  if (!phone || !/^09\d{9}$/.test(phone)) {
    return ctx.reply("❌ Usage: `/login 09123456789`", { parse_mode: "Markdown" });
  }

  await ctx.reply(`⏳ Sending OTP to *${phone}*...`, { parse_mode: "Markdown" });

  try {
    const session = await initiateLogin(phone);
    sessions.set(ctx.from.id, session);
    setTimeout(() => sessions.delete(ctx.from.id), 5 * 60 * 1000);

    await ctx.reply(
      `📱 OTP sent to *${phone}*\n\nSend the 6-digit code now.\n(Expires in 5 minutes)`,
      { parse_mode: "Markdown" }
    );
  } catch (e) {
    await ctx.reply(`❌ ${e.message}`);
  }
}

export async function textHandler(ctx) {
  const text = ctx.message.text.trim();
  const session = sessions.get(ctx.from.id);
  if (!session) return;
  if (!/^\d{4,8}$/.test(text)) return;

  await ctx.reply("⏳ Verifying OTP...");

  try {
    const account = await completeLogin(session, text);
    await saveAccount(account);
    sessions.delete(ctx.from.id);

    await ctx.reply(
      `✅ *Login OK*\n\n` +
        `📞 \`${account.phone}\`\n` +
        `🔐 Token stored securely.\n` +
        `▶️ The crawler will detect it and resume within a few seconds.`,
      { parse_mode: "Markdown" }
    );
  } catch (e) {
    await ctx.reply(`❌ OTP failed: ${e.message}`);
  }
}

export async function accountsCmd(ctx) {
  const accounts = await listAccounts();
  if (!accounts.length) return ctx.reply("📭 No accounts yet");

  let msg = `📋 Accounts (${accounts.length})\n\n`;
  for (const a of accounts) {
    const indicator = a.status === "active" ? "🟢" : "🔴";
    msg += `${indicator} \`${a.phone}\` — ${a.status || "unknown"}\n   ${a.loggedInAt || a.savedAt || ""}\n\n`;
  }
  await ctx.reply(msg, { parse_mode: "Markdown" });
}

export async function deleteCmd(ctx) {
  const phone = ctx.message.text.split(/\s+/)[1]?.trim();
  if (!phone) return ctx.reply("Usage: /delete 09xxxxxxxxx");
  await deleteAccount(phone);
  await ctx.reply(`🗑 Deleted ${phone}`);
}

export async function cancelCmd(ctx) {
  sessions.delete(ctx.from.id);
  await ctx.reply("❎ Cancelled");
}
