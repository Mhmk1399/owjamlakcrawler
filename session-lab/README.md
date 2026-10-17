# Divar session observation lab

Manually log in through a headed Playwright browser and measure whether an authenticated
browser session remains usable. This lab never requests OTPs or retrieves advertiser contact details.

## Install into the existing repo

Copy the `session-lab` directory into the root of `owjcrawler`, replacing only its
matching `session-lab` files. From the repository root:

```bash
npm pkg set 'scripts.session-lab=npm --prefix session-lab run session-lab'
npm pkg set 'scripts.session-lab:report=npm --prefix session-lab run session-lab:report'
npm pkg set 'scripts.session-lab:test=npm --prefix session-lab run session-lab:test'
cd session-lab
npm install
npm run check
npm run session-lab:test
npm run session-lab
```

A Chromium window opens. Use the official login interface and enter the OTP yourself.
When the UI clearly shows an authenticated account, monitoring begins automatically.
Otherwise type `login` in the CLI **after** finishing login; this is a single confirmation,
not a permanent authentication override.

Commands: `help`, `login`, `status`, `checkpoint`, `mark <label>`, `restart`,
`pause`, `resume`, `report`, `exit`.

The tool performs at most one read-only navigation to the configured account-owned verification
page per scheduled checkpoint. It does not use the contact-disclosure API for health checks.
It pauses active checkpoints on platform restrictions and never attempts evasion.

Results appear in `session-lab/results/experiment-*/`:
- `events.jsonl`: sanitized network and control events
- `checkpoints.csv`: chronological comparison table
- `session-report.json`: structured results including cookie *metadata* (never values)
- `session-report.md`: interpretation notes

Browser profile lives in `session-lab/.profile/`. Treat the profile as sensitive because it
contains legitimate browser session credentials. Never upload, commit or share that folder.

**Limitations:** visible UI signals can be ambiguous; `UNKNOWN` must not be treated as logged in
or logged out. HTTP status alone does not prove the session expired. A closed browser ends
live observation; restart the process to begin a new experiment.

No live network activity is performed by the unit tests or typecheck.
