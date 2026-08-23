import { useCallback, useEffect, useMemo, useState } from "react";

const number = new Intl.NumberFormat("en-US");
const decimal = new Intl.NumberFormat("en-US", { maximumFractionDigits: 1 });
const dateTime = new Intl.DateTimeFormat("en-GB", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "Asia/Tehran",
});

function formatNumber(value) {
  return Number.isFinite(value) ? number.format(value) : "—";
}

function formatPercent(value) {
  return Number.isFinite(value) ? `${decimal.format(value)}%` : "—";
}

function formatSignedPercent(value) {
  if (!Number.isFinite(value)) return "—";
  return `${value > 0 ? "+" : ""}${decimal.format(value)}%`;
}

function formatTime(value) {
  if (!value) return "—";
  const parsed = new Date(value);
  return Number.isNaN(parsed.valueOf()) ? "—" : dateTime.format(parsed);
}

function formatDuration(milliseconds) {
  if (!Number.isFinite(milliseconds)) return "—";
  const minutes = Math.floor(milliseconds / 60_000);
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  return hours ? `${hours}h ${remainder}m` : `${minutes}m`;
}

function formatMoney(value) {
  if (!Number.isFinite(value)) return "—";
  if (value >= 1_000_000_000) return `${decimal.format(value / 1_000_000_000)}B toman`;
  if (value >= 1_000_000) return `${decimal.format(value / 1_000_000)}M toman`;
  return `${formatNumber(value)} toman`;
}

function clamp(value) {
  return Math.max(0, Math.min(100, Number(value) || 0));
}

function Icon({ name, size = 20 }) {
  const paths = {
    activity: <><path d="M3 12h4l2.3-7 4.4 14 2.3-7h5" /></>,
    alert: <><path d="M12 3 2.7 19h18.6L12 3Z" /><path d="M12 9v4" /><path d="M12 16.5h.01" /></>,
    area: <><path d="M4 5h16v14H4z" /><path d="m4 14 4-4 4 3 4-5 4 4" /></>,
    check: <><path d="m5 12 4 4L19 6" /></>,
    chevron: <><path d="m9 18 6-6-6-6" /></>,
    database: <><ellipse cx="12" cy="5" rx="8" ry="3" /><path d="M4 5v7c0 1.7 3.6 3 8 3s8-1.3 8-3V5" /><path d="M4 12v7c0 1.7 3.6 3 8 3s8-1.3 8-3v-7" /></>,
    location: <><path d="M20 10c0 5-8 11-8 11S4 15 4 10a8 8 0 1 1 16 0Z" /><circle cx="12" cy="10" r="2.5" /></>,
    refresh: <><path d="M20 7v5h-5" /><path d="M4 17v-5h5" /><path d="M6.1 8a7 7 0 0 1 11.7-2L20 8" /><path d="m4 16 2.2 2a7 7 0 0 0 11.7-2" /></>,
    search: <><circle cx="11" cy="11" r="7" /><path d="m20 20-4-4" /></>,
    spark: <><path d="m12 3 1.4 4.6L18 9l-4.6 1.4L12 15l-1.4-4.6L6 9l4.6-1.4L12 3Z" /><path d="m19 15 .7 2.3L22 18l-2.3.7L19 21l-.7-2.3L16 18l2.3-.7L19 15Z" /></>,
    trend: <><path d="m3 17 6-6 4 4 8-9" /><path d="M15 6h6v6" /></>,
  };
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <g stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        {paths[name] || paths.activity}
      </g>
    </svg>
  );
}

function Progress({ value, tone = "cyan", label }) {
  return (
    <div className="progress" aria-label={label}>
      <span className={`progress__fill progress__fill--${tone}`} style={{ width: `${clamp(value)}%` }} />
    </div>
  );
}

