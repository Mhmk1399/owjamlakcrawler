import { useEffect, useState } from "react";
import { AppFooter, AppHeader, ErrorPage, formatMoney, formatNumber, formatPercent, Icon, LoadingPage, ScoreBar } from "./shared.jsx";

const FACTORS = [
  ["modelValue", "Model value", "45% of deal value", "How favorable this ad's model discount ranks against all scored ads."],
  ["nearbyValue", "Nearby value", "40% of deal value", "How favorable the asking price is against robust nearby comparable ads."],
  ["localPosition", "Local position", "15% of deal value", "A lower local price-per-metre percentile produces a higher score."],
  ["confidence", "Confidence", "Recommendation gate", "Model validation, comparable coverage, coordinate accuracy and data completeness."],
  ["dataQuality", "Data quality", "Confidence input", "Reduced when optional source fields had to be explicitly imputed."],
];

function tone(value) {
  return value >= 80 ? "green" : value >= 55 ? "orange" : "red";
}

function BooleanValue({ value }) {
  return <span className={value ? "yes-value" : "no-value"}>{value ? "Yes" : "No"}</span>;
}

function PropertyFacts({ item }) {
  const facts = [
    ["Area", `${formatNumber(item.property.area)} m²`],
    ["Rooms", formatNumber(item.property.rooms)],
    ["Built", formatNumber(item.property.constructionYear)],
    ["Floor", `${formatNumber(item.property.floor)} / ${formatNumber(item.property.totalFloors)}`],
  ];
  return (
    <section className="panel detail-panel">
      <div className="compact-heading"><span>Property</span><h2>Source attributes</h2></div>
      <div className="fact-grid">{facts.map(([label, value]) => <div key={label}><span>{label}</span><strong>{value}</strong></div>)}</div>
      <div className="amenity-row">
        {Object.entries(item.amenities || {}).map(([key, value]) => <div key={key}><BooleanValue value={Boolean(value)} /><span>{key}</span></div>)}
      </div>
      <div className="coordinate-line"><Icon name="location" size={18} /><span>{item.location.latitude.toFixed(5)}, {item.location.longitude.toFixed(5)}</span><strong>{item.location.accuracy}</strong></div>
    </section>
  );
}

function ScoreFactors({ item }) {
  return (
    <section className="panel detail-panel detail-panel--wide">
      <div className="compact-heading"><span>Score anatomy</span><h2>Every input to the recommendation</h2><p>Deal value is built first; confidence can reduce it, but never increase it.</p></div>
      <div className="factor-grid">
        <article className="factor-card factor-card--primary"><span>Deal value</span><strong>{item.scores.dealValue}</strong><ScoreBar value={item.scores.dealValue} tone={tone(item.scores.dealValue)} /><p>Weighted result before the confidence gate.</p></article>
        {FACTORS.map(([key, label, weight, description]) => <article className="factor-card" key={key}><div><span>{label}</span><small>{weight}</small></div><strong>{item.scores[key]}</strong><ScoreBar value={item.scores[key]} tone={tone(item.scores[key])} /><p>{description}</p></article>)}
      </div>
      <div className="formula-box">
        <div><span>Deal value</span><code>{item.scores.modelValue} × 45% + {item.scores.nearbyValue} × 40% + {item.scores.localPosition} × 15% = {item.scores.dealValue}</code></div>
        <div><span>Confidence gate</span><code>55% + {item.scores.confidence} × 45% = {formatPercent(item.formula.appliedConfidenceGate * 100)}</code></div>
        <div><span>Final</span><code>{item.scores.dealValue} × {item.formula.appliedConfidenceGate.toFixed(3)} = {item.formula.rawRecommendation.toFixed(2)} → {item.scores.recommendation}</code></div>
      </div>
    </section>
  );
}

function Comparables({ item }) {
  const rows = item.evidence.comparables || [];
  return (
    <section className="panel detail-panel detail-panel--wide">
      <div className="compact-heading"><span>Nearby evidence</span><h2>{formatNumber(item.evidence.comparableCount)} robust comparables within {formatNumber(item.evidence.comparableRadiusMeters)} m</h2><p>The nearest twelve used records are shown. Area differs by at most 30%, rooms by at most one, and statistical price outliers are removed when enough evidence remains.</p></div>
      <div className="table-wrap comparable-table-wrap"><table className="comparable-table"><thead><tr><th>Comparable ad</th><th>Distance</th><th>Area</th><th>Rooms</th><th>Asking</th><th>Price / m²</th><th>This ad vs it</th></tr></thead><tbody>
        {rows.map((row) => <tr key={row.token}><td><a href={row.url} target="_blank" rel="noreferrer"><strong dir="auto">{row.title}</strong><small dir="auto">{row.neighborhood} · {row.coordinateAccuracy}</small></a></td><td>{formatNumber(row.distanceMeters)} m</td><td>{formatNumber(row.area)} m²</td><td>{formatNumber(row.rooms)}</td><td>{formatMoney(row.askingPrice)}</td><td>{formatMoney(row.askingPricePerMeter)}</td><td className={row.subjectPriceDifferencePct <= 0 ? "cell-good" : "cell-warn"}>{formatPercent(row.subjectPriceDifferencePct, true)}</td></tr>)}
      </tbody></table></div>
      {!rows.length && <p className="empty-note">No nearby comparable passed the selection rules for this listing.</p>}
    </section>
  );
}

