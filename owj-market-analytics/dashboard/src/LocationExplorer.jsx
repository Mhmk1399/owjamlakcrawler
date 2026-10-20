import { useEffect, useMemo, useState } from "react";
import { AppHeader, Icon, T, formatMoney, formatNumber, injectGlobalCSS } from "./shared.jsx";

const typeLabels = { "0": "کشور", "1": "استان", "2": "شهر", "4": "محله / منطقه" };

function Stat({ label, value, accent = T.text }) {
  return <article className="location-stat">
    <span>{label}</span><strong style={{ color: accent }}>{value}</strong>
  </article>;
}

function ScoreDistribution({ data, total }) {
  const bands = [
    ["strong", "قوی", T.green], ["promising", "امیدبخش", T.secondary],
    ["fair", "متوسط", T.orange], ["weak", "ضعیف", T.red], ["unscored", "بدون امتیاز", T.textMuted],
  ];
  return <section className="score-distribution" aria-label="توزیع امتیاز آگهی‌ها">
    <div className="score-distribution__bar">
      {bands.map(([key, label, color]) => data?.[key] ? <span key={key} title={`${label}: ${data[key]}`}
        style={{ width: `${data[key] / Math.max(total, 1) * 100}%`, background: color }} /> : null)}
    </div>
    <div className="score-distribution__legend">
      {bands.map(([key, label, color]) => <span key={key}><i style={{ background: color }} />{label}: {formatNumber(data?.[key] || 0)}</span>)}
    </div>
  </section>;
}

export default function LocationExplorer({ slug = "iran" }) {
  injectGlobalCSS();
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [query, setQuery] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    setData(null); setError(null);
    fetch(`/locations/${encodeURIComponent(slug)}`, { signal: controller.signal, headers: { accept: "application/json" } })
      .then((response) => response.ok ? response.json() : Promise.reject(new Error(`HTTP ${response.status}`)))
      .then(setData).catch((caught) => { if (caught.name !== "AbortError") setError(caught.message); });
    return () => controller.abort();
  }, [slug]);
  const children = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase("fa");
    return (data?.children || []).filter((item) => !normalized || `${item.name} ${item.slug}`.toLocaleLowerCase("fa").includes(normalized));
  }, [data, query]);

  return <div className="location-page" dir="rtl">
    <AppHeader active="locations" />
    <main className="location-main">
      {!data && !error && <div className="location-state">در حال بارگذاری سلسله‌مراتب رسمی مناطق…</div>}
      {error && <div className="location-state location-state--error">بارگذاری ناموفق بود: {error}</div>}
      {data && <>
        <nav className="breadcrumbs" aria-label="مسیر مکان">
          {data.breadcrumb.map((item, index) => <span key={item.id}>
            {index > 0 && <b aria-hidden="true">‹</b>}
            <a href={`/explore/${item.slug}`} aria-current={item.id === data.node.id ? "page" : undefined}>{item.name}</a>
          </span>)}
        </nav>
        <header className="location-hero">
          <div>
            <span className="location-kicker"><Icon name="location" size={17} /> {typeLabels[data.node.type]}</span>
            <h1>{data.node.name}</h1>
            <p>کاوش آگهی‌ها بر پایه سلسله‌مراتب رسمی دیوار، از استان و شهر تا محله.</p>
          </div>
          {data.node.slug !== "tehran" && <a className="tehran-shortcut" href="/explore/tehran">رفتن مستقیم به تهران</a>}
        </header>
        <section className="location-stats" aria-label="خلاصه بازار">
          <Stat label="تعداد آگهی" value={formatNumber(data.summary.listingCount)} accent={T.secondary} />
          <Stat label="میانه قیمت" value={formatMoney(data.summary.medianPrice)} />
          <Stat label="میانه هر متر" value={formatMoney(data.summary.medianPricePerMeter)} />
          <Stat label="میانگین امتیاز" value={data.summary.averageScore === null ? "—" : formatNumber(data.summary.averageScore)} accent={T.primaryPale} />
        </section>
        <ScoreDistribution data={data.summary.scoreDistribution} total={data.summary.listingCount} />

        {!!data.children.length && <section className="location-section">
          <div className="location-section__head">
            <div><span>سطح بعدی</span><h2>{data.node.type === "1" ? "شهرها" : data.node.type === "2" ? "محله‌ها و مناطق" : "استان‌ها"}</h2></div>
            <label className="location-search"><span className="sr-only">جستجوی مکان</span><Icon name="location" size={16} />
              <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="جستجوی نام یا شناسه…" /></label>
          </div>
          <div className="place-grid">
            {children.map((item) => <a className="place-card" href={`/explore/${item.slug}`} key={item.id}>
              <div><span>{typeLabels[item.type]}</span><h3>{item.name}</h3><small>{item.slug}</small></div>
              <div className="place-card__metrics"><strong>{formatNumber(item.summary.listingCount)}</strong><span>آگهی</span><small>{formatMoney(item.summary.medianPricePerMeter)} / متر</small></div>
            </a>)}
          </div>
          {!children.length && <div className="location-empty">مکانی مطابق جستجو پیدا نشد.</div>}
        </section>}

        <section className="location-section">
          <div className="location-section__head"><div><span>آگهی‌های منطبق</span><h2>فهرست آگهی‌ها</h2></div><small>حداکثر ۲۰۰ مورد تازه در این نما</small></div>
          <div className="location-listings">
            {data.listings.map((item) => <a className="location-listing" href={`/listing/${item.token}`} key={item.token}>
              <div><h3>{item.title}</h3><p>{item.resolvedLocation?.name || item.neighborhood || "مکان نامشخص"} · {formatNumber(item.area)} متر</p></div>
              <div><strong>{formatMoney(item.price)}</strong><span>{formatMoney(item.pricePerMeter)} / متر</span></div>
              <b className="location-score">{item.score === null ? "—" : formatNumber(item.score)}</b>
            </a>)}
            {!data.listings.length && <div className="location-empty">هنوز آگهی منطبق برای این مکان ذخیره نشده است.</div>}
          </div>
        </section>
      </>}
    </main>
  </div>;
}
