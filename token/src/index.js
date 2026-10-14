import path from "node:path";
import { fileURLToPath } from "node:url";
import { initiateLogin, completeLogin } from "../../owj-token-bot/src/divar/apiLogin.js";
import { AccountStore, DeviceStore } from "./store.js";
import { LoginCoordinator } from "./coordinator.js";
import { createServer } from "./server.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const required = (name) => {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required; see token/.env.example`);
  return value;
};

const config = {
  host: process.env.TOKEN_HOST || "127.0.0.1",
  port: Number.parseInt(process.env.TOKEN_PORT || "3456", 10),
  dataDir: path.resolve(root, process.env.TOKEN_DATA_DIR || "data"),
  enrollmentKey: required("TOKEN_ENROLLMENT_KEY"),
  operatorKey: required("TOKEN_OPERATOR_KEY"),
  storeSecret: required("TOKEN_STORE_SECRET"),
  requestTtlMs: Number.parseInt(process.env.LOGIN_REQUEST_TTL_MS || "300000", 10),
};

const deviceStore = new DeviceStore(path.join(config.dataDir, "devices.json"));
const accountStore = new AccountStore(path.join(config.dataDir, "accounts.encrypted.json"), config.storeSecret);
await Promise.all([deviceStore.init(), accountStore.init()]);

const coordinator = new LoginCoordinator({
  deviceStore,
  accountStore,
  auth: { initiateLogin, completeLogin },
  ttlMs: config.requestTtlMs,
});
const server = createServer({ config, deviceStore, accountStore, coordinator });
server.listen(config.port, config.host, () => {
  console.log(`[token-service] listening on http://${config.host}:${config.port}`);
});

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.once(signal, () => server.close(() => process.exit(0)));
}
