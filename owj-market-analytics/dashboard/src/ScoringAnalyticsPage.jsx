import { useEffect, useState } from "react";
import {
  AppFooter,
  AppHeader,
  ErrorPage,
  formatMoney,
  formatNumber,
  formatPercent,
  formatTime,
  Icon,
  LoadingPage,
} from "./shared.jsx";

/* ──────────────────────── Design Tokens (matching dashboard) ──────────────────────── */
const T = {
  primary: "#66308d",
  primaryLight: "#7f4aaa",
  primaryPale: "#a06cc8",
  primaryGlow: "rgba(102,48,141,0.35)",
  primaryBg: "rgba(102,48,141,0.10)",
  primaryBg2: "rgba(102,48,141,0.18)",

  secondary: "#01ae9b",
  secondaryLight: "#19c5b2",
  secondaryDark: "#019384",
  secondaryGlow: "rgba(1,174,155,0.30)",
  secondaryBg: "rgba(1,174,155,0.10)",
  secondaryBg2: "rgba(1,174,155,0.18)",

  bg: "#0c0b10",
  bgGradient: "linear-gradient(168deg, #0c0b10 0%, #110f18 40%, #0d1117 100%)",
  surface: "#16141f",
  surfaceLight: "#1e1b2a",
  surfaceHover: "#241f34",
  raised: "#262237",

  border: "rgba(255,255,255,0.06)",
  borderMed: "rgba(255,255,255,0.09)",
  borderLight: "rgba(255,255,255,0.13)",

  text: "#ede9f5",
  textSec: "#a39bb5",
  textMuted: "#6e6580",
  white: "#ffffff",

  green: "#34d399",
  greenBg: "rgba(52,211,153,0.10)",
  greenBg2: "rgba(52,211,153,0.18)",
  orange: "#fb923c",
  orangeBg: "rgba(251,146,60,0.10)",
  orangeBg2: "rgba(251,146,60,0.18)",
  red: "#f87171",
  redBg: "rgba(248,113,113,0.10)",
  redBg2: "rgba(248,113,113,0.18)",

  radius: 14,
  radiusSm: 10,
  radiusXs: 7,

  shadow: "0 4px 24px rgba(0,0,0,0.25), 0 1px 4px rgba(0,0,0,0.15)",
  shadowLg: "0 8px 40px rgba(0,0,0,0.35)",
};

/* ──────────────────────── Global CSS ──────────────────────── */
const GLOBAL_CSS = `
@import url('https://fonts.googleapis.com/css2?family=Vazirmatn:wght@300;400;500;600;700;800;900&display=swap');
*, *::before, *::after { box-sizing: border-box; }
body { background: ${T.bg}; margin: 0; }
::-webkit-scrollbar { width: 5px; height: 5px; }
::-webkit-scrollbar-track { background: transparent; }
::-webkit-scrollbar-thumb { background: ${T.borderLight}; border-radius: 99px; }
::-webkit-scrollbar-thumb:hover { background: ${T.textMuted}; }
@keyframes owjSlideUp { from { opacity: 0; transform: translateY(16px); } to { opacity: 1; transform: translateY(0); } }
@keyframes owjPulse { 0%,100% { opacity: 1; transform: scale(1); } 50% { opacity: .5; transform: scale(1.12); } }
@keyframes owjBarGrow { from { height: 0 !important; } }
`;
let injected = false;
function injectCSS() {
  if (injected || typeof document === "undefined") return;
  injected = true;
  const el = document.createElement("style");
  el.textContent = GLOBAL_CSS;
  document.head.appendChild(el);
}

/* ──────────────────────── Helpers ──────────────────────── */
const BAND_LABELS = {
  "top-tier": "درجه یک",
  "strong-buy": "خرید قوی",
  solid: "مطمئن",
  watchlist: "لیست پایش",
  hold: "نگهداری",
  avoid: "اجتناب",
  review: "بازبینی",
  excellent: "عالی",
  good: "خوب",
  medium: "متوسط",
  low: "پایین",
};

const REJECTION_LABELS = {
  "missing-price": "قیمت ناموجود",
  "missing-area": "متراژ ناموجود",
  "missing-location": "موقعیت ناموجود",
  "outlier-price": "قیمت پرت",
  "outlier-area": "متراژ پرت",
  "invalid-coordinates": "مختصات نامعتبر",
  duplicate: "تکراری",
  "insufficient-data": "داده ناکافی",
};

