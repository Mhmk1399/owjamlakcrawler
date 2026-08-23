import { useEffect, useState } from "react";
import { AppFooter, AppHeader, ErrorPage, formatMoney, formatNumber, formatPercent, Icon, LoadingPage, ScoreBar } from "./shared.jsx";

const FACTORS = [
  ["modelValue", "Model value", "45% of deal value", "How favorable this ad's model discount ranks against all scored ads."],
  ["nearbyValue", "Nearby value", "40% of deal value", "How favorable the asking price is against robust nearby comparable ads."],
  ["localPosition", "Local position", "15% of deal value", "A lower local price-per-metre percentile produces a higher score."],
  ["confidence", "Confidence", "Recommendation gate", "Model validation, comparable coverage, coordinate accuracy and data completeness."],
  ["dataQuality", "Data quality", "Confidence input", "Reduced when optional source fields had to be explicitly imputed."],
  ["propertyQuality", "Property quality", "Separate signal", "Age, amenities, floor position and units per floor; it does not inflate the deal score."],
  ["risk", "Risk", "Recommendation gate", "Higher means an extreme price, weak or dispersed evidence, model disagreement, or incomplete data.", true],
];

function tone(value) {
  return value >= 80 ? "green" : value >= 55 ? "orange" : "red";
}

function BooleanValue({ value }) {
  const known = value === 1 || value === 0 || typeof value === "boolean";
  const enabled = value === 1 || value === true;
  return <span className={enabled ? "yes-value" : "no-value"}>{known ? (enabled ? "Yes" : "No") : "Unknown"}</span>;
}

function PropertyFacts({ item }) {
  const facts = [
    ["Area", `${formatNumber(item.property.area)} m²`],
    ["Rooms", formatNumber(item.property.rooms)],
    ["Built", formatNumber(item.property.constructionYear)],
    ["Floor", `${formatNumber(item.property.floor)} / ${formatNumber(item.property.totalFloors)}`],
    ["Units / floor", formatNumber(item.property.unitsPerFloor)],
    ["Building age", `${formatNumber(item.property.buildingAge)} years`],
  ];
  return (
    <section className="panel detail-panel">
      <div className="compact-heading"><span>Property</span><h2>Source attributes</h2></div>
      <div className="fact-grid">{facts.map(([label, value]) => <div key={label}><span>{label}</span><strong>{value}</strong></div>)}</div>
      <div className="amenity-row">
        {Object.entries(item.amenities || {}).map(([key, value]) => <div key={key}><BooleanValue value={value} /><span>{key}</span></div>)}
      </div>
      <div className="coordinate-line"><Icon name="location" size={18} /><span>{item.location.latitude.toFixed(5)}, {item.location.longitude.toFixed(5)}</span><strong>{item.location.accuracy}</strong></div>
    </section>
  );
}

function ScoreFactors({ item }) {
  return (
    <section className="panel detail-panel detail-panel--wide">
      <div className="compact-heading"><span>Score anatomy</span><h2>Every input to the recommendation</h2><p>Deal value is built first. Confidence and risk can only reduce it; property quality remains a separate, inspectable signal.</p></div>
      <div className="factor-grid">
        <article className="factor-card factor-card--primary"><span>Deal value</span><strong>{item.scores.dealValue}</strong><ScoreBar value={item.scores.dealValue} tone={tone(item.scores.dealValue)} /><p>Weighted result before the confidence gate.</p></article>
        {FACTORS.map(([key, label, weight, description, inverse]) => <article className="factor-card" key={key}><div><span>{label}</span><small>{weight}</small></div><strong>{item.scores[key]}</strong><ScoreBar value={item.scores[key]} tone={tone(inverse ? 100 - item.scores[key] : item.scores[key])} /><p>{description}</p></article>)}
      </div>
      <div className="formula-box">
        <div><span>Deal value</span><code>{item.scores.modelValue} × 45% + {item.scores.nearbyValue} × 40% + {item.scores.localPosition} × 15% = {item.scores.dealValue}</code></div>
        <div><span>Confidence gate</span><code>55% + {item.scores.confidence} × 45% = {formatPercent(item.formula.appliedConfidenceGate * 100)}</code></div>
        <div><span>Risk gate</span><code>100% − {item.scores.risk} × 40% = {formatPercent(item.formula.appliedRiskGate * 100)}</code></div>
        <div><span>Final</span><code>{item.scores.dealValue} × {item.formula.appliedConfidenceGate.toFixed(3)} × {item.formula.appliedRiskGate.toFixed(3)} = {item.formula.rawRecommendation.toFixed(2)} → {item.scores.recommendation}</code></div>
      </div>
    </section>
  );
}

