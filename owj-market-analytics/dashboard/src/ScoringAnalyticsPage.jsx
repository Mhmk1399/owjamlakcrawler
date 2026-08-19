import { useEffect, useState } from "react";
import { AppFooter, AppHeader, ErrorPage, formatMoney, formatNumber, formatPercent, formatTime, Icon, LoadingPage } from "./shared.jsx";

function ValidationCard({ label, value, detail, tone = "cyan" }) {
  return <article className={`analytics-kpi analytics-kpi--${tone}`}><span>{label}</span><strong>{value}</strong><small>{detail}</small></article>;
}

function Dictionary({ title, values }) {
  return <div className="dictionary"><h3>{title}</h3>{Object.entries(values || {}).sort((a, b) => b[1] - a[1]).map(([key, value]) => <div key={key}><span>{key.replaceAll("-", " ")}</span><strong>{formatNumber(value)}</strong></div>)}</div>;
}

export default function ScoringAnalyticsPage() {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    fetch("/score-analytics-data", { signal: controller.signal }).then(async (response) => { if (!response.ok) throw new Error(`Server returned HTTP ${response.status}`); return response.json(); }).then(setData).catch((caught) => { if (caught.name !== "AbortError") setError(caught.message); });
    return () => controller.abort();
  }, []);
  if (!data && !error) return <LoadingPage message="Building the scoring overview" />;
  if (error) return <ErrorPage message={error} />;
  const validation = data.modelValidation;
  const cleaning = data.cleaning;
  const maxBin = Math.max(...data.distributions.histogram.map((bin) => bin.count), 1);
  const coordinateStyle = { background: `conic-gradient(var(--cyan) 0 ${data.coordinates.exactPercentage}%, var(--orange) ${data.coordinates.exactPercentage}% 100%)` };
  return (
    <div className="app-shell">
      <AppHeader active="analytics" />
      <main className="analytics-main">
        <section className="analytics-hero"><div><span className="hero__kicker"><Icon name="trend" size={17} /> Scoring run / {data.scoringVersion}</span><h1>Understand the scores <em>as a population.</em></h1><p>Validation quality, score spread, cleaning losses, coordinate confidence and neighborhood-level behavior for all {formatNumber(data.total)} scored ads.</p></div><div className="analytics-run"><span>Generated</span><strong>{formatTime(data.generatedAt)}</strong><small>{validation.method?.replaceAll("-", " ")}</small></div></section>

        <section className="analytics-kpi-grid">
          <ValidationCard label="Scored ads" value={formatNumber(data.total)} detail={`${formatNumber(cleaning.rejectedCount)} rejected before scoring`} />
          <ValidationCard label="Median validation error" value={formatPercent(validation.medianAbsolutePercentageError)} detail="Typical out-of-fold price-per-m² error" tone="orange" />
          <ValidationCard label="Within ±20%" value={formatPercent(validation.within20Percent)} detail={`${formatPercent(validation.within30Percent)} land within ±30%`} tone="green" />
          <ValidationCard label="Log-scale R²" value={validation.rSquaredLog} detail={`Quality gate ${validation.qualityScore} / 100`} tone="violet" />
        </section>

        <div className="analytics-grid">
          <section className="panel analytics-panel analytics-panel--wide"><div className="compact-heading"><span>Distribution</span><h2>Final recommendation scores</h2><p>A healthy scoring system should spread ads across the scale instead of returning the same value for every row.</p></div><div className="histogram">{data.distributions.histogram.map((bin) => <div className="histogram__column" key={bin.label}><span>{formatNumber(bin.count)}</span><div><i style={{ height: `${Math.max(2, bin.count / maxBin * 100)}%` }} /></div><small>{bin.label}</small></div>)}</div><div className="quartile-row"><span>Min <strong>{data.distributions.score.minimum}</strong></span><span>P10 <strong>{data.distributions.score.p10}</strong></span><span>Median <strong>{data.distributions.score.median}</strong></span><span>P90 <strong>{data.distributions.score.p90}</strong></span><span>Max <strong>{data.distributions.score.maximum}</strong></span></div></section>

          <section className="panel analytics-panel"><div className="compact-heading"><span>Classification</span><h2>Score bands</h2></div><div className="band-list">{data.distributions.bands.map((band) => <div className={`band-row band-row--${band.key}`} key={band.key}><div><strong>{band.label}</strong><span>{band.minimum}–{band.maximum}</span></div><div className="band-track"><i style={{ width: `${band.percentage}%` }} /></div><b>{formatNumber(band.count)} <small>{formatPercent(band.percentage)}</small></b></div>)}</div></section>

          <section className="panel analytics-panel"><div className="compact-heading"><span>Location input</span><h2>Coordinate quality</h2></div><div className="analytics-donut" style={coordinateStyle}><div><strong>{formatPercent(data.coordinates.exactPercentage)}</strong><span>exact</span></div></div><div className="coordinate-legend"><span><i className="exact" />Exact <strong>{formatNumber(data.coordinates.exact)}</strong></span><span><i className="approx" />Approximate <strong>{formatNumber(data.coordinates.approximate)}</strong></span></div></section>

          <section className="panel analytics-panel analytics-panel--wide"><div className="compact-heading"><span>Cleaning</span><h2>What entered the scoring machine</h2><p>Rejected records never receive a score. Optional gaps are imputed explicitly and lower data-quality confidence.</p></div><div className="cleaning-flow"><div><span>Raw input</span><strong>{formatNumber(cleaning.inputCount)}</strong></div><i>→</i><div><span>Accepted</span><strong>{formatNumber(cleaning.acceptedCount)}</strong></div><i>→</i><div><span>Scored</span><strong>{formatNumber(data.total)}</strong></div><div className="rejected"><span>Rejected</span><strong>{formatNumber(cleaning.rejectedCount)}</strong></div></div><div className="dictionary-grid"><Dictionary title="Rejection reasons" values={cleaning.rejectionCounts} /><Dictionary title={`Imputations · ${formatNumber(cleaning.recordsWithImputation)} records`} values={cleaning.imputationCounts} /></div></section>

          <section className="panel analytics-panel analytics-panel--full"><div className="compact-heading"><span>Spatial view</span><h2>Neighborhood sample behavior</h2><p>Only neighborhoods with at least five accepted ads are shown. These averages describe the collected sample, not all Tehran transactions.</p></div><div className="table-wrap"><table className="neighborhood-table"><thead><tr><th>Neighborhood</th><th>Ads</th><th>Average score</th><th>Strong value</th><th>Avg confidence</th><th>Avg asking / m²</th><th>Avg model discount</th></tr></thead><tbody>{data.neighborhoods.map((area) => <tr key={area.name}><td><strong dir="auto">{area.name}</strong></td><td>{formatNumber(area.count)}</td><td><span className="table-score">{area.averageScore}</span></td><td>{formatNumber(area.strongValueCount)}</td><td>{formatPercent(area.averageConfidence)}</td><td>{formatMoney(area.averageAskingPricePerMeter)}</td><td className={area.averageModelDiscountPct >= 0 ? "cell-good" : "cell-warn"}>{formatPercent(area.averageModelDiscountPct, true)}</td></tr>)}</tbody></table></div></section>
        </div>

        <section className="methodology-callout"><Icon name="alert" size={22} /><div><strong>How to read this page</strong><p>{data.methodology.limitations.join(" ")}</p><code>{data.methodology.recommendationFormula}</code></div></section>
        <details className="raw-panel"><summary><span><Icon name="database" size={18} /> Scoring analytics JSON</span><span>Inspect the exact API response</span></summary><pre>{JSON.stringify(data, null, 2)}</pre></details>
      </main>
      <AppFooter />
    </div>
  );
}
