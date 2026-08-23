# Owj Market Analytics

Public-only, live/incremental market analytics for the Owj crawler repository.

This service currently:

- loads Divar's live Tehran area directory;
- queues every area under the public `buy-apartment` category;
- discovers 15 apartment-sale listings per area, paginating until the target or confirmed source exhaustion;
- extracts each listing from Divar's public `posts-v2` JSON, with HTML as fallback;
- blocks the Divar contact endpoint at the browser network layer;
- stores current listings and observation history as JSON;
- groups listings into coordinate-based spatial cells and updates online regression state after every listing;
- computes nearby comparables, highest nearby prices, predictions, and explainable scores;
- exposes all service responses as JSON;
- writes structured, redacted JSONL logs for the complete flow.

It does not use the Telegram token bot, access tokens, contact buttons, or authenticated phone APIs.

## Offline scoring pipeline

The scoring pipeline is intentionally separate from crawling. It reads the
existing `data/listings.json` snapshot and never invokes a browser or Divar:

```text
listings.json -> scoring-ready.json -> scoring model -> scored-listings.json
```

Run it from the repository root:

```bash
npm run score:analytics
```

Cleaning rejects records with unsafe required values (category, price, area, or
coordinates). Optional missing values are imputed from auditable area-band
medians or explicit neutral amenity values, and every imputed field is recorded.
The generated scoring-ready and scored documents are checked recursively and
cannot contain `null` or `undefined` values.

The hedonic price model produces a deterministic five-fold out-of-sample
prediction for every listing. It includes nonlinear size and age effects,
relative floor position, unit density, amenities, missingness, amenity
interactions, coordinate accuracy, and spatial basis features across Tehran.
A separate comparable benchmark ranks candidates by location, area, age,
rooms, floor, amenities, and unit density, then adjusts each comparable to the
subject property's attributes before robust aggregation. Confidence and risk
gates can only reduce deal value; property quality is reported separately so a
desirable but overpriced apartment is not mislabeled as a bargain.

Generated files:

| File | Contents |
| --- | --- |
| `data/scoring-ready.json` | Clean no-null records, imputation flags, and rejection audit |
| `data/scoring-model.json` | Location-aware ridge coefficients and cross-validation results |
| `data/scored-listings.json` | Every eligible ad, valuation, score components, evidence, and rank |
| `data/scoring-report.json` | End-to-end counts, validation, distributions, paths, and callback events |
| `logs/scoring.jsonl` | Structured pipeline progress and completion logs |

The JSON contracts are `schemas/scoring-ready.schema.json` and
`schemas/scored-listings.schema.json`.

For every discovered `/v/TOKEN` URL, the collector requests
`https://api.divar.ir/v8/posts-v2/web/TOKEN` with minimal public headers. It does
not copy browser cookies, access tokens, tracker session IDs, or the response's
contact metadata. A `403` or `429` activates the existing platform backoff
guardrail instead of attempting the HTML fallback.

## Start

From the repository root:

```bash
npm run build:analytics-dashboard
npm run start:analytics
```

Open `http://127.0.0.1:4567/` for the React operations dashboard. It refreshes
every 30 seconds and exposes the exact combined payload in a collapsible JSON
viewer. The score-detail table exposes every recommended ad's value, quality,
risk and confidence factors, their weighted contributions, benchmark price gaps, and supporting
sample counts. Select an ad to open `/listing/:token`, which explains its price
benchmarks, formula, confidence, cleaning history, property inputs, and nearby
comparables. Open `/score-analytics` for validation, distributions, score bands,
cleaning losses, coordinate quality, and neighborhood sample behavior. For
dashboard-only development, keep the analytics service running and
use `npm run dev:analytics-dashboard`; Vite proxies JSON requests to port 4567.

Copy `.env.example` to `.env` inside this directory to override defaults. Automatic crawling is disabled by default: the analytics service starts only the JSON server and dashboard. Set `ANALYTICS_AUTO_CRAWL=true` to start one crawl when the server becomes ready and repeat every six hours (`ANALYTICS_CRAWL_INTERVAL_MS=21600000`). The collector targets 15 listings per Divar Tehran area (`ANALYTICS_LISTINGS_PER_AREA=15`). Public search pagination continues until every area reaches that target. If Divar reports no next page, stops returning new tokens for the configured stall limit, sends a platform-limit response, or the run-wide safety ceiling is reached, the crawler records an explicit shortfall instead of looping forever. Set `ANALYTICS_MAX_AREAS=3` for a quick 45-listing development crawl; `0` means every available Tehran area. `ANALYTICS_MAX_LISTINGS=10000` is the run-wide safety ceiling. A manual crawl can still be triggered with `POST /crawl`.

