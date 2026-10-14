import fs from "node:fs/promises";
import path from "node:path";
import { decryptJson, encryptJson, hashToken } from "./security.js";

async function writeAtomic(file, value) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  const temporary = `${file}.${process.pid}.tmp`;
  await fs.writeFile(temporary, JSON.stringify(value, null, 2), { mode: 0o600 });
  await fs.rename(temporary, file);
}

async function readJson(file, fallback) {
  try {
    return JSON.parse(await fs.readFile(file, "utf8"));
  } catch (error) {
    if (error.code === "ENOENT") return structuredClone(fallback);
    throw error;
  }
}

export class DeviceStore {
  constructor(file) {
    this.file = file;
    this.document = { devices: {} };
  }

  async init() {
    this.document = await readJson(this.file, { devices: {} });
  }

  async register({ deviceId, phone, name, token }) {
    this.document.devices[deviceId] = {
      deviceId,
      phone,
      name,
      tokenHash: hashToken(token),
      registeredAt: new Date().toISOString(),
      lastSeenAt: new Date().toISOString(),
      enabled: true,
    };
    await writeAtomic(this.file, this.document);
    return this.publicDevice(this.document.devices[deviceId]);
  }

  authenticate(deviceId, token) {
    const device = this.document.devices[deviceId];
    if (!device?.enabled || hashToken(token) !== device.tokenHash) return null;
    device.lastSeenAt = new Date().toISOString();
    return device;
  }

  findByPhone(phone) {
    return Object.values(this.document.devices).find(
      (device) => device.enabled && device.phone === phone,
    ) || null;
  }

  publicDevice(device) {
    return {
      deviceId: device.deviceId,
      phone: device.phone,
      name: device.name,
      registeredAt: device.registeredAt,
      lastSeenAt: device.lastSeenAt,
      enabled: device.enabled,
    };
  }
}

export class AccountStore {
  constructor(file, secret) {
    this.file = file;
    this.secret = secret;
    this.accounts = new Map();
  }

  async init() {
    const document = await readJson(this.file, { accounts: {} });
    for (const [phone, encrypted] of Object.entries(document.accounts || {})) {
      this.accounts.set(phone, decryptJson(encrypted, this.secret));
    }
  }

  async persist() {
    const accounts = {};
    for (const [phone, account] of this.accounts) {
      accounts[phone] = encryptJson(account, this.secret);
    }
    await writeAtomic(this.file, { version: 1, accounts });
  }

  list() {
    return [...this.accounts.values()];
  }

  get(phone) {
    return this.accounts.get(phone) || null;
  }

  async save(account) {
    this.accounts.set(account.phone, account);
    await this.persist();
    return account;
  }

  async markStatus(phone, status) {
    const account = this.accounts.get(phone);
    if (!account) return false;
    account.status = status;
    account.statusUpdatedAt = new Date().toISOString();
    await this.persist();
    return true;
  }
}
