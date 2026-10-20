# Market Analytics Crawler Enhancement Plan

This plan keeps the service public-only. No task may introduce contact-number collection, authenticated Divar requests, bot credentials, or contact endpoints.

## Scope decision

The crawler is restricted to the curated file at `src/collector/tehranFocusAreas.json`:

- 168 unique Divar neighborhood IDs
- Tehran municipal districts 3, 4, 6, 7, 8, 12, 13, 14, and 15
- Duplicate spreadsheet rows are collapsed by stable Divar place ID.
- `Assigned`, `Review`, and `Unresolved` rows remain in crawl scope.
- Conflicting municipal district assignments are retained as review metadata and never create duplicate crawl requests.

## Step-by-step backlog

| Step | Priority | Status | Enhancement | Implementation | Acceptance criteria |
|---:|---|---|---|---|---|
| 0 | P0 | Done | Curated crawl scope | Filter the live Tehran place directory by the supplied Divar place IDs. | Only configured IDs enter the queue; diagnostics show configured and queued counts; duplicates are impossible. |
| 1 | P0 | Next | Retry and real backoff | Add bounded retries with exponential delay and jitter for temporary network errors and HTTP 5xx. Respect `Retry-After`; never retry forbidden contact requests. | Retry count and delay are logged; 403/429 safety rules remain conservative; tests use fake timers/responses. |
| 2 | P0 | Planned | Failed-work recovery queue | Retain failed area searches and detail tokens, then retry them after the primary pass within a strict request budget. | Transient failures can recover; permanent failures have a final reason; successful items are not repeated. |
| 3 | P0 | Planned | Freshness-aware detail fetching | Skip recently refreshed tokens and assign refresh intervals based on listing age and previous changes. | Dashboard reports fetched, skipped-fresh, new, and refreshed counts; request volume decreases without losing new listings. |
| 4 | P0 | Planned | Listing lifecycle | Track `active`, `not-seen`, `possibly-removed`, and `removed` using repeated missed runs. | A listing is never marked removed after one missed crawl; stale listings can be excluded from current-market analytics. |
| 5 | P1 | Planned | Robust partition validation | Prefer stable place ID/slug evidence, then normalized aliases; avoid rejecting valid listings solely because the Persian label differs. | Known spelling aliases pass; genuine cross-neighborhood/category mismatches still fail with a typed reason. |
| 6 | P1 | Planned | Adaptive neighborhood quotas | Allocate crawl depth using market activity, shortfall history, sample count, staleness, and model uncertainty. | Total request budget stays fixed; underrepresented/high-value areas receive more useful coverage. |
| 7 | P1 | Planned | Fair queue rotation | Rotate the starting neighborhood between runs and make limited development runs deterministic but unbiased. | Repeated limited runs cover the entire focus list before repeating the same starting segment. |
| 8 | P1 | Planned | Local place-tree fallback | Use the bundled official place tree if the live public place directory is temporarily unavailable. | Crawl can start from the local snapshot; run metadata clearly records `live` or `local-fallback`. |
| 9 | P1 | Planned | Explicit data-quality outcomes | Classify records as scoring-ready, history-only, or rejected with typed reasons for missing/invalid fields. | Every processed token has one auditable outcome; weak records cannot silently enter scoring. |
| 10 | P1 | Planned | Request-budget enforcement | Count actual API and browser document/XHR/fetch traffic, including HTML fallback resources. | Per-run and per-minute budgets are enforced and visible in diagnostics. |
| 11 | P2 | Planned | Completion-based scheduling | Schedule the next automatic crawl relative to completion instead of service startup. | Long runs do not silently lose scheduled cycles and overlapping runs remain impossible. |
| 12 | P2 | Planned | Partial-run completeness | Save coverage and completeness flags with every analytics snapshot. | Dashboards/models can distinguish complete, stopped, failed, and partial datasets. |
| 13 | P2 | Planned | Change-history completeness | Decide which changes—images, advertiser type, quality and publication state—must create observations. | The fingerprint policy is documented and tested with representative field changes. |
| 14 | P2 | Planned | Retention and compaction | Define retention for observations, removed listings, logs, screenshots, and debug HTML. | Storage growth is bounded without deleting the latest state or required audit history. |

## Recommended delivery order

1. Reliability: steps 1–2.
2. Request efficiency and market freshness: steps 3–4.
3. Data correctness: steps 5 and 9.
4. Coverage quality: steps 6–8 and 10.
5. Operations and storage: steps 11–14.

Each step should ship with unit tests, structured log events, dashboard diagnostics, and a public-only safety regression test.
