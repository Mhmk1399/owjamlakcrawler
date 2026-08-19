import fs from "fs/promises";
import path from "path";

const FILE = process.env.ACCOUNTS_FILE || "./data/accounts.json";

async function ensure() {
  await fs.mkdir(path.dirname(FILE), { recursive: true });
  try {
    await fs.access(FILE);
  } catch {
    await fs.writeFile(FILE, JSON.stringify({ accounts: {} }, null, 2));
  }
}

export async function loadAccounts() {
  await ensure();
  return JSON.parse(await fs.readFile(FILE, "utf8"));
}

export async function saveAccount(account) {
  const data = await loadAccounts();
  data.accounts[account.phone] = account;
  await fs.writeFile(FILE, JSON.stringify(data, null, 2));
  return account;
}

export async function listAccounts() {
  const data = await loadAccounts();
  return Object.values(data.accounts || {});
}

export async function deleteAccount(phone) {
  const data = await loadAccounts();
  delete data.accounts[phone];
  await fs.writeFile(FILE, JSON.stringify(data, null, 2));
}

export async function markAccountStatus(phone, status) {
  const data = await loadAccounts();
  const account = data.accounts?.[phone];

  if (!account) {
    return false;
  }

  account.status = status;
  await fs.writeFile(FILE, JSON.stringify(data, null, 2));
  return true;
}