function KpiCard({ eyebrow, value, detail, progress, tone, icon }) {
  return (
    <article className={`kpi-card kpi-card--${tone}`}>
      <div className="kpi-card__top">
        <span className="kpi-card__eyebrow">{eyebrow}</span>
        <span className="kpi-card__icon"><Icon name={icon} /></span>
      </div>
      <strong className="kpi-card__value">{value}</strong>
      <div className="kpi-card__bottom">
        <span>{detail}</span>
        {Number.isFinite(progress) && <span>{formatPercent(progress)}</span>}
      </div>
      {Number.isFinite(progress) && <Progress value={progress} tone={tone} label={`${eyebrow}: ${progress}%`} />}
    </article>
  );
}

function SectionHeading({ kicker, title, description, aside }) {
  return (
    <div className="section-heading">
      <div>
        <span className="section-heading__kicker">{kicker}</span>
        <h2>{title}</h2>
        {description && <p>{description}</p>}
      </div>
      {aside}
    </div>
  );
}

function AttentionCard({ tone, icon, title, value, text }) {
  return (
    <article className={`attention-card attention-card--${tone}`}>
      <span className="attention-card__icon"><Icon name={icon} /></span>
      <div>
        <span className="attention-card__value">{value}</span>
        <h3>{title}</h3>
        <p>{text}</p>
      </div>
    </article>
  );
}

function LocationQuality({ data }) {
  const available = data.available || 0;
  const exactShare = available ? data.exact / available * 100 : 0;
  const approximateShare = available ? data.approximate / available * 100 : 0;
  const donutStyle = {
    background: `conic-gradient(var(--cyan) 0 ${exactShare}%, var(--orange) ${exactShare}% ${exactShare + approximateShare}%, var(--muted) ${exactShare + approximateShare}% 100%)`,
  };
  return (
    <article className="panel location-panel">
      <SectionHeading
        kicker="Location signal"
        title="Coordinate confidence"
        description="Exact pins are strongest. Approximate pins remain useful but represent a 500 m privacy radius."
      />
      <div className="location-layout">
        <div className="donut" style={donutStyle}>
          <div className="donut__center">
            <strong>{formatPercent(data.coverage)}</strong>
            <span>covered</span>
          </div>
        </div>
        <div className="legend-list">
          <div><span className="legend-dot legend-dot--exact" /><span>Exact</span><strong>{formatNumber(data.exact)}</strong></div>
          <div><span className="legend-dot legend-dot--approx" /><span>Approximate</span><strong>{formatNumber(data.approximate)}</strong></div>
          <div><span className="legend-dot legend-dot--missing" /><span>Missing</span><strong>{formatNumber(data.missing)}</strong></div>
        </div>
      </div>
      <div className="match-strip">
        <div>
          <span>Requested area matches detail</span>
          <strong>{formatPercent(data.areaMatchRate)}</strong>
        </div>
        <Progress value={data.areaMatchRate} tone="cyan" label="Area match rate" />
        <small>{formatNumber(data.areaMatches)} of {formatNumber(data.areaChecks)} checked records</small>
      </div>
    </article>
  );
}

function ModelReadiness({ data }) {
  const global = data.global || {};
  const globalProgress = global.minimumRequired
    ? Math.min(100, (global.count || 0) / global.minimumRequired * 100)
    : 0;
  const areaProgress = data.areaModelCount
    ? data.readyAreaModelCount / data.areaModelCount * 100
    : 0;
  return (
    <article className="panel model-panel">
      <SectionHeading
        kicker="Regression"
        title="Model readiness"
        description="Readiness means enough samples to run; it does not replace holdout validation."
      />
      <div className="model-status">
        <span className="model-status__pulse" />
        <div>
          <strong>{global.status === "experimental-ready" ? "Experimental model active" : "Collecting samples"}</strong>
          <span>{data.scope}</span>
        </div>
      </div>
      <div className="model-metric">
        <div><span>Global observations</span><strong>{formatNumber(global.count)}</strong></div>
        <Progress value={globalProgress} tone="orange" label="Global model sample readiness" />
        <small>Minimum: {formatNumber(global.minimumRequired)}</small>
      </div>
      <div className="model-metric">
        <div><span>Ready spatial models</span><strong>{formatNumber(data.readyAreaModelCount)} / {formatNumber(data.areaModelCount)}</strong></div>
        <Progress value={areaProgress} tone="cyan" label="Spatial model readiness" />
        <small>{formatNumber(data.publishedSpatialAreaCount)} of {formatNumber(data.spatialAreaCount)} spatial cells published</small>
      </div>
      <div className="experimental-note"><Icon name="alert" size={17} /> Scores are experimental until time-based holdout validation passes.</div>
    </article>
  );
}

