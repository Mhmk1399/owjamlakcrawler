export const numberFormat = new Intl.NumberFormat("en-US");
export const decimalFormat = new Intl.NumberFormat("en-US", { maximumFractionDigits: 1 });
const dateTime = new Intl.DateTimeFormat("en-GB", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "Asia/Tehran",
});

export function formatNumber(value) {
  return Number.isFinite(value) ? numberFormat.format(value) : "—";
}

export function formatPercent(value, signed = false) {
  if (!Number.isFinite(value)) return "—";
  return `${signed && value > 0 ? "+" : ""}${decimalFormat.format(value)}%`;
}

export function formatMoney(value) {
  if (!Number.isFinite(value)) return "—";
  if (Math.abs(value) >= 1_000_000_000) return `${decimalFormat.format(value / 1_000_000_000)}B toman`;
  if (Math.abs(value) >= 1_000_000) return `${decimalFormat.format(value / 1_000_000)}M toman`;
  return `${formatNumber(value)} toman`;
}

export function formatTime(value) {
  const parsed = new Date(value);
  return value && !Number.isNaN(parsed.valueOf()) ? dateTime.format(parsed) : "—";
}

export function clamp(value) {
  return Math.max(0, Math.min(100, Number(value) || 0));
}

export function Icon({ name, size = 20 }) {
  const paths = {
    activity: <path d="M3 12h4l2.3-7 4.4 14 2.3-7h5" />,
    alert: <><path d="M12 3 2.7 19h18.6L12 3Z" /><path d="M12 9v4" /><path d="M12 16.5h.01" /></>,
    arrow: <><path d="M5 12h14" /><path d="m13 6 6 6-6 6" /></>,
    back: <><path d="M19 12H5" /><path d="m11 18-6-6 6-6" /></>,
    check: <path d="m5 12 4 4L19 6" />,
    database: <><ellipse cx="12" cy="5" rx="8" ry="3" /><path d="M4 5v7c0 1.7 3.6 3 8 3s8-1.3 8-3V5" /><path d="M4 12v7c0 1.7 3.6 3 8 3s8-1.3 8-3v-7" /></>,
    external: <><path d="M14 5h5v5" /><path d="m10 14 9-9" /><path d="M19 14v5H5V5h5" /></>,
    location: <><path d="M20 10c0 5-8 11-8 11S4 15 4 10a8 8 0 1 1 16 0Z" /><circle cx="12" cy="10" r="2.5" /></>,
    trend: <><path d="m3 17 6-6 4 4 8-9" /><path d="M15 6h6v6" /></>,
  };
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true"><g stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">{paths[name] || paths.activity}</g></svg>;
}

export function AppHeader({ active }) {
  return (
    <header className="topbar">
      <a href="/" className="brand"><span className="brand__mark">O</span><span><strong>OWJ</strong><small>Market Observatory</small></span></a>
      <nav className="topnav" aria-label="Primary navigation">
        <a className={active === "overview" ? "active" : ""} href="/">Overview</a>
        <a className={active === "analytics" ? "active" : ""} href="/score-analytics">Score analytics</a>
      </nav>
    </header>
  );
}

export function AppFooter() {
  return <footer><span>OWJ Market Analytics · public data only</span><span>Scores are experimental decision aids, not investment advice.</span></footer>;
}

export function LoadingPage({ message = "Reading scoring evidence" }) {
  return <main className="state-page"><div className="loader-mark"><span /><span /><span /></div><h1>{message}</h1><p>Loading the generated scoring JSON from the server.</p></main>;
}

export function ErrorPage({ message }) {
  return <main className="state-page"><span className="state-page__error"><Icon name="alert" size={28} /></span><h1>This page could not be loaded</h1><p>{message}</p><a className="button button--primary" href="/"><Icon name="back" size={18} /> Return to overview</a></main>;
}

export function ScoreBar({ value, tone = "cyan" }) {
  return <span className="detail-progress"><i className={`detail-progress--${tone}`} style={{ width: `${clamp(value)}%` }} /></span>;
}
