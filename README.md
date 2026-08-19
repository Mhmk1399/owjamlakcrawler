# Owj crawler and Telegram login bot

The repository contains two cooperating Node.js applications:

- The root project is the crawler.
- `owj-token-bot/` is the Telegram login bot and local token API.

## Start everything

From the repository root, run:

```bash
npm start
```

The starter performs this sequence:

1. Starts the Telegram bot and its local API.
2. Sends a startup message to every ID in `ALLOWED_TELEGRAM_USERS`.
3. Waits until at least one active Divar login is stored.
4. If login is required, use `/login 09xxxxxxxxx` in Telegram and then send the OTP.
5. Starts the crawler and gives it the local token API URL.
6. Reports CAPTCHA events, crawler failures, and the final crawler result to Telegram.
7. Stops both processes together when you press `Ctrl+C`.

The bot configuration belongs in `owj-token-bot/.env`:

```dotenv
TELEGRAM_BOT_TOKEN=your_botfather_token
ALLOWED_TELEGRAM_USERS=your_numeric_telegram_user_id
ACCOUNTS_FILE=./data/accounts.json
API_HOST=127.0.0.1
API_PORT=3456
```

The root `.env` must point to the same local API:

```dotenv
TOKEN_API_URL=http://127.0.0.1:3456
WORKER_ID=worker-standalone
```

Use `npm run start:crawler` or `npm run start:bot` only when debugging one application separately.

Never commit either `.env` file or `owj-token-bot/data/accounts.json`; they contain credentials.

## Public market analytics service

`owj-market-analytics/` is a third, independent Node.js service for public-only market collection and live analysis. It never clicks contact controls or uses token-bot credentials. It stores versioned JSON, updates district/comparable/model results after every listing, exposes JSON endpoints, and writes a full structured JSONL event log.

Start it separately:

```bash
npm run start:analytics
```

The default API is `http://127.0.0.1:4567`. See [`owj-market-analytics/README.md`](owj-market-analytics/README.md) and [`ANALYTICS_SERVICE_PLAN.md`](ANALYTICS_SERVICE_PLAN.md).