function Comparables({ item }) {
  const rows = item.evidence.comparables || [];
  return (
    <section className="panel detail-panel detail-panel--wide">
      <div className="compact-heading"><span>Nearby evidence</span><h2>{formatNumber(item.evidence.comparableCount)} attribute-adjusted comparables within {formatNumber(item.evidence.comparableRadiusMeters)} m</h2><p>The twelve strongest matches are shown. Similarity includes location, area, age, rooms, relative floor, unit density and amenities. Each comparable price is normalized to this property's attributes before aggregation.</p></div>
      <div className="table-wrap comparable-table-wrap"><table className="comparable-table"><thead><tr><th>Comparable ad</th><th>Match</th><th>Distance</th><th>Property</th><th>Asking</th><th>Raw / m²</th><th>Adjusted / m²</th><th>This ad vs adjusted</th></tr></thead><tbody>
        {rows.map((row) => <tr key={row.token}><td><a href={row.url} target="_blank" rel="noreferrer"><strong dir="auto">{row.title}</strong><small dir="auto">{row.neighborhood} · {row.coordinateAccuracy}</small></a></td><td>{formatPercent(row.similarity)}</td><td>{formatNumber(row.distanceMeters)} m</td><td><strong>{formatNumber(row.area)} m² · {formatNumber(row.rooms)} rooms</strong><small>floor {formatNumber(row.floor)}/{formatNumber(row.totalFloors)} · {row.elevator === 1 ? "lift" : row.elevator === 0 ? "no lift" : "lift unknown"} · {row.parking === 1 ? "parking" : row.parking === 0 ? "no parking" : "parking unknown"}</small></td><td>{formatMoney(row.askingPrice)}</td><td>{formatMoney(row.askingPricePerMeter)}</td><td>{formatMoney(row.adjustedPricePerMeter)}</td><td className={row.subjectAdjustedPriceDifferencePct <= 0 ? "cell-good" : "cell-warn"}>{formatPercent(row.subjectAdjustedPriceDifferencePct, true)}</td></tr>)}
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
          <section className="panel detail-panel"><div className="compact-heading"><span>Evidence quality</span><h2>Why confidence is {item.scores.confidence}</h2></div><dl className="evidence-list"><div><dt>Cross-fitted blended median error</dt><dd>{formatPercent(data.valuationValidation.medianAbsolutePercentageError)}</dd></div><div><dt>Blended validation R² (log)</dt><dd>{data.valuationValidation.rSquaredLog}</dd></div><div><dt>Base model median error</dt><dd>{formatPercent(item.evidence.modelValidationMedianErrorPct)}</dd></div><div><dt>Nearby records</dt><dd>{formatNumber(item.evidence.comparableCount)}</dd></div><div><dt>Average comparable match</dt><dd>{formatPercent(item.evidence.averageComparableSimilarity)}</dd></div><div><dt>Adjusted-price dispersion</dt><dd>{formatPercent(item.evidence.adjustedComparableDispersionPct)}</dd></div><div><dt>Comparable evidence strength</dt><dd>{formatPercent(item.evidence.comparableEvidenceStrength)}</dd></div><div><dt>Removed outliers</dt><dd>{formatNumber(item.evidence.removedComparableOutliers)}</dd></div><div><dt>Nearby/model blend</dt><dd>{formatPercent(item.valuation.nearbyBlendWeightPct)} / {formatPercent(100 - item.valuation.nearbyBlendWeightPct)}</dd></div></dl></section>
          <section className="panel detail-panel"><div className="compact-heading"><span>Interpretation</span><h2>What the machine observed</h2></div><ul className="explanation-list">{item.explanations.map((text) => <li key={text}><Icon name="check" size={17} />{text}</li>)}</ul>{item.warnings.length > 0 && <div className="warning-box"><Icon name="alert" size={18} /><div><strong>Warnings</strong><span>{item.warnings.join(" · ")}</span></div></div>}<div className="cleaning-note"><strong>{item.cleaning.imputationCount}</strong><span>imputed fields</span><small>{item.evidence.imputedFields.join(", ") || "No fields were imputed for this ad."}</small></div></section>
          <Comparables item={item} />
        </div>
        <details className="raw-panel"><summary><span><Icon name="database" size={18} /> Scoring detail JSON</span><span>Inspect the exact API response</span></summary><pre>{JSON.stringify(data, null, 2)}</pre></details>
      </main>
      <AppFooter />
    </div>
  );
}