const IMPUTATION_LABELS = {
  floor: "طبقه",
  totalFloors: "تعداد طبقات",
  rooms: "اتاق‌ها",
  constructionYear: "سال ساخت",
  buildingAge: "سن بنا",
  unitsPerFloor: "واحد در طبقه",
  elevator: "آسانسور",
  parking: "پارکینگ",
  warehouse: "انباری",
  balcony: "بالکن",
};

function translateKey(key, dict) {
  return dict[key] || key.replaceAll("-", " ");
}

/* ──────────────────────── ValidationCard ──────────────────────── */
function ValidationCard({ label, value, detail, tone = "cyan" }) {
  const accents = {
    cyan: { c: T.secondary, bg: T.secondaryBg, glow: T.secondaryGlow },
    green: { c: T.green, bg: T.greenBg, glow: "rgba(52,211,153,0.25)" },
    orange: { c: T.orange, bg: T.orangeBg, glow: "rgba(251,146,60,0.25)" },
    violet: { c: T.primary, bg: T.primaryBg, glow: T.primaryGlow },
  };
  const a = accents[tone] || accents.cyan;

  return (
    <article
      style={{
        background: T.surface,
        border: `1px solid ${T.border}`,
        borderTop: `3px solid ${a.c}`,
        borderRadius: T.radius,
        padding: "22px 22px 20px",
        display: "flex",
        flexDirection: "column",
        gap: 10,
        boxShadow: T.shadow,
        transition: "transform .2s, box-shadow .2s",
        animation: "owjSlideUp .5s ease both",
        position: "relative",
        overflow: "hidden",
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.transform = "translateY(-3px)";
        e.currentTarget.style.boxShadow = T.shadowLg;
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.transform = "translateY(0)";
        e.currentTarget.style.boxShadow = T.shadow;
      }}
    >
      {/* Decorative glow */}
      <div
        style={{
          position: "absolute",
          top: -30,
          left: -30,
          width: 80,
          height: 80,
          borderRadius: "50%",
          background: a.bg,
          filter: "blur(20px)",
          opacity: 0.6,
        }}
      />
      <span
        style={{
          fontSize: 11,
          fontWeight: 700,
          color: T.textMuted,
          letterSpacing: 0.5,
          position: "relative",
        }}
      >
        {label}
      </span>
      <strong
        style={{
          fontSize: 30,
          fontWeight: 900,
          color: T.white,
          lineHeight: 1.1,
          letterSpacing: -1,
          position: "relative",
        }}
      >
        {value}
      </strong>
      <small
        style={{
          fontSize: 12,
          color: T.textSec,
          lineHeight: 1.6,
          position: "relative",
        }}
      >
        {detail}
      </small>
    </article>
  );
}

/* ──────────────────────── Dictionary ──────────────────────── */
function Dictionary({ title, values, dict }) {
  const entries = Object.entries(values || {}).sort((a, b) => b[1] - a[1]);
  const maxVal = Math.max(...entries.map(([, v]) => v), 1);

  return (
    <div
      style={{
        background: T.raised,
        border: `1px solid ${T.border}`,
        borderRadius: T.radiusSm,
        padding: 18,
      }}
    >
      <h3
        style={{
          fontSize: 13,
          fontWeight: 800,
          color: T.white,
          margin: "0 0 14px",
          paddingBottom: 10,
          borderBottom: `1px solid ${T.border}`,
        }}
      >
        {title}
      </h3>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {entries.map(([key, value]) => (
          <div
            key={key}
            style={{ display: "flex", flexDirection: "column", gap: 4 }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                fontSize: 12,
              }}
            >
              <span style={{ color: T.textSec }}>
                {translateKey(key, dict || {})}
              </span>
              <strong style={{ color: T.white, fontWeight: 800, fontSize: 13 }}>
                {formatNumber(value)}
              </strong>
            </div>
            <div
              style={{
                height: 3,
                background: T.border,
                borderRadius: 99,
                overflow: "hidden",
              }}
            >
              <div
                style={{
                  height: "100%",
                  width: `${(value / maxVal) * 100}%`,
                  background: `linear-gradient(90deg, ${T.primary}, ${T.secondary})`,
                  borderRadius: 99,
                  transition: "width .8s cubic-bezier(.22,1,.36,1)",
                }}
              />
            </div>
          </div>
        ))}
        {!entries.length && (
          <div
            style={{
              fontSize: 12,
              color: T.textMuted,
              textAlign: "center",
              padding: 10,
            }}
          >
            موردی ثبت نشده است.
          </div>
        )}
      </div>
    </div>
  );
}