export default function ScoreDetailPage({ token }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    fetch(`/score-details/${encodeURIComponent(token)}`, { signal: controller.signal })
      .then(async (response) => { if (!response.ok) throw new Error(response.status === 404 ? "This token is not in the scored dataset." : `Server returned HTTP ${response.status}`); return response.json(); })
      .then(setData).catch((caught) => { if (caught.name !== "AbortError") setError(caught.message); });
    return () => controller.abort();
  }, [token]);
  if (!data && !error) return <LoadingPage />;
  if (error) return <ErrorPage message={error} />;
  const item = data.listing;
  const scoreTone = tone(item.scores.recommendation);
  return (
    <div className="app-shell">
      <AppHeader />
      <main className="detail-main">
        <a className="breadcrumb" href="/#scored-listings"><Icon name="back" size={16} /> Back to scored ads</a>
        <section className="detail-hero">
          <div className="detail-hero__copy"><div className="detail-overline"><span className={`band-badge band-badge--${item.scores.band}`}>{item.scores.band.replaceAll("-", " ")}</span><span>Rank #{formatNumber(item.rank)} of {formatNumber(data.population.total)} · top {formatPercent(data.population.topPercent)}</span></div><h1 dir="auto">{item.title}</h1><p dir="auto">{item.neighborhood} · {formatNumber(item.property.area)} m² · {formatNumber(item.property.rooms)} rooms</p><div className="detail-actions"><a className="button button--primary" href={item.url} target="_blank" rel="noreferrer">Open original Divar ad <Icon name="external" size={17} /></a><span>{item.token}</span></div></div>
          <div className={`score-orbit score-orbit--${scoreTone}`}><div><strong>{item.scores.recommendation}</strong><span>final score</span></div><small>{item.scores.confidence}% confidence</small></div>
        </section>

        <section className="valuation-strip">
          <article><span>Asking price</span><strong>{formatMoney(item.asking.askingPrice)}</strong><small>{formatMoney(item.asking.askingPricePerMeter)} / m²</small></article>
          <article><span>Blended prediction</span><strong>{formatMoney(item.valuation.predictedPrice)}</strong><small>{formatMoney(item.valuation.predictedPricePerMeter)} / m²</small></article>
          <article><span>Prediction interval</span><strong>{formatMoney(item.valuation.predictionRangeLow)}</strong><small>to {formatMoney(item.valuation.predictionRangeHigh)}</small></article>
          <article><span>Below benchmark</span><strong className={item.valuation.blendedDiscountPct >= 0 ? "positive" : "negative"}>{formatPercent(item.valuation.blendedDiscountPct, true)}</strong><small>{formatMoney(item.valuation.askingVsPrediction)} predicted headroom</small></article>
        </section>

        <div className="detail-grid">
          <ScoreFactors item={item} />
          <PropertyFacts item={item} />
          <section className="panel detail-panel"><div className="compact-heading"><span>Evidence quality</span><h2>Why confidence is {item.scores.confidence}</h2></div><dl className="evidence-list"><div><dt>Out-of-fold prediction</dt><dd>{item.evidence.predictionIsOutOfFold ? "Yes" : "No"}</dd></div><div><dt>Validation median error</dt><dd>{formatPercent(item.evidence.modelValidationMedianErrorPct)}</dd></div><div><dt>Validation R² (log)</dt><dd>{item.evidence.modelValidationRSquaredLog}</dd></div><div><dt>Nearby records</dt><dd>{formatNumber(item.evidence.comparableCount)}</dd></div><div><dt>Removed outliers</dt><dd>{formatNumber(item.evidence.removedComparableOutliers)}</dd></div><div><dt>Nearby/model blend</dt><dd>{formatPercent(item.valuation.nearbyBlendWeightPct)} / {formatPercent(100 - item.valuation.nearbyBlendWeightPct)}</dd></div></dl></section>
          <section className="panel detail-panel"><div className="compact-heading"><span>Interpretation</span><h2>What the machine observed</h2></div><ul className="explanation-list">{item.explanations.map((text) => <li key={text}><Icon name="check" size={17} />{text}</li>)}</ul>{item.warnings.length > 0 && <div className="warning-box"><Icon name="alert" size={18} /><div><strong>Warnings</strong><span>{item.warnings.join(" · ")}</span></div></div>}<div className="cleaning-note"><strong>{item.cleaning.imputationCount}</strong><span>imputed fields</span><small>{item.evidence.imputedFields.join(", ") || "No fields were imputed for this ad."}</small></div></section>
          <Comparables item={item} />
        </div>
        <details className="raw-panel"><summary><span><Icon name="database" size={18} /> Scoring detail JSON</span><span>Inspect the exact API response</span></summary><pre>{JSON.stringify(data, null, 2)}</pre></details>
      </main>
      <AppFooter />
    </div>
  );
}