function AreaCoverage({ data }) {
  const [query, setQuery] = useState("");
  const [shortfallsOnly, setShortfallsOnly] = useState(false);
  const [visible, setVisible] = useState(20);
  const filtered = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase("fa");
    return [...(data.areas || [])]
      .filter((area) => !shortfallsOnly || area.shortfall > 0)
      .filter((area) => !needle || `${area.name} ${area.slug}`.toLocaleLowerCase("fa").includes(needle))
      .sort((left, right) => right.shortfall - left.shortfall || left.name.localeCompare(right.name, "fa"));
  }, [data.areas, query, shortfallsOnly]);

  useEffect(() => setVisible(20), [query, shortfallsOnly]);

  return (
    <section className="panel coverage-panel">
      <SectionHeading
        kicker="453-area queue"
        title="Area discovery coverage"
        description="A shortfall means Divar returned fewer than the ten requested apartment listings."
        aside={(
          <div className="coverage-summary">
            <strong>{formatNumber(data.complete)}</strong>
            <span>areas at target</span>
          </div>
        )}
      />
      <div className="coverage-tools">
        <label className="search-field">
          <Icon name="search" size={18} />
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search area or slug" />
        </label>
        <label className="check-field">
          <input type="checkbox" checked={shortfallsOnly} onChange={(event) => setShortfallsOnly(event.target.checked)} />
          <span>Only shortfalls</span>
        </label>
        <span className="result-count">{formatNumber(filtered.length)} results</span>
      </div>
      <div className="table-wrap">
        <table>
          <thead><tr><th>Area</th><th>Found</th><th>Target</th><th>Shortfall</th><th>Duplicates</th><th>Status</th></tr></thead>
          <tbody>
            {filtered.slice(0, visible).map((area) => (
              <tr key={area.id ?? area.slug}>
                <td>
                  <a href={area.url || "#"} target="_blank" rel="noreferrer" className="area-name">
                    <strong dir="auto">{area.name}</strong><span>{area.slug}</span>
                  </a>
                </td>
                <td>{formatNumber(area.discovered)}</td>
                <td>{formatNumber(area.target)}</td>
                <td className={area.shortfall ? "cell-warn" : ""}>{formatNumber(area.shortfall)}</td>
                <td>{formatNumber(area.duplicates)}</td>
                <td><span className={`status-badge status-badge--${area.shortfall ? "warn" : "good"}`}>{area.shortfall ? "Review" : "Complete"}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {visible < filtered.length && (
        <button className="load-more" onClick={() => setVisible((value) => value + 20)}>Show 20 more</button>
      )}
    </section>
  );
}

const SCORE_FACTORS = [
  { key: "dealValue", label: "Deal value", short: "Deal", weight: null, description: "Value evidence before the confidence gate" },
  { key: "modelValue", label: "Model value", short: "Model", weight: 0.45, description: "Discount percentile against the out-of-fold location model" },
  { key: "nearbyValue", label: "Nearby value", short: "Nearby", weight: 0.4, description: "Discount percentile against robust nearby comparables" },
  { key: "localPosition", label: "Local position", short: "Position", weight: 0.15, description: "Price-per-metre position inside the local comparable set" },
  { key: "confidence", label: "Confidence", short: "Confidence", weight: null, description: "Validation, comparable, coordinate and data-quality evidence" },
  { key: "dataQuality", label: "Data quality", short: "Quality", weight: null, description: "Penalty for explicitly imputed source fields" },
  { key: "propertyQuality", label: "Property quality", short: "Property", weight: null, description: "Age, floor position, unit density and amenity quality; reported separately from value" },
  { key: "risk", label: "Risk", short: "Risk", weight: null, inverse: true, description: "Higher means unusual price, disagreement, dispersion or incomplete evidence" },
];

function scoreMetric(item, key) {
  if (key === "score" || key === "recommendation") return item.scores?.recommendation ?? item.score;
  if (key === "modelDiscountPct") return item.valuation?.modelDiscountPct ?? item.prediction?.askingVsPredictionPct;
  if (key === "nearbyDiscountPct") return item.valuation?.nearbyDiscountPct ?? item.prediction?.askingVsNearbyPct;
  return item.scores?.[key] ?? item.components?.[key];
}

function FactorScore({ value, weight, inverse = false }) {
  if (!Number.isFinite(value)) return <span className="metric-empty">—</span>;
  const interpreted = inverse ? 100 - value : value;
  const tone = interpreted >= 75 ? "high" : interpreted >= 45 ? "medium" : "low";
  return (
    <div className={`factor-score factor-score--${tone}`} title={weight ? `${decimal.format(value * weight)} weighted deal-value points` : `${value} points`}>
      <div><strong>{formatNumber(value)}</strong><small>{weight ? `+${decimal.format(value * weight)}` : "raw"}</small></div>
      <span><i style={{ width: `${clamp(value)}%` }} /></span>
    </div>
  );
}

function GapValue({ value }) {
  const tone = !Number.isFinite(value) ? "empty" : value >= 0 ? "good" : "bad";
  return <span className={`gap-value gap-value--${tone}`}>{formatSignedPercent(value)}</span>;
}

function Recommendations({ data }) {
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState({ key: "recommendation", direction: "desc" });
  const [remoteRows, setRemoteRows] = useState(data.listings || data.top || []);
  const [filteredTotal, setFilteredTotal] = useState(data.count || 0);
  const [tableLoading, setTableLoading] = useState(false);
  const pipelineAvailable = data.available === true;

  useEffect(() => {
    setRemoteRows(data.listings || data.top || []);
    setFilteredTotal(data.count || 0);
  }, [data.generatedAt, data.count, data.listings, data.top]);

  useEffect(() => {
    if (!pipelineAvailable) return undefined;
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setTableLoading(true);
      try {
        const parameters = new URLSearchParams({
          limit: "100",
          offset: "0",
          query,
          sort: sort.key,
          direction: sort.direction,
        });
        const response = await fetch(`/scores?${parameters}`, { signal: controller.signal });
        if (!response.ok) throw new Error(`Score API returned HTTP ${response.status}`);
        const payload = await response.json();
        setRemoteRows(payload.listings || []);
        setFilteredTotal(payload.filteredTotal || 0);
      } catch (caught) {
        if (caught.name !== "AbortError") setRemoteRows([]);
      } finally {
        if (!controller.signal.aborted) setTableLoading(false);
      }
    }, 220);
    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [pipelineAvailable, query, sort]);

  const rows = useMemo(() => {
    if (pipelineAvailable) return remoteRows;
    const needle = query.trim().toLocaleLowerCase("fa");
    return [...(data.top || [])]
      .filter((item) => !needle || `${item.title} ${item.token} ${item.neighborhood}`.toLocaleLowerCase("fa").includes(needle))
      .sort((left, right) => {
        if (sort.key === "listing") {
          const result = (left.title || "").localeCompare(right.title || "", "fa");
          return sort.direction === "asc" ? result : -result;
        }
        const leftValue = scoreMetric(left, sort.key);
        const rightValue = scoreMetric(right, sort.key);
        if (!Number.isFinite(leftValue)) return 1;
        if (!Number.isFinite(rightValue)) return -1;
        return sort.direction === "asc" ? leftValue - rightValue : rightValue - leftValue;
      });
  }, [data.top, pipelineAvailable, query, remoteRows, sort]);

  async function loadMore() {
    if (!pipelineAvailable || tableLoading || rows.length >= filteredTotal) return;
    setTableLoading(true);
    try {
      const parameters = new URLSearchParams({
        limit: "100",
        offset: String(rows.length),
        query,
        sort: sort.key,
        direction: sort.direction,
      });
      const response = await fetch(`/scores?${parameters}`);
      if (!response.ok) throw new Error(`Score API returned HTTP ${response.status}`);
      const payload = await response.json();
      setRemoteRows((current) => [...current, ...(payload.listings || [])]);
      setFilteredTotal(payload.filteredTotal || 0);
    } finally {
      setTableLoading(false);
    }
  }

  function changeSort(key) {
    setSort((current) => ({
      key,
      direction: current.key === key && current.direction === "desc" ? "asc" : "desc",
    }));
  }

  function SortHeading({ column, children, title }) {
    const active = sort.key === column;
    return (
      <button className={active ? "sort-heading sort-heading--active" : "sort-heading"} onClick={() => changeSort(column)} title={title}>
        <span>{children}</span><i>{active ? (sort.direction === "desc" ? "↓" : "↑") : "↕"}</i>
      </button>
    );
  }

  return (
    <section className="panel recommendations-panel scoring-panel">
      <SectionHeading
        kicker="Suggestion system"
        title="Ad scoring details"
        description="A cross-fitted hedonic model and attribute-adjusted comparables create deal value; confidence and risk gates can only reduce the final recommendation."
        aside={<div className="coverage-summary"><strong>{formatNumber(data.summary?.scoreDistribution?.median ?? data.averageScore ?? 0)}</strong><span>median score</span></div>}
      />
      <div className="scoring-tools">
        <label className="search-field">
          <Icon name="search" size={18} />
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search ad, token or neighborhood" />
        </label>
        <span className="result-count">{tableLoading ? "Updating…" : `${formatNumber(rows.length)} of ${formatNumber(filteredTotal)} scored ads`}</span>
      </div>
      <div className="table-wrap scoring-table-wrap">
        <table className="scoring-table">
          <thead>
            <tr>
              <th className="scoring-table__listing"><SortHeading column="listing">Ad</SortHeading></th>
              <th><SortHeading column="recommendation" title="Confidence-adjusted recommendation score">Final</SortHeading></th>
              {SCORE_FACTORS.map((factor) => (
                <th key={factor.key} title={`${factor.description}${factor.weight ? `; weight ${factor.weight * 100}%` : ""}`}>
                  <SortHeading column={factor.key}>{factor.short}{factor.weight && <small>{factor.weight * 100}% of deal</small>}</SortHeading>
                </th>
              ))}
              <th><SortHeading column="modelDiscountPct" title="Positive means priced below the model">model discount</SortHeading></th>
              <th><SortHeading column="nearbyDiscountPct" title="Positive means priced below nearby comparables">nearby discount</SortHeading></th>
              <th>Evidence</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((item) => (
              <tr key={item.token}>
                <td className="scoring-table__listing">
                  <a className="scored-ad" href={`/listing/${encodeURIComponent(item.token)}`}>
                    <strong dir="auto">{item.title || item.token}</strong>
                    <span dir="auto">{item.neighborhood || "Unknown area"} · {formatNumber(item.property?.area ?? item.area)} m² · {formatMoney(item.asking?.askingPrice ?? item.askingPrice)}</span>
                    <small>{item.token} · {item.location?.accuracy ?? item.coordinateAccuracy ?? "unknown"} coordinates</small>
                  </a>
                </td>
                <td><div className={`final-score final-score--${scoreMetric(item, "recommendation") >= 80 ? "high" : scoreMetric(item, "recommendation") >= 60 ? "medium" : "low"}`}>{formatNumber(scoreMetric(item, "recommendation"))}</div></td>
                {SCORE_FACTORS.map((factor) => (
                  <td key={factor.key}><FactorScore value={scoreMetric(item, factor.key)} weight={factor.weight} inverse={factor.inverse} /></td>
                ))}
                <td><GapValue value={scoreMetric(item, "modelDiscountPct")} /></td>
                <td><GapValue value={scoreMetric(item, "nearbyDiscountPct")} /></td>
                <td>
                  <div className="evidence-cell">
                    <strong>{formatNumber(item.evidence?.comparableCount ?? item.prediction?.modelSampleCount)}</strong><span>{item.evidence ? "comparables" : "model samples"}</span>
                    <small>{item.evidence ? `${formatPercent(item.evidence.valuationValidationMedianErrorPct ?? item.evidence.modelValidationMedianErrorPct)} blended median error · cross-fitted` : `${formatNumber(item.nearby?.count)} nearby`}</small>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {pipelineAvailable && rows.length < filteredTotal && (
        <button className="load-more scoring-load-more" onClick={loadMore} disabled={tableLoading}>{tableLoading ? "Loading…" : "Show 100 more scored ads"}</button>
      )}
      {!rows.length && <div className="empty-table">No scored ads match this search.</div>}
      <p className="scoring-note"><Icon name="alert" size={16} /> Positive discounts mean the asking price is below the benchmark. Scores use cross-validated predictions, but asking prices are not completed sale prices.</p>
    </section>
  );
}

function EventStream({ events }) {
  return (
    <section className="panel events-panel">
      <SectionHeading kicker="Observability" title="Recent server events" description="Latest structured events, already redacted by the server logger." />
      <div className="event-list">
        {(events || []).slice(0, 12).map((event, index) => (
          <div className="event" key={`${event.timestamp}-${event.event}-${index}`}>
            <span className={`event__level event__level--${event.level || "info"}`} />
            <time>{formatTime(event.timestamp)}</time>
            <strong>{event.event}</strong>
            <span>{event.message}</span>
          </div>
        ))}
      </div>
    </section>
  );
}

function LoadingState() {
  return (
    <main className="state-page">
      <div className="loader-mark"><span /><span /><span /></div>
      <h1>Reading market telemetry</h1>
      <p>Combining the latest crawl, listings, coordinate quality and model state.</p>
    </main>
  );
}

function ErrorState({ error, retry }) {
  return (
    <main className="state-page">
      <span className="state-page__error"><Icon name="alert" size={28} /></span>
      <h1>Dashboard data is unavailable</h1>
      <p>{error}</p>
      <button className="button button--primary" onClick={retry}><Icon name="refresh" size={18} /> Try again</button>
    </main>
  );
}

export default function AnalyticsDashboard({ endpoint = "/dashboard", refreshMs = 30_000 }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async ({ quiet = false } = {}) => {
    if (!quiet) setRefreshing(true);
    try {
      const response = await fetch(endpoint, { headers: { accept: "application/json" } });
      if (!response.ok) throw new Error(`Server returned HTTP ${response.status}`);
      const payload = await response.json();
      if (!payload?.crawl || !payload?.overview) throw new Error("Dashboard response has an unexpected shape");
      setData(payload);
      setError(null);
    } catch (caught) {
      setError(caught.message || "Unknown dashboard error");
    } finally {
      setRefreshing(false);
    }
  }, [endpoint]);

  useEffect(() => {
    void load();
    const timer = window.setInterval(() => void load({ quiet: true }), refreshMs);
    return () => window.clearInterval(timer);
  }, [load, refreshMs]);

  if (!data && !error) return <LoadingState />;
  if (!data && error) return <ErrorState error={error} retry={() => load()} />;

  const { crawl, overview, locationQuality, areaCoverage, model, recommendations, recentEvents } = data;
  const areaCompletion = crawl.areasTotal ? crawl.areasCompleted / crawl.areasTotal * 100 : 0;
  const statusTone = crawl.status === "completed" ? "good" : crawl.status === "failed" ? "bad" : "warn";

  return (
    <div className="app-shell">
      <header className="topbar">
        <a href="/" className="brand"><span className="brand__mark">O</span><span><strong>OWJ</strong><small>Market Observatory</small></span></a>
        <nav className="topnav" aria-label="Primary navigation"><a className="active" href="/">Overview</a><a href="/score-analytics">Score analytics</a></nav>
        <div className="topbar__meta">
          <span className={`run-status run-status--${statusTone}`}><i /> {crawl.status}</span>
          <span className="updated">Updated {formatTime(data.sourceUpdatedAt || data.generatedAt)}</span>
          <button className="icon-button" onClick={() => load()} disabled={refreshing} title="Refresh dashboard"><Icon name="refresh" /></button>
        </div>
      </header>

      <main>
        <section className="hero">
          <div className="hero__copy">
            <span className="hero__kicker"><Icon name="activity" size={17} /> Run intelligence / Tehran apartment sales</span>
            <h1>See whether the market data is <em>ready to trust.</em></h1>
            <p>One operational view of collection coverage, location accuracy, model readiness and the listings worth reviewing.</p>
          </div>
          <div className="run-card">
            <div className="run-card__header"><span>Latest crawl</span><strong>{crawl.runId?.slice(0, 8) || "—"}</strong></div>
            <div className="run-card__value"><strong>{formatNumber(crawl.processed)}</strong><span>processed listings</span></div>
            <Progress value={crawl.successRate} tone="cyan" label="Crawl success rate" />
            <div className="run-card__footer"><span>{formatDuration(crawl.durationMs)}</span><span>{formatNumber(crawl.areasCompleted)} / {formatNumber(crawl.areasTotal)} areas</span></div>
          </div>
        </section>

        <section className="kpi-grid" aria-label="Key quality metrics">
          <KpiCard eyebrow="Crawl success" value={formatPercent(crawl.successRate)} detail={`${formatNumber(crawl.successful)} successful · ${formatNumber(crawl.failed)} failed`} progress={crawl.successRate} tone="cyan" icon="check" />
          <KpiCard eyebrow="Area completion" value={formatPercent(areaCompletion)} detail={`${formatNumber(crawl.areasCompleted)} of ${formatNumber(crawl.areasTotal)} Divar areas`} progress={areaCompletion} tone="green" icon="area" />
          <KpiCard eyebrow="Candidate coverage" value={formatPercent(overview.candidateCoverage)} detail={`${formatNumber(crawl.discovered)} of ${formatNumber(overview.candidateTarget)} target`} progress={overview.candidateCoverage} tone="orange" icon="database" />
          <KpiCard eyebrow="Coordinate coverage" value={formatPercent(locationQuality.coverage)} detail={`${formatNumber(locationQuality.available)} usable · ${formatNumber(locationQuality.missing)} missing`} progress={locationQuality.coverage} tone="violet" icon="location" />
        </section>

        <section className="attention-section">
          <SectionHeading kicker="Quality gates" title="What needs attention" description="These are the numbers that can change collection or modeling decisions." />
          <div className="attention-grid">
            <AttentionCard tone={crawl.failed ? "warn" : "good"} icon={crawl.failed ? "alert" : "check"} value={formatNumber(crawl.failed)} title="Failed detail records" text={crawl.failed ? "Inspect crawl.listing.failure events before treating coverage as complete." : "No listing detail failures in this run."} />
            <AttentionCard tone={areaCoverage.withShortfall ? "warn" : "good"} icon="area" value={formatNumber(areaCoverage.withShortfall)} title="Areas below target" text={`${formatNumber(areaCoverage.totalShortfall)} total listings short of the configured per-area target.`} />
            <AttentionCard tone={locationQuality.missing ? "warn" : "good"} icon="location" value={formatNumber(locationQuality.missing)} title="Listings without coordinates" text="Stored safely, but excluded from coordinate comparisons and scoring." />
            <AttentionCard tone={crawl.contactEndpointAttempts ? "bad" : "good"} icon={crawl.contactEndpointAttempts ? "alert" : "check"} value={formatNumber(crawl.contactEndpointAttempts)} title="Contact endpoint attempts" text={crawl.contactEndpointAttempts ? "Guardrail activity detected; investigate immediately." : "Public-only collection guardrail remained clean."} />
          </div>
        </section>

        <section className="split-grid">
          <LocationQuality data={locationQuality} />
          <ModelReadiness data={model} />
        </section>

        <AreaCoverage data={areaCoverage} />
        <div id="scored-listings"><Recommendations data={data.scoring?.available ? data.scoring : recommendations} /></div>
        <EventStream events={recentEvents} />

        <details className="raw-panel">
          <summary><span><Icon name="database" size={18} /> Dashboard JSON</span><span>Inspect the exact API payload</span></summary>
          <pre>{JSON.stringify(data, null, 2)}</pre>
        </details>
      </main>

      <footer>
        <span>OWJ Market Analytics · public data only</span>
        <span>Scores are experimental decision aids, not investment advice.</span>
      </footer>
    </div>
  );
}