/* ──────────────────────── Panel wrapper ──────────────────────── */
function Panel({ children, wide = false, full = false, style = {} }) {
  const colSpan = full ? "1 / -1" : wide ? "span 2" : "auto";
  return (
    <section
      style={{
        background: T.surface,
        border: `1px solid ${T.border}`,
        borderRadius: T.radius,
        padding: 28,
        boxShadow: T.shadow,
        gridColumn: colSpan,
        animation: "owjSlideUp .5s ease both",
        ...style,
      }}
    >
      {children}
    </section>
  );
}

/* ──────────────────────── Compact heading ──────────────────────── */
function CompactHeading({ kicker, title, description }) {
  return (
    <div style={{ marginBottom: 22 }}>
      <span
        style={{
          fontSize: 11,
          fontWeight: 800,
          color: T.secondary,
          letterSpacing: 1.2,
          textTransform: "uppercase",
          marginBottom: 6,
          display: "block",
        }}
      >
        {kicker}
      </span>
      <h2
        style={{
          fontSize: 19,
          fontWeight: 800,
          color: T.white,
          margin: "0 0 6px",
          lineHeight: 1.4,
        }}
      >
        {title}
      </h2>
      {description && (
        <p
          style={{
            fontSize: 13,
            color: T.textSec,
            margin: 0,
            lineHeight: 1.7,
            maxWidth: 720,
          }}
        >
          {description}
        </p>
      )}
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════
   MAIN PAGE
   ══════════════════════════════════════════════════════════════════ */
export default function ScoringAnalyticsPage() {
  injectCSS();
  const [data, setData] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    fetch("/score-analytics-data", { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok)
          throw new Error(`Server returned HTTP ${response.status}`);
        return response.json();
      })
      .then(setData)
      .catch((caught) => {
        if (caught.name !== "AbortError") setError(caught.message);
      });
    return () => controller.abort();
  }, []);

  if (!data && !error)
    return <LoadingPage message="در حال ساخت نمای کلی امتیازدهی" />;
  if (error) return <ErrorPage message={error} />;

  const validation = data.valuationValidation || data.modelValidation;
  const cleaning = data.cleaning;
  const maxBin = Math.max(
    ...data.distributions.histogram.map((bin) => bin.count),
    1,
  );

  // Band color mapper
  const bandColors = {
    "top-tier": T.green,
    excellent: T.green,
    "strong-buy": T.secondary,
    good: T.secondary,
    solid: T.primary,
    medium: T.primary,
    watchlist: T.orange,
    hold: T.orange,
    avoid: T.red,
    low: T.red,
    review: T.red,
  };

  return (
    <div
      style={{
        direction: "rtl",
        fontFamily: "'Vazirmatn', Tahoma, sans-serif",
        background: T.bgGradient,
        color: T.text,
        minHeight: "100vh",
        fontSize: 14,
        lineHeight: 1.7,
      }}
    >
      <AppHeader active="analytics" />

      <main
        style={{ maxWidth: 1400, margin: "0 auto", padding: "24px 28px 80px" }}
      >
        {/* ═══ HERO ═══ */}
        <section
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 320px",
            gap: 32,
            alignItems: "center",
            padding: "40px 32px",
            background: T.surface,
            border: `1px solid ${T.border}`,
            borderRadius: 20,
            boxShadow: T.shadowLg,
            marginBottom: 32,
            position: "relative",
            overflow: "hidden",
            animation: "owjSlideUp .5s ease both",
          }}
        >
          {/* Decorative gradient line */}
          <div
            style={{
              position: "absolute",
              top: 0,
              right: 0,
              left: 0,
              height: 4,
              background: `linear-gradient(90deg, ${T.primary}, ${T.secondary})`,
            }}
          />
          {/* Background glow */}
          <div
            style={{
              position: "absolute",
              top: -100,
              left: -100,
              width: 300,
              height: 300,
              borderRadius: "50%",
              background: T.primaryBg,
              filter: "blur(60px)",
              opacity: 0.6,
              pointerEvents: "none",
            }}
          />

          <div style={{ position: "relative" }}>
            <span
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 8,
                fontSize: 13,
                fontWeight: 700,
                color: T.secondary,
                marginBottom: 14,
                padding: "5px 12px",
                background: T.secondaryBg,
                borderRadius: 20,
                border: `1px solid ${T.secondaryBg2}`,
              }}
            >
              <Icon name="trend" size={17} />
              اجرای امتیازدهی · {data.scoringVersion}
            </span>
            <h1
              style={{
                fontSize: 32,
                fontWeight: 900,
                color: T.white,
                margin: "0 0 12px",
                lineHeight: 1.4,
                letterSpacing: -0.5,
              }}
            >
              امتیازها را{" "}
              <em
                style={{
                  fontStyle: "normal",
                  background: `linear-gradient(135deg, ${T.primaryLight}, ${T.secondary})`,
                  WebkitBackgroundClip: "text",
                  WebkitTextFillColor: "transparent",
                  backgroundClip: "text",
                }}
              >
                در سطح جمعیت
              </em>{" "}
              درک کنید.
            </h1>
            <p
              style={{
                fontSize: 15,
                color: T.textSec,
                lineHeight: 1.75,
                margin: 0,
                maxWidth: 620,
              }}
            >
              کیفیت اعتبارسنجی، پراکندگی امتیاز، تلفات پاکسازی، اطمینان مختصات و
              رفتار در سطح محله برای تمام{" "}
              <strong style={{ color: T.white }}>
                {formatNumber(data.total)}
              </strong>{" "}
              آگهی امتیازدهی‌شده.
            </p>
          </div>

          {/* Run info card */}
          <div
            style={{
              background: T.raised,
              border: `1px solid ${T.borderMed}`,
              borderRadius: 16,
              padding: 22,
              display: "flex",
              flexDirection: "column",
              gap: 10,
              position: "relative",
            }}
          >
            <span style={{ fontSize: 12, color: T.textMuted, fontWeight: 600 }}>
              تولیدشده در
            </span>
            <strong
              style={{
                fontSize: 17,
                fontWeight: 800,
                color: T.white,
                lineHeight: 1.4,
              }}
            >
              {formatTime(data.generatedAt)}
            </strong>
            <small
              style={{
                display: "inline-block",
                fontSize: 11,
                color: T.primaryLight,
                background: T.primaryBg,
                padding: "5px 12px",
                borderRadius: 6,
                marginTop: 6,
                fontWeight: 600,
                width: "fit-content",
              }}
            >
              {validation.method?.replaceAll("-", " ")}
            </small>
          </div>
        </section>

        {/* ═══ KPI GRID ═══ */}
        <section
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
            gap: 18,
            marginBottom: 32,
          }}
        >
          <ValidationCard
            label="آگهی‌های امتیازدهی‌شده"
            value={formatNumber(data.total)}
            detail={`${formatNumber(cleaning.rejectedCount)} مورد قبل از امتیازدهی رد شد`}
          />
          <ValidationCard
            label="خطای میانه ترکیبی"
            value={formatPercent(validation.medianAbsolutePercentageError)}
            detail={`مدل پایه: ${formatPercent(data.modelValidation.medianAbsolutePercentageError)}`}
            tone="orange"
          />
          <ValidationCard
            label="در محدوده ±۲۰٪"
            value={formatPercent(validation.within20Percent)}
            detail={`${formatPercent(validation.within30Percent)} در محدوده ±۳۰٪ قرار دارند`}
            tone="green"
          />
          <ValidationCard
            label="R² مقیاس لگاریتمی"
            value={validation.rSquaredLog}
            detail={`${formatNumber(data.distributions.highRiskCount)} آگهی با ریسک بالا علامت‌گذاری شد`}
            tone="violet"
          />
        </section>

        {/* ═══ ANALYTICS GRID ═══ */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(3, 1fr)",
            gap: 20,
            marginBottom: 24,
          }}
        >
          {/* ─── Distribution Histogram (wide) ─── */}
          <Panel wide>
            <CompactHeading
              kicker="توزیع"
              title="امتیازهای پیشنهاد نهایی"
              description="یک سیستم امتیازدهی سالم باید آگهی‌ها را در تمام مقیاس پخش کند، نه اینکه برای همه ردیف‌ها یک مقدار برگرداند."
            />
            {/* Histogram */}
            <div
              style={{
                display: "flex",
                alignItems: "flex-end",
                gap: 6,
                height: 220,
                padding: "16px 8px 8px",
                background: T.raised,
                borderRadius: T.radiusSm,
                border: `1px solid ${T.border}`,
              }}
            >
              {data.distributions.histogram.map((bin) => {
                const heightPct = Math.max(2, (bin.count / maxBin) * 100);
                return (
                  <div
                    key={bin.label}
                    style={{
                      flex: 1,
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "center",
                      justifyContent: "flex-end",
                      gap: 6,
                      height: "100%",
                      minWidth: 0,
                    }}
                  >
                    <span
                      style={{
                        fontSize: 11,
                        fontWeight: 700,
                        color: T.white,
                        whiteSpace: "nowrap",
                      }}
                    >
                      {formatNumber(bin.count)}
                    </span>
                    <div
                      style={{
                        width: "100%",
                        flex: 1,
                        display: "flex",
                        alignItems: "flex-end",
                        justifyContent: "center",
                      }}
                    >
                      <i
                        style={{
                          display: "block",
                          width: "100%",
                          height: `${heightPct}%`,
                          background: `linear-gradient(180deg, ${T.secondary}, ${T.primary})`,
                          borderRadius: "6px 6px 3px 3px",
                          transition: "opacity .2s",
                          boxShadow: `0 -4px 12px ${T.primaryGlow}`,
                        }}
                      />
                    </div>
                    <small
                      style={{
                        fontSize: 10,
                        color: T.textMuted,
                        whiteSpace: "nowrap",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        maxWidth: "100%",
                        direction: "ltr",
                      }}
                    >
                      {bin.label}
                    </small>
                  </div>
                );
              })}
            </div>
            {/* Quartile row */}
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(5, 1fr)",
                gap: 10,
                marginTop: 16,
              }}
            >
              {[
                ["حداقل", data.distributions.score.minimum],
                ["P۱۰", data.distributions.score.p10],
                ["میانه", data.distributions.score.median],
                ["P۹۰", data.distributions.score.p90],
                ["حداکثر", data.distributions.score.maximum],
              ].map(([lbl, val], i) => (
                <div
                  key={lbl}
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    gap: 4,
                    padding: "12px 8px",
                    background: i === 2 ? T.primaryBg : T.raised,
                    border: `1px solid ${i === 2 ? T.primaryBg2 : T.border}`,
                    borderRadius: T.radiusXs,
                  }}
                >
                  <span
                    style={{
                      fontSize: 11,
                      color: T.textMuted,
                      fontWeight: 600,
                    }}
                  >
                    {lbl}
                  </span>
                  <strong
                    style={{
                      fontSize: 18,
                      fontWeight: 900,
                      color: i === 2 ? T.primaryLight : T.white,
                    }}
                  >
                    {val}
                  </strong>
                </div>
              ))}
            </div>
          </Panel>

          {/* ─── Score Bands ─── */}
          <Panel>
            <CompactHeading kicker="طبقه‌بندی" title="محدوده‌های امتیاز" />
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              {data.distributions.bands.map((band) => {
                const color = bandColors[band.key] || T.primary;
                return (
                  <div
                    key={band.key}
                    style={{
                      display: "grid",
                      gridTemplateColumns: "1fr 2fr auto",
                      gap: 12,
                      alignItems: "center",
                      padding: "10px 12px",
                      background: T.raised,
                      borderRadius: T.radiusXs,
                      borderRight: `3px solid ${color}`,
                    }}
                  >
                    <div>
                      <strong
                        style={{
                          fontSize: 12,
                          fontWeight: 700,
                          color: T.text,
                          display: "block",
                        }}
                      >
                        {BAND_LABELS[band.key] || band.label}
                      </strong>
                      <span
                        style={{
                          fontSize: 10,
                          color: T.textMuted,
                          direction: "ltr",
                        }}
                      >
                        {band.minimum}–{band.maximum}
                      </span>
                    </div>
                    <div
                      style={{
                        height: 6,
                        background: T.surface,
                        borderRadius: 99,
                        overflow: "hidden",
                        border: `1px solid ${T.border}`,
                      }}
                    >
                      <i
                        style={{
                          display: "block",
                          height: "100%",
                          width: `${band.percentage}%`,
                          background: color,
                          borderRadius: 99,
                          boxShadow: `0 0 8px ${color}66`,
                          transition: "width .6s",
                        }}
                      />
                    </div>
                    <b
                      style={{
                        display: "flex",
                        flexDirection: "column",
                        alignItems: "flex-end",
                        fontWeight: 800,
                      }}
                    >
                      <span style={{ fontSize: 13, color: T.white }}>
                        {formatNumber(band.count)}
                      </span>
                      <small
                        style={{
                          fontSize: 10,
                          color: T.textMuted,
                          fontWeight: 500,
                        }}
                      >
                        {formatPercent(band.percentage)}
                      </small>
                    </b>
                  </div>
                );
              })}
            </div>
          </Panel>

          {/* ─── Coordinate Quality ─── */}
          <Panel>
            <CompactHeading kicker="ورودی موقعیت" title="کیفیت مختصات" />
            <div
              style={{
                display: "flex",
                justifyContent: "center",
                marginBottom: 20,
              }}
            >
              <div
                style={{
                  width: 150,
                  height: 150,
                  borderRadius: "50%",
                  background: `conic-gradient(${T.secondary} 0 ${data.coordinates.exactPercentage}%, ${T.orange} ${data.coordinates.exactPercentage}% 100%)`,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  boxShadow: `0 0 40px ${T.secondaryGlow}`,
                }}
              >
                <div
                  style={{
                    width: 96,
                    height: 96,
                    borderRadius: "50%",
                    background: T.surface,
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 2,
                  }}
                >
                  <strong
                    style={{ fontSize: 20, fontWeight: 900, color: T.white }}
                  >
                    {formatPercent(data.coordinates.exactPercentage)}
                  </strong>
                  <span style={{ fontSize: 11, color: T.textMuted }}>دقیق</span>
                </div>
              </div>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  padding: "10px 14px",
                  background: T.raised,
                  borderRadius: T.radiusXs,
                  fontSize: 13,
                }}
              >
                <span
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    color: T.textSec,
                  }}
                >
                  <i
                    style={{
                      width: 10,
                      height: 10,
                      borderRadius: "50%",
                      background: T.secondary,
                      display: "inline-block",
                    }}
                  />
                  دقیق
                </span>
                <strong style={{ fontWeight: 800, color: T.white }}>
                  {formatNumber(data.coordinates.exact)}
                </strong>
              </div>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  padding: "10px 14px",
                  background: T.raised,
                  borderRadius: T.radiusXs,
                  fontSize: 13,
                }}
              >
                <span
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    color: T.textSec,
                  }}
                >
                  <i
                    style={{
                      width: 10,
                      height: 10,
                      borderRadius: "50%",
                      background: T.orange,
                      display: "inline-block",
                    }}
                  />
                  تقریبی
                </span>
                <strong style={{ fontWeight: 800, color: T.white }}>
                  {formatNumber(data.coordinates.approximate)}
                </strong>
              </div>
            </div>
          </Panel>

          {/* ─── Cleaning Flow (wide) ─── */}
          <Panel wide>
            <CompactHeading
              kicker="پاکسازی"
              title="آنچه وارد ماشین امتیازدهی شد"
              description="رکوردهای ردشده هرگز امتیاز نمی‌گیرند. شکاف‌های اختیاری به‌صورت صریح impute می‌شوند و اطمینان کیفیت داده را کاهش می‌دهند."
            />
            {/* Flow diagram */}
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr auto 1fr auto 1fr 1fr",
                gap: 12,
                alignItems: "center",
                marginBottom: 24,
              }}
            >
              {[
                {
                  label: "ورودی خام",
                  value: cleaning.inputCount,
                  color: T.textSec,
                  bg: T.raised,
                  border: T.border,
                },
                { arrow: true },
                {
                  label: "پذیرفته‌شده",
                  value: cleaning.acceptedCount,
                  color: T.secondary,
                  bg: T.secondaryBg,
                  border: T.secondaryBg2,
                },
                { arrow: true },
                {
                  label: "امتیازدهی‌شده",
                  value: data.total,
                  color: T.primaryLight,
                  bg: T.primaryBg,
                  border: T.primaryBg2,
                },
                {
                  label: "ردشده",
                  value: cleaning.rejectedCount,
                  color: T.red,
                  bg: T.redBg,
                  border: T.redBg2,
                },
              ].map((step, i) => {
                if (step.arrow) {
                  return (
                    <div
                      key={`arrow-${i}`}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        color: T.textMuted,
                        fontSize: 20,
                        fontWeight: 300,
                      }}
                    >
                      ←
                    </div>
                  );
                }
                return (
                  <div
                    key={step.label}
                    style={{
                      background: step.bg,
                      border: `1px solid ${step.border}`,
                      borderRadius: T.radiusSm,
                      padding: "16px 14px",
                      textAlign: "center",
                    }}
                  >
                    <span
                      style={{
                        fontSize: 11,
                        color: T.textMuted,
                        display: "block",
                        marginBottom: 6,
                        fontWeight: 600,
                      }}
                    >
                      {step.label}
                    </span>
                    <strong
                      style={{
                        fontSize: 22,
                        fontWeight: 900,
                        color: step.color,
                        letterSpacing: -0.5,
                      }}
                    >
                      {formatNumber(step.value)}
                    </strong>
                  </div>
                );
              })}
            </div>
            {/* Dictionaries */}
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: 16,
              }}
            >
              <Dictionary
                title="دلایل رد شدن"
                values={cleaning.rejectionCounts}
                dict={REJECTION_LABELS}
              />
              <Dictionary
                title={`جایگزینی‌ها · ${formatNumber(cleaning.recordsWithImputation)} رکورد`}
                values={cleaning.imputationCounts}
                dict={IMPUTATION_LABELS}
              />
            </div>
          </Panel>

          {/* ─── Neighborhood Table (full) ─── */}
          <Panel full>
            <CompactHeading
              kicker="نمای مکانی"
              title="رفتار نمونه محله‌ها"
              description="فقط محله‌هایی با حداقل پنج آگهی پذیرفته‌شده نمایش داده می‌شوند. این میانگین‌ها نمونه جمع‌آوری‌شده را توصیف می‌کنند، نه همه معاملات تهران."
            />
            <div
              style={{
                overflowX: "auto",
                borderRadius: T.radiusSm,
                border: `1px solid ${T.border}`,
              }}
            >
              <table
                style={{
                  width: "100%",
                  borderCollapse: "collapse",
                  fontSize: 13,
                  textAlign: "right",
                }}
              >
                <thead>
                  <tr>
                    {[
                      "محله",
                      "آگهی",
                      "میانگین امتیاز",
                      "میانگین ملک",
                      "میانگین ریسک",
                      "ریسک بالا",
                      "میانگین اطمینان",
                      "میانگین قیمت / متر",
                      "میانگین تخفیف مدل",
                    ].map((h) => (
                      <th
                        key={h}
                        style={{
                          padding: "12px 14px",
                          fontSize: 11,
                          fontWeight: 700,
                          color: T.textMuted,
                          background: T.raised,
                          borderBottom: `1px solid ${T.border}`,
                          textAlign: "right",
                          whiteSpace: "nowrap",
                          textTransform: "uppercase",
                          letterSpacing: 0.5,
                        }}
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {data.neighborhoods.map((area) => {
                    const isGood = area.averageModelDiscountPct >= 0;
                    const scoreColor =
                      area.averageScore >= 80
                        ? T.green
                        : area.averageScore >= 55
                          ? T.orange
                          : T.red;
                    const scoreBg =
                      area.averageScore >= 80
                        ? T.greenBg
                        : area.averageScore >= 55
                          ? T.orangeBg
                          : T.redBg;
                    return (
                      <tr
                        key={area.name}
                        style={{ transition: "background .15s" }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.background = T.surfaceHover;
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.background = "transparent";
                        }}
                      >
                        <td
                          style={{
                            padding: "12px 14px",
                            borderBottom: `1px solid ${T.border}`,
                            whiteSpace: "nowrap",
                          }}
                        >
                          <strong
                            dir="auto"
                            style={{
                              fontSize: 13,
                              fontWeight: 700,
                              color: T.text,
                            }}
                          >
                            {area.name}
                          </strong>
                        </td>
                        <td
                          style={{
                            padding: "12px 14px",
                            borderBottom: `1px solid ${T.border}`,
                            color: T.textSec,
                            whiteSpace: "nowrap",
                          }}
                        >
                          {formatNumber(area.count)}
                        </td>
                        <td
                          style={{
                            padding: "12px 14px",
                            borderBottom: `1px solid ${T.border}`,
                            whiteSpace: "nowrap",
                          }}
                        >
                          <span
                            style={{
                              display: "inline-block",
                              padding: "4px 12px",
                              borderRadius: 6,
                              background: scoreBg,
                              color: scoreColor,
                              fontWeight: 800,
                              fontSize: 13,
                            }}
                          >
                            {area.averageScore}
                          </span>
                        </td>
                        <td
                          style={{
                            padding: "12px 14px",
                            borderBottom: `1px solid ${T.border}`,
                            color: T.textSec,
                            whiteSpace: "nowrap",
                          }}
                        >
                          {formatNumber(area.averagePropertyQuality)}
                        </td>
                        <td
                          style={{
                            padding: "12px 14px",
                            borderBottom: `1px solid ${T.border}`,
                            color: T.textSec,
                            whiteSpace: "nowrap",
                          }}
                        >
                          {formatNumber(area.averageRisk)}
                        </td>
                        <td
                          style={{
                            padding: "12px 14px",
                            borderBottom: `1px solid ${T.border}`,
                            color:
                              area.highRiskCount > 0 ? T.orange : T.textSec,
                            whiteSpace: "nowrap",
                            fontWeight: area.highRiskCount > 0 ? 700 : 400,
                          }}
                        >
                          {formatNumber(area.highRiskCount)}
                        </td>
                        <td
                          style={{
                            padding: "12px 14px",
                            borderBottom: `1px solid ${T.border}`,
                            color: T.textSec,
                            whiteSpace: "nowrap",
                          }}
                        >
                          {formatPercent(area.averageConfidence)}
                        </td>
                        <td
                          style={{
                            padding: "12px 14px",
                            borderBottom: `1px solid ${T.border}`,
                            color: T.text,
                            whiteSpace: "nowrap",
                            fontWeight: 600,
                          }}
                        >
                          {formatMoney(area.averageAskingPricePerMeter)}
                        </td>
                        <td
                          style={{
                            padding: "12px 14px",
                            borderBottom: `1px solid ${T.border}`,
                            color: isGood ? T.green : T.red,
                            fontWeight: 800,
                            whiteSpace: "nowrap",
                            direction: "ltr",
                            textAlign: "right",
                          }}
                        >
                          {formatPercent(area.averageModelDiscountPct, true)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Panel>
        </div>

        {/* ═══ METHODOLOGY CALLOUT ═══ */}
        <section
          style={{
            display: "flex",
            gap: 16,
            padding: 22,
            background: `linear-gradient(135deg, ${T.primaryBg}, ${T.secondaryBg})`,
            border: `1px solid ${T.primaryBg2}`,
            borderRadius: T.radius,
            marginBottom: 24,
            boxShadow: T.shadow,
            alignItems: "flex-start",
          }}
        >
          <span
            style={{
              width: 44,
              height: 44,
              borderRadius: T.radiusSm,
              background: `linear-gradient(135deg, ${T.primary}, ${T.secondary})`,
              color: "#fff",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
              boxShadow: `0 4px 16px ${T.primaryGlow}`,
            }}
          >
            <Icon name="alert" size={22} />
          </span>
          <div style={{ flex: 1 }}>
            <strong
              style={{
                display: "block",
                fontSize: 15,
                fontWeight: 800,
                color: T.white,
                marginBottom: 8,
              }}
            >
              چگونه این صفحه را بخوانید
            </strong>
            <p
              style={{
                fontSize: 13,
                color: T.textSec,
                margin: "0 0 12px",
                lineHeight: 1.7,
              }}
            >
              {data.methodology.limitations.join(" ")}
            </p>
            <code
              dir="ltr"
              style={{
                display: "block",
                padding: "10px 14px",
                background: T.surface,
                border: `1px solid ${T.border}`,
                borderRadius: T.radiusXs,
                fontFamily: "monospace",
                fontSize: 12,
                color: T.primaryLight,
                textAlign: "left",
                overflowX: "auto",
              }}
            >
              {data.methodology.recommendationFormula}
            </code>
          </div>
        </section>

        {/* ═══ RAW JSON ═══ */}
        <details
          style={{
            background: T.surface,
            border: `1px solid ${T.border}`,
            borderRadius: T.radius,
            overflow: "hidden",
            boxShadow: T.shadow,
          }}
        >
          <summary
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              padding: "16px 24px",
              cursor: "pointer",
              fontSize: 14,
              fontWeight: 600,
              color: T.textSec,
              listStyle: "none",
            }}
          >
            <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <Icon name="database" size={18} />
              داده تحلیل امتیازدهی JSON
            </span>
            <span style={{ fontSize: 12, color: T.textMuted }}>
              مشاهده پاسخ دقیق API
            </span>
          </summary>
          <pre
            style={{
              padding: 24,
              margin: 0,
              fontSize: 12,
              color: T.textMuted,
              background: T.raised,
              overflowX: "auto",
              direction: "ltr",
              textAlign: "left",
              lineHeight: 1.6,
              fontFamily: "monospace",
            }}
          >
            {JSON.stringify(data, null, 2)}
          </pre>
        </details>
      </main>

      <AppFooter />
    </div>
  );
}
