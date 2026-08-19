# Owj Crawler Project Summary

## 1. Executive summary

This repository contains two cooperating Node.js applications for collecting and normalizing real-estate listings from [Divar](https://divar.ir):

1. **Owj Crawler** (repository root) discovers listing URLs, opens each listing with Playwright, extracts structured and visible data, retrieves authenticated contact information, normalizes the result, and writes JSON files.
2. **Owj Token Bot** (`owj-token-bot/`) lets approved Telegram users log in to Divar with a phone number and OTP. It stores the resulting account tokens and exposes them to crawler workers through a local HTTP API.

The normal entry point is `npm start`. The launcher starts the token bot/API, waits for at least one active Divar account, starts the crawler, and shuts down both applications together.

## 2. System architecture

```text
Approved Telegram user
        |
        | /login + OTP, account commands, alerts
        v
Telegram bot (Telegraf)
        |
        +--> Divar authentication APIs
        |       |
        |       +--> access/front tokens
        |
        +--> owj-token-bot/data/accounts.json
        |
        +--> Local Express token API (default 127.0.0.1:3456)
                         ^
                         | token assignment, CAPTCHA reports,
                         | success reports, alerts, health checks
                         |
Launcher --> Crawler --> Playwright/Divar pages and contact API
                         |
                         +--> data/listings/<token>.json
                         +--> data/listings.json
                         +--> diagnostics and failure screenshots
```

The two projects communicate only through the token bot's HTTP API. The crawler does not directly read the bot's account file.

## 3. Project A: Owj Crawler

### Purpose

The root application crawls Tehran real-estate listings on Divar. It supports one explicit listing, a short "latest" crawl, or a category-based backfill. It extracts Persian listing content, converts important fields into a consistent schema, optionally retrieves the advertiser's authenticated mobile number, and saves each listing independently.

### Main flow

1. `src/index.js` creates a persistent Chromium context in `.browser-profile/`.
2. It checks whether a usable token-bot account or browser session exists.
3. It chooses a discovery mode:
   - **Target:** crawl the URL in `TARGET_LISTING_URL`.
   - **Latest:** when `CRAWL_MODE=latest`, scan a few iterations of `DIVAR_SEARCH_URL`.
   - **Backfill (default):** scan the built-in Tehran buy/rent residential, commercial, and short-term-rent partitions.
4. Search pages are scrolled and "more ads" controls are clicked. Listing URLs are canonicalized and deduplicated by Divar token.
5. A bounded worker pool opens detail pages concurrently and retries transient failures.
6. Each detail worker merges embedded JSON/JSON-LD/page state with visible DOM fields.
7. When contact information is available, the worker asks the token API for an account and calls Divar's contact endpoint. Contact calls are globally throttled within the process.
8. The parser normalizes Persian digits, money, phone numbers, location, property details, amenities, coordinates, images, advertiser information, contact information, and quality metadata.
9. Each valid record is atomically saved. A combined JSON export and terminal report are generated after the run.

### Important modules

| Path | Responsibility |
| --- | --- |
| `src/index.js` | Crawler orchestration, modes, progress, persistence, reporting, and graceful shutdown |
| `src/config.js` | Environment-driven browser and crawler settings with bounded numeric values |
| `src/crawler/browser.js` | Persistent Playwright Chromium context |
| `src/crawler/search.js` | Search-page loading, scrolling, deduplication, and sanitized diagnostics |
| `src/crawler/backfill.js` | Sequential category partitions and incremental discovery checkpoints |
| `src/crawler/listing.js` | Structured/DOM extraction, source merging, and detail-page workflow |
| `src/crawler/contact.js` | Contact-state detection, throttled contact API calls, CAPTCHA coordination, and phone extraction |
| `src/crawler/tokenClient.js` | Worker token assignment, caching, replacement, polling, and status reports |
| `src/parsers/realEstate.js` | Persian real-estate normalization, field inference, validation, and quality scoring |
| `src/workers/detailWorkerPool.js` | Bounded concurrency, deduplication, resume filtering, and transient retries |
| `src/storage/listingFiles.js` | Atomic per-listing files, saved-token validation, combined export, and summaries |
| `src/utils/` | Alerts, Persian text/numbers, phone numbers, URLs, images, and coordinates |

### Output data

The normalized listing record includes these main groups:

- Identity: `token`, canonical `url`, `title`, `category`, and `subcategory`.
- Location and time: inferred location fields, `publishedText`, and `scrapedAt`.
- Property: area, construction year, rooms, floor, total floors, and units per floor.
- Pricing: sale price, price per square metre, deposit, rent, full-mortgage status, and negotiability.
- Amenities: elevator, parking, storage, and balcony.
- Advertiser: name, type, and agency.
- Contact: public mobile/landline evidence, contact-button state, authentication state, authenticated phone, source, and status.
- Supporting content: description, filtered image URLs, attributes, breadcrumbs, coordinates, and quality metadata.

Primary generated artifacts are:

| Artifact | Meaning |
| --- | --- |
| `data/listings/<token>.json` | Atomic normalized record for one listing |
| `data/listings.json` | Combined array of all valid per-token files |
| `data/discovered-listings.json` | Incremental backfill discovery checkpoint |
| `data/search-diagnostics.json` | Crawl timing, partitions, iterations, and sanitized search requests |
| `screenshots/failed-<token>.png` | Detail failure screenshot |
| `screenshots/search-debug.png` and `data/search-debug.html` | Debug artifacts when discovery finds no listings |

### Crawler configuration

| Variable | Default | Purpose |
| --- | --- | --- |
| `TOKEN_API_URL` | `http://127.0.0.1:3456` in the launcher/alerts; `http://localhost:3456` in the token client | Token bot API address |
| `WORKER_ID` | `worker-standalone` | Stable identity used for account assignment |
| `TARGET_LISTING_URL` | unset | Crawl exactly one Divar listing |
| `CRAWL_MODE` | backfill behavior | Set to `latest` for the short latest-listings mode |
| `DIVAR_SEARCH_URL` | Tehran real-estate search | Search page used by latest mode and initial browser load |
| `MAX_LISTINGS` | `100` | Maximum listings, clamped to 1–10,000 |
| `DETAIL_CONCURRENCY` | `3` | Concurrent detail workers, clamped to 1–8 |
| `DETAIL_MAX_RETRIES` | `2` | Transient retries, clamped to 0–5 |
| `CONTACT_REQUEST_INTERVAL_MS` | `10000` | Minimum interval between contact requests in one process |
| `NAVIGATION_TIMEOUT` | `60000` | Playwright timeout in milliseconds |
| `HEADLESS` | false unless exactly `true` | Whether Chromium runs headlessly |
| `SLOW_MO` | `100` | Playwright delay between browser actions |
| `RESUME` | false unless exactly `true` | Skip valid per-token files already saved |
| `GENERATE_COMBINED_JSON` | true unless exactly `false` | Generate `data/listings.json` after crawling |
| `SHUTDOWN_GRACE_MS` | `15000` | Grace period before forcing the browser context closed |
| `DEBUG_FIELD_SOURCES` | false unless exactly `true` | Keep `_fieldSources` in normalized records |

## 4. Project B: Owj Token Bot

### Purpose

`owj-token-bot/` combines three related responsibilities:

- A restricted Telegram interface for Divar OTP login and account administration.
- Persistent storage for account access tokens.
- A local Express API that assigns accounts to crawler workers and forwards crawler alerts to Telegram.

### Telegram commands

| Command | Action |
| --- | --- |
| `/start` or `/help` | Show usage instructions |
| `/login 09xxxxxxxxx` | Request a Divar OTP; the next 4–8 digit message completes login |
| `/accounts` | List stored accounts and their current statuses |
| `/delete 09xxxxxxxxx` | Delete a stored account |
| `/cancel` | Cancel the current user's pending OTP session |

Only IDs listed in `ALLOWED_TELEGRAM_USERS` pass the authorization middleware. Pending login sessions live in memory and expire after five minutes.

### Token API

The API binds to `127.0.0.1:3456` by default.

| Method and route | Purpose |
| --- | --- |
| `GET /tokens` | Return all active account token details |
| `GET /assign/:workerId` | Reuse the worker's assignment or choose a least-used active account |
| `POST /report-captcha` | Mark an account `captcha`, clear its assignment, alert admins, and return a replacement if possible |
| `POST /report-success` | Mark the supplied account active |
| `POST /alert` | Forward a local crawler/launcher message to Telegram admins |
| `GET /health` | Return account counts, Telegram admin count, and in-memory assignments |

Worker assignments are kept only in memory and reset whenever the token bot restarts. Stored accounts are keyed by phone number in `owj-token-bot/data/accounts.json`.

### Important modules

| Path | Responsibility |
| --- | --- |
| `owj-token-bot/src/index.js` | Bot/API startup, command registration, notifications, and shutdown |
| `owj-token-bot/src/bot/handlers.js` | Authorization and Telegram command/OTP handlers |
| `owj-token-bot/src/divar/apiLogin.js` | Divar OTP initiation/consumption and token extraction |
| `owj-token-bot/src/divar/tokens.js` | JSON account storage and status changes |
| `owj-token-bot/src/api/server.js` | Token assignment, health, CAPTCHA, success, and alert endpoints |

### Bot configuration

These values belong in `owj-token-bot/.env` because the bot starts with that directory as its working directory:

| Variable | Default | Purpose |
| --- | --- | --- |
| `TELEGRAM_BOT_TOKEN` | required | BotFather token |
| `ALLOWED_TELEGRAM_USERS` | required | Comma-separated numeric Telegram user/chat IDs |
| `ACCOUNTS_FILE` | `./data/accounts.json` | Account token store |
| `API_HOST` | `127.0.0.1` | Express bind address |
| `API_PORT` | `3456` | Express port |

## 5. Running the system

The code uses ES modules, Playwright, the global Fetch API, and `AbortSignal.timeout`; a current Node.js LTS release is recommended.

Install both projects' dependencies:

```bash
npm install
npm --prefix owj-token-bot install
npx playwright install chromium
```

Create the two untracked environment files:

```dotenv
# .env
TOKEN_API_URL=http://127.0.0.1:3456
WORKER_ID=worker-standalone
```

```dotenv
# owj-token-bot/.env
TELEGRAM_BOT_TOKEN=replace_me
ALLOWED_TELEGRAM_USERS=replace_me
ACCOUNTS_FILE=./data/accounts.json
API_HOST=127.0.0.1
API_PORT=3456
```

Then run:

```bash
npm start
```

If there is no active account, use `/login 09xxxxxxxxx` in Telegram and send the OTP. The launcher polls `/health` and starts the crawler as soon as an active account appears.

Useful individual commands:

| Command | Use |
| --- | --- |
| `npm start` | Start and supervise both projects |
| `npm run start:crawler` | Start only the crawler |
| `npm run start:bot` | Start only the token bot/API |
| `npm --prefix owj-token-bot run dev` | Run the bot with Node watch mode |
| `npm test` | Run the root unit/integration-style Node test suite |

## 6. Reliability and operational behavior

- Listing URLs are deduplicated by token before detail work begins.
- `RESUME=true` skips existing files only when their JSON, token, URL, and title are valid.
- Listing and combined files use temporary-file-plus-rename atomic writes.
- Only transient navigation/network errors are retried; one failed listing does not stop the pool.
- SIGINT/SIGTERM stops new detail jobs and allows a bounded graceful-shutdown period.
- All contact workers in one crawler process share a throttle and a CAPTCHA pause gate.
- A CAPTCHA marks the assigned account inactive, notifies Telegram admins, and triggers account replacement or polling for a new login.
- Sensitive query parameters are redacted from saved search diagnostics.

## 7. Security and data handling

- `.env`, generated `data/`, screenshots, logs, bot account data, and `node_modules/` are ignored by Git.
- `owj-token-bot/data/accounts.json` contains live authentication tokens and must be treated as a secret.
- The token API returns full tokens and has no HTTP authentication. Keeping `API_HOST=127.0.0.1` is therefore important unless authentication and network controls are added.
- The Telegram allowlist protects bot commands, but every listed ID can list or delete stored accounts and initiate login.
- The persistent `.browser-profile/` may contain browsing/session data. It is currently present in the repository history/worktree and deserves the same protection as other credential-bearing state.
- The project calls private/implementation-specific Divar endpoints and scrapes page structure. Endpoint, markup, anti-automation, and platform-policy changes can break the system.

## 8. Tests

The root test suite uses Node's built-in test runner and covers:

- Persian/Arabic digit, money, boolean, URL, phone, coordinate, image, and listing normalization.
- Search limit and deduplication behavior.
- Authentication/contact classification.
- Worker-pool concurrency, failure isolation, retry bounds, atomic persistence, and resume behavior.
- Detection of a newly available token while polling.

`test/test-contact.js` is a manual Playwright contact check rather than a file matched by the normal `npm test` command. The token-bot project currently has no declared test script.

## 9. Current caveats and maintenance notes

1. **Docker configuration is not aligned with the current implementation.** `docker-compose.yml` defines Redis and five token/proxy-based workers, but the repository has no Dockerfile, the current dependencies contain no Redis client, and the crawler obtains accounts from `TOKEN_API_URL` rather than `DIVAR_ACCESS_TOKEN`. Treat this compose file as legacy/incomplete until it is redesigned.
2. **The token API is local-trust only.** Do not expose it directly to an untrusted network.
3. **Account writes are not atomic or locked.** Concurrent bot/API status updates could overwrite one another in unusual timing conditions.
4. **Assignments are process-local.** Restarting the bot forgets worker assignments, though stored accounts remain.
5. **Browser profile files are noisy and sensitive.** They produce frequent worktree changes and may retain cookies/history. Moving runtime state outside the tracked tree or fully removing it from version control would simplify operation.
6. **There are two slightly different fallback token API hostnames.** Most code uses `127.0.0.1`, while `src/crawler/tokenClient.js` defaults to `localhost`; explicitly setting `TOKEN_API_URL` avoids ambiguity.
7. **Dependencies are installed separately.** The root launcher does not make this an npm workspace, so both lockfiles and both `node_modules` trees must be maintained.

## 10. Directory map

```text
owjcrawler/
├── package.json                 Root scripts and crawler dependencies
├── scripts/start-all.js         Two-process launcher/supervisor
├── src/                         Crawler application
│   ├── index.js                 Root crawler entry point
│   ├── config.js
│   ├── crawler/                 Search, listing, contact, session, and token logic
│   ├── parsers/                 Real-estate normalization
│   ├── storage/                 JSON persistence
│   ├── utils/                   Text, phone, URL, image, coordinate, and alert helpers
│   └── workers/                 Concurrent detail processing
├── test/                        Root automated tests and one manual contact check
├── data/                        Generated crawler data (ignored)
├── screenshots/                 Failure/debug images (ignored)
├── .browser-profile/            Persistent Chromium profile
├── owj-token-bot/               Second Node.js project
│   ├── package.json
│   ├── src/
│   │   ├── index.js             Bot/API entry point
│   │   ├── api/server.js        Local Express API
│   │   ├── bot/handlers.js      Telegram behavior
│   │   └── divar/               OTP login and account storage
│   └── data/                    Stored accounts (ignored)
└── docker-compose.yml           Currently incomplete/legacy deployment design
```