Each stored record keeps both the actual `subcategory`/`neighborhood` returned by
the detail API and a `crawlPartition` object containing the requested category
and area. This makes category mismatches, duplicate listings, and sparse areas
auditable instead of silently mixing their data.

## JSON endpoints

| Method | Route | Description |
| --- | --- | --- |
| `GET` | `/health` | Service, crawl, file, and guardrail status |
| `GET` | `/dashboard` | Decision-focused crawl, quality, coordinate, model, and recommendation view |
| `GET` | `/scores?limit=100&offset=0&sort=recommendation&direction=desc&query=` | Paginated, searchable scores from `scored-listings.json` |
| `GET` | `/score-details/:token` | Complete scoring explanation and population rank for one ad |
| `GET` | `/score-analytics-data` | Population-level validation, distributions, cleaning, and neighborhood metrics |
| `GET` | `/scoring-report` | Latest cleaning/model/scoring pipeline report |
| `POST` | `/crawl` | Start a live crawl in the background |
| `GET` | `/crawl` | Current live crawl progress |
| `GET` | `/listings?limit=50&offset=0&area=abshar&category=buy-apartment` | Current public listings, optionally filtered by crawl area/category |
| `GET` | `/listings/:token/analysis` | Current comparables, prediction, and score |
| `GET` | `/areas` | Live coordinate-cell statistics |
| `GET` | `/areas/:areaId` | Statistics for one coordinate cell |
| `GET` | `/recommendations?limit=20` | Current scored listing ranking |
| `GET` | `/analytics` | Live aggregate/model summary |
| `GET` | `/events?limit=100` | Recent structured server events |
| `GET` | `/schemas/public-listing` | Canonical collection schema |
| `GET` | `/schemas/scoring-ready` | Canonical cleaned scoring-input schema |
| `GET` | `/schemas/scored-listings` | Canonical scoring-output schema |

Default address: `http://127.0.0.1:4567`.

## JSON files

| File | Contents |
| --- | --- |
| `data/listings/TOKEN.json` | Immediate atomic current record for each listing |
| `data/listings.json` | Combined public-listing checkpoint, refreshed every 25 changes and at crawl completion |
| `data/observations/TOKEN.json` | Append-only changed observations per token |
| `data/analytics.json` | Coordinate-cell metrics, coordinate coverage, model summaries, and final crawl recommendations |
| `data/online-models.json` | Serializable online regression state |
| `data/service-state.json` | Current/last crawl progress and guardrail counters |
| `logs/service.jsonl` | Full structured event log with sensitive values redacted |

Writes use a temporary file followed by rename. The public-listing contract is in `schemas/public-listing.schema.json`.

## Coordinate model

Location analysis does not use city, district, or neighborhood text. A listing must have valid latitude and longitude to receive local comparisons or a score. Listings without coordinates remain stored but return `insufficient-data` for sale analysis.

Coordinates are mapped to deterministic Web Mercator cells. The default nominal cell size is 1,000 metres and can be changed with `ANALYTICS_SPATIAL_CELL_SIZE_METERS`. Nearby comparisons use Haversine distance and expand through 500 m, 1 km, 2 km, 3 km, and 5 km until enough comparable listings are found. Divar may provide approximate rather than exact coordinates; the record's `coordinates.accuracy`, `coordinates.radiusMeters`, and `coordinates.source` fields preserve that distinction.

## Model status

The first model is an online recursive ridge-style regression for buy-apartment price per square metre. It learns incrementally only from records whose detail response confirms `buy-residential-apartment`; older rental, commercial, villa, land, and generic sale records are excluded. It maintains a global apartment-sale model and one model per coordinate cell. Predictions remain explicitly marked `experimental-not-holdout-approved` until the later validation phase is implemented and passed. When model samples are insufficient, the service uses a published coordinate-cell median baseline or returns `insufficient-data`.

Rental and other property types are outside the current collection and model scope.

## Logs

Console output and `logs/service.jsonl` contain events for:

- startup and shutdown;
- HTTP requests and response times;
- discovery partitions and counts;
- area-queue size, per-area target, shortfall, duplicates, and requested area;
- every listing start, success, failure, duration, and live analysis result;
- public detail API success, field coverage, and HTML fallback outcomes;
- model updates;
- HTTP warnings and platform backoff signals;
- forbidden contact-endpoint attempts.

The `/events` endpoint provides the latest in-memory log records as JSON.

## Tests

```bash
npm run test:analytics
```

Tests cover public-field projection, PII removal, contact endpoint blocking, schema constraints, coordinate-cell calculations, coordinate-only nearby comparisons, online model migration and updates, scoring, missing-coordinate exclusion, and rental exclusion.
