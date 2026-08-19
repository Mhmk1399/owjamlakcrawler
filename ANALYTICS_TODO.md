# Market Analytics Service TODO

This checklist follows `ANALYTICS_SERVICE_PLAN.md`. Production modeling must not start until the public-only pilot and data-quality gates pass.

## Approval and scope

- [x] Collect all configured public real-estate categories; score eligible sale listings first.
- [x] Use live incremental processing, a 1.5-second public-detail interval, and six-hour recurring crawls by default.
- [x] Use versioned JSON now, preserving its document model for a later NoSQL store.
- [x] Return JSON files and a read-only JSON HTTP API.
- [ ] Approve minimum sample and model-quality thresholds.

## Service scaffold

- [x] Create `owj-market-analytics/package.json` and entry point.
- [x] Add validated environment configuration.
- [x] Add separate anonymous Playwright context.
- [x] Use versioned, atomic JSON documents as requested instead of a database.
- [x] Add structured logs, run IDs, graceful shutdown, and health output.

## Public-only collection

- [x] Extract a reusable contact-free listing-detail path.
- [x] Ensure the analytics service does not import contact or token-client modules.
- [x] Block contact endpoint requests at the browser-context level.
- [x] Add a test that fails if any contact endpoint is requested.
- [x] Add bounded concurrency, request spacing, backoff, and run budgets.
- [x] Add configured search partitions and transparent coverage reporting.
- [x] Add token and conservative content-fingerprint deduplication.
- [x] Persist crawl runs and append-only listing observations as JSON.
- [ ] Add incremental updates and inactive/delisted observation state.

## Cleaning and profiling

- [x] Define versioned public-listing and analysis-response schemas.
- [x] Normalize Persian text/digits and toman units using the shared parser.
- [x] Keep sales, rentals, and short-term rentals separate in analytics.
- [x] Recompute price per square metre from valid sale price and area.
- [x] Validate area, rooms, year, floor, prices, and coordinates using the shared parser.
- [ ] Add explicit exclusion and warning reasons.
- [x] Remove accidental public phone/email text before analytics storage.
- [ ] Generate completeness and rejection metrics by district.
- [ ] Generate robust price/outlier distributions.
- [ ] Run and review a multi-day pilot dataset.

## District and nearby analytics

- [x] Compute count, mean, median, trimmed mean, and quantiles.
- [x] Enforce minimum segment sample sizes.
- [x] Implement Haversine distance.
- [x] Add 1 km, 2 km, and 3 km radius expansion.
- [x] Add neighborhood/district fallback for missing coordinates.
- [x] Filter comparables by type, area, rooms, and content identity.
- [ ] Add advanced similarity weights, age/recency filters, and human-readable match reasons.
- [x] Return highest nearby total price and price per square metre as context only.
- [x] Test subject-listing exclusion.

## Regression

- [ ] Require at least 1,000 eligible sale observations and 200 holdout rows.
- [ ] Implement listing/repost-group-safe, time-based train/test splitting.
- [ ] Implement versioned feature encoding.
- [ ] Train district/neighborhood median baselines.
- [ ] Train ridge-regression baseline on log price per square metre.
- [ ] Report MAE, median percentage error, log error, R², and segment metrics.
- [ ] Add held-out residual prediction intervals.
- [ ] Reject models that do not beat simple baselines.
- [ ] Store approved model artifacts, schemas, metrics, and timestamps.
- [ ] Add out-of-scope and model-drift detection.

## Listing scoring

- [ ] Implement versioned 0–100 component formula.
- [ ] Include model gap, comparable gap, local percentile, confidence, freshness, and completeness.
- [ ] Add penalties for stale, contradictory, approximate, sparse, and outlier data.
- [ ] Return `insufficient-data` instead of manufacturing weak scores.
- [ ] Store every component and explanation.
- [ ] Review extreme top/bottom scores manually before release.
- [ ] Label output as a market-ranking aid, not investment advice.

## Reporting and API

- [x] Generate district summary JSON.
- [x] Generate per-listing analysis JSON.
- [x] Add health/freshness report.
- [x] Add a local read-only JSON API with versioned responses.
- [x] Round coordinates in externally exposed listing output.
- [ ] Add filters for type, price, score, confidence, and freshness; district filtering is implemented.

## Observation guardrail checks

- [x] Contact-endpoint attempts are blocked, counted, and verified as zero in the pilot.
- [x] Token-bot/authenticated-token access is absent and reported as zero.
- [x] Crawl reports request/response events, status codes, HTTP warnings, and 429 stop behavior.
- [ ] Extraction success is at least 80% or the run is marked degraded.
- [ ] Core-field completeness changes are compared with the prior baseline.
- [ ] Segment metrics below 20 records are suppressed or clearly marked.
- [ ] Model predictions always include version and uncertainty interval.
- [ ] Score results always include confidence, components, and warnings.
- [ ] Logs and stored analytics contain no contact credentials or phone numbers.
- [ ] New model deployment is blocked when evaluation or drift gates fail.

## Verification

- [ ] Unit tests for cleaning, units, fingerprints, distance, comparables, regression, and scoring.
- [ ] Contract tests for shared crawler modules.
- [ ] Integration test using saved HTML/fixtures with all external network calls blocked.
- [ ] Database migration and recovery tests.
- [ ] Deterministic model-training test with fixed seed and fixture data.
- [ ] End-to-end pilot report reviewed against manually checked listings.
