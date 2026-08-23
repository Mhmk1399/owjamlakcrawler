import { useEffect, useState } from "react";
import {
  AppFooter,
  AppHeader,
  ErrorPage,
  formatMoney,
  formatNumber,
  formatPercent,
  Icon,
  LoadingPage,
  ScoreBar,
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

/* ──────────────────────── Global CSS (once) ──────────────────────── */
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
@keyframes owjSpin { to { transform: rotate(360deg); } }
`;
let injected = false;
function injectCSS() {
  if (injected || typeof document === "undefined") return;
  injected = true;
  const el = document.createElement("style");
  el.textContent = GLOBAL_CSS;
  document.head.appendChild(el);
}

/* ──────────────────────── Static Data (unchanged keys/logic, translated labels) ──────────────────────── */
const FACTORS = [
  [
    "modelValue",
    "ارزش مدل",
    "۴۵٪ از ارزش معامله",
    "میزان مطلوب بودن تخفیف مدل این آگهی نسبت به همه آگهی‌های امتیازدهی‌شده.",
  ],
  [
    "nearbyValue",
    "ارزش همسایگی",
    "۴۰٪ از ارزش معامله",
    "میزان مطلوب بودن قیمت درخواستی نسبت به آگهی‌های مقایسه مقاوم نزدیک.",
  ],
  [
    "localPosition",
    "موقعیت محلی",
    "۱۵٪ از ارزش معامله",
    "صدک قیمت هر متر مربع پایین‌تر، امتیاز بالاتری تولید می‌کند.",
  ],
  [
    "confidence",
    "اطمینان",
    "دروازه پیشنهاد",
    "اعتبارسنجی مدل، پوشش مقایسه، دقت مختصات و کامل بودن داده.",
  ],
  [
    "dataQuality",
    "کیفیت داده",
    "ورودی اطمینان",
    "زمانی که فیلدهای اختیاری منبع به‌طور صریح imputeشده باشند، کاهش می‌یابد.",
  ],
  [
    "propertyQuality",
    "کیفیت ملک",
    "سیگنال جداگانه",
    "سن، امکانات، طبقه و تعداد واحد در هر طبقه؛ امتیاز معامله را متورم نمی‌کند.",
  ],
  [
    "risk",
    "ریسک",
    "دروازه پیشنهاد",
    "بالاتر یعنی قیمت غیرعادی، شواهد ضعیف یا پراکنده، اختلاف نظر مدل یا داده ناقص.",
    true,
  ],
];

/* ──────────────────────── Logic (unchanged) ──────────────────────── */
function tone(value) {
  return value >= 80 ? "green" : value >= 55 ? "orange" : "red";
}

function toneColor(t) {
  return t === "green" ? T.green : t === "orange" ? T.orange : T.red;
}
function toneBg(t) {
  return t === "green" ? T.greenBg : t === "orange" ? T.orangeBg : T.redBg;
}
function toneBg2(t) {
  return t === "green" ? T.greenBg2 : t === "orange" ? T.orangeBg2 : T.redBg2;
}

/* ──────────────────────── BooleanValue ──────────────────────── */
function BooleanValue({ value }) {
  const known = value === 1 || value === 0 || typeof value === "boolean";
  const enabled = value === 1 || value === true;
  const label = known ? (enabled ? "بله" : "خیر") : "نامشخص";
  const color = !known ? T.textMuted : enabled ? T.green : T.red;
  const bg = !known ? T.raised : enabled ? T.greenBg : T.redBg;
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 4,
        padding: "3px 10px",
        borderRadius: 6,
        fontSize: 11,
        fontWeight: 700,
        background: bg,
        color,
      }}
    >
      {enabled && known && "✓"} {label}
    </span>
  );
}

/* ──────────────────────── Panel wrapper ──────────────────────── */
function Panel({ children, wide = false, style = {} }) {
  return (
    <section
      style={{
        background: T.surface,
        border: `1px solid ${T.border}`,
        borderRadius: T.radius,
        padding: 28,
        boxShadow: T.shadow,
        gridColumn: wide ? "1 / -1" : "auto",
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
    <div style={{ marginBottom: 20 }}>
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
          style={{ fontSize: 13, color: T.textSec, margin: 0, lineHeight: 1.7 }}
        >
          {description}
        </p>
      )}
    </div>
  );
}

/* ──────────────────────── ScoreBar (styled wrapper - use imported ScoreBar) ──────────────────────── */
function StyledScoreBar({ value, tone: t }) {
  const color = toneColor(t);
  return (
    <div
      style={{
        height: 5,
        background: T.border,
        borderRadius: 99,
        overflow: "hidden",
        width: "100%",
        margin: "8px 0",
      }}
    >
      <div
        style={{
          height: "100%",
          width: `${Math.max(0, Math.min(100, value))}%`,
          borderRadius: 99,
          background: `linear-gradient(90deg, ${color}, ${color})`,
          transition: "width .6s cubic-bezier(.22,1,.36,1)",
          boxShadow: `0 0 12px ${color}55`,
        }}
      />
    </div>
  );
}

/* ──────────────────────── PropertyFacts ──────────────────────── */
function PropertyFacts({ item }) {
  const facts = [
    ["مساحت", `${formatNumber(item.property.area)} متر مربع`],
    ["اتاق‌ها", formatNumber(item.property.rooms)],
    ["ساخت", formatNumber(item.property.constructionYear)],
    [
      "طبقه",
      `${formatNumber(item.property.floor)} / ${formatNumber(item.property.totalFloors)}`,
    ],
    ["واحد در طبقه", formatNumber(item.property.unitsPerFloor)],
    ["سن بنا", `${formatNumber(item.property.buildingAge)} سال`],
  ];

  return (
    <Panel>
      <CompactHeading kicker="ملک" title="مشخصات منبع" />
      {/* Fact grid */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))",
          gap: 12,
          marginBottom: 20,
        }}
      >
        {facts.map(([label, value]) => (
          <div
            key={label}
            style={{
              background: T.raised,
              padding: "12px 14px",
              borderRadius: T.radiusSm,
              border: `1px solid ${T.border}`,
            }}
          >
            <span
              style={{
                fontSize: 11,
                color: T.textMuted,
                display: "block",
                marginBottom: 4,
              }}
            >
              {label}
            </span>
            <strong style={{ fontSize: 15, fontWeight: 800, color: T.white }}>
              {value}
            </strong>
          </div>
        ))}
      </div>
      {/* Amenities */}
      <div
        style={{ display: "flex", flexWrap: "wrap", gap: 10, marginBottom: 20 }}
      >
        {Object.entries(item.amenities || {}).map(([key, value]) => (
          <div
            key={key}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              padding: "8px 12px",
              background: T.raised,
              borderRadius: T.radiusXs,
              border: `1px solid ${T.border}`,
              fontSize: 12,
            }}
          >
            <BooleanValue value={value} />
            <span style={{ color: T.textSec }}>{key}</span>
          </div>
        ))}
      </div>
      {/* Coordinates */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          padding: "12px 14px",
          background: T.primaryBg,
          border: `1px solid ${T.primaryBg2}`,
          borderRadius: T.radiusSm,
          color: T.primaryLight,
        }}
      >
        <Icon name="location" size={18} />
        <span
          dir="ltr"
          style={{
            fontFamily: "monospace",
            fontSize: 13,
            color: T.white,
            flex: 1,
            textAlign: "right",
          }}
        >
          {item.location.latitude.toFixed(5)},{" "}
          {item.location.longitude.toFixed(5)}
        </span>
        <strong
          style={{
            fontSize: 11,
            padding: "3px 10px",
            borderRadius: 6,
            background: T.primaryBg2,
            color: T.primaryLight,
            fontWeight: 700,
          }}
        >
          {item.location.accuracy}
        </strong>
      </div>
    </Panel>
  );
}

/* ──────────────────────── ScoreFactors ──────────────────────── */
function ScoreFactors({ item }) {
  return (
    <Panel wide>
      <CompactHeading
        kicker="آناتومی امتیاز"
        title="تمام ورودی‌های پیشنهاد"
        description="ابتدا ارزش معامله ساخته می‌شود. اطمینان و ریسک فقط می‌توانند آن را کاهش دهند؛ کیفیت ملک به‌عنوان سیگنال جداگانه قابل بررسی باقی می‌ماند."
      />

      {/* Factor Grid */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
          gap: 14,
          marginBottom: 24,
        }}
      >
        {/* Primary Deal Value card */}
        <article
          style={{
            background: `linear-gradient(135deg, ${T.primaryBg2}, ${T.secondaryBg2})`,
            border: `1px solid ${T.primaryBg2}`,
            borderRadius: T.radius,
            padding: 18,
            position: "relative",
            overflow: "hidden",
          }}
        >
          <div
            style={{
              position: "absolute",
              top: 0,
              right: 0,
              left: 0,
              height: 3,
              background: `linear-gradient(90deg, ${T.primary}, ${T.secondary})`,
            }}
          />
          <span
            style={{
              fontSize: 11,
              fontWeight: 700,
              color: T.secondary,
              textTransform: "uppercase",
              letterSpacing: 1,
            }}
          >
            ارزش معامله
          </span>
          <strong
            style={{
              fontSize: 36,
              fontWeight: 900,
              color: T.white,
              display: "block",
              margin: "6px 0",
              letterSpacing: -1,
            }}
          >
            {item.scores.dealValue}
          </strong>
          <StyledScoreBar
            value={item.scores.dealValue}
            tone={tone(item.scores.dealValue)}
          />
          <p
            style={{
              fontSize: 12,
              color: T.textSec,
              margin: "6px 0 0",
              lineHeight: 1.6,
            }}
          >
            نتیجه وزنی قبل از دروازه اطمینان.
          </p>
        </article>

        {/* Other factors */}
        {FACTORS.map(([key, label, weight, description, inverse]) => {
          const val = item.scores[key];
          const t = tone(inverse ? 100 - val : val);
          return (
            <article
              key={key}
              style={{
                background: T.raised,
                border: `1px solid ${T.border}`,
                borderRadius: T.radius,
                padding: 18,
                transition: "transform .2s, border-color .2s",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.transform = "translateY(-3px)";
                e.currentTarget.style.borderColor = T.borderLight;
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = "translateY(0)";
                e.currentTarget.style.borderColor = T.border;
              }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "flex-start",
                  gap: 8,
                }}
              >
                <span style={{ fontSize: 13, fontWeight: 700, color: T.text }}>
                  {label}
                </span>
                <small
                  style={{
                    fontSize: 10,
                    color: T.textMuted,
                    background: T.surface,
                    padding: "3px 8px",
                    borderRadius: 5,
                    whiteSpace: "nowrap",
                  }}
                >
                  {weight}
                </small>
              </div>
              <strong
                style={{
                  fontSize: 30,
                  fontWeight: 900,
                  color: toneColor(t),
                  display: "block",
                  margin: "8px 0 4px",
                  letterSpacing: -1,
                }}
              >
                {val}
              </strong>
              <StyledScoreBar value={val} tone={t} />
              <p
                style={{
                  fontSize: 12,
                  color: T.textMuted,
                  margin: "6px 0 0",
                  lineHeight: 1.6,
                }}
              >
                {description}
              </p>
            </article>
          );
        })}
      </div>

      {/* Formula box */}
      <div
        style={{
          background: `linear-gradient(135deg, ${T.surfaceLight}, ${T.raised})`,
          border: `1px solid ${T.borderMed}`,
          borderRadius: T.radius,
          padding: 20,
          display: "flex",
          flexDirection: "column",
          gap: 12,
        }}
      >
        <span
          style={{
            fontSize: 11,
            fontWeight: 800,
            color: T.secondary,
            textTransform: "uppercase",
            letterSpacing: 1,
            marginBottom: 4,
          }}
        >
          فرمول محاسبه
        </span>
        {[
          {
            label: "ارزش معامله",
            code: `${item.scores.modelValue} × 45% + ${item.scores.nearbyValue} × 40% + ${item.scores.localPosition} × 15% = ${item.scores.dealValue}`,
          },
          {
            label: "دروازه اطمینان",
            code: `55% + ${item.scores.confidence} × 45% = ${formatPercent(item.formula.appliedConfidenceGate * 100)}`,
          },
          {
            label: "دروازه ریسک",
            code: `100% − ${item.scores.risk} × 40% = ${formatPercent(item.formula.appliedRiskGate * 100)}`,
          },
          {
            label: "نهایی",
            code: `${item.scores.dealValue} × ${item.formula.appliedConfidenceGate.toFixed(3)} × ${item.formula.appliedRiskGate.toFixed(3)} = ${item.formula.rawRecommendation.toFixed(2)} → ${item.scores.recommendation}`,
            highlight: true,
          },
        ].map((row) => (
          <div
            key={row.label}
            style={{
              display: "grid",
              gridTemplateColumns: "140px 1fr",
              gap: 14,
              alignItems: "center",
              padding: row.highlight ? "12px 14px" : "8px 0",
              background: row.highlight ? T.primaryBg : "transparent",
              border: row.highlight ? `1px solid ${T.primaryBg2}` : "none",
              borderRadius: row.highlight ? T.radiusXs : 0,
            }}
          >
            <span
              style={{
                fontSize: 12,
                fontWeight: 700,
                color: row.highlight ? T.primaryLight : T.textSec,
              }}
            >
              {row.label}
            </span>
            <code
              dir="ltr"
              style={{
                fontFamily: "monospace",
                fontSize: 12,
                color: row.highlight ? T.white : T.text,
                background: row.highlight ? "transparent" : T.surface,
                padding: row.highlight ? 0 : "8px 12px",
                borderRadius: 6,
                textAlign: "left",
                display: "block",
                overflowX: "auto",
              }}
            >
              {row.code}
            </code>
          </div>
        ))}
      </div>
    </Panel>
  );
}

/* ──────────────────────── Comparables ──────────────────────── */
function Comparables({ item }) {
  const rows = item.evidence.comparables || [];
  const thStyle = {
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
  };
  const tdStyle = {
    padding: "12px 14px",
    borderBottom: `1px solid ${T.border}`,
    color: T.textSec,
    whiteSpace: "nowrap",
    fontSize: 13,
    verticalAlign: "middle",
  };

  return (
    <Panel wide>
      <CompactHeading
        kicker="شواهد نزدیک"
        title={`${formatNumber(item.evidence.comparableCount)} مقایسه تعدیل‌شده در شعاع ${formatNumber(item.evidence.comparableRadiusMeters)} متر`}
        description="دوازده تطابق قوی نمایش داده می‌شوند. شباهت شامل موقعیت، مساحت، سن، اتاق، طبقه نسبی، تراکم واحد و امکانات است. قیمت هر مقایسه قبل از تجمیع به مشخصات این ملک نرمال می‌شود."
      />

      {rows.length > 0 ? (
        <div
          style={{
            overflowX: "auto",
            borderRadius: T.radiusSm,
            border: `1px solid ${T.border}`,
          }}
        >
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                <th style={thStyle}>آگهی مقایسه</th>
                <th style={thStyle}>تطابق</th>
                <th style={thStyle}>فاصله</th>
                <th style={thStyle}>مشخصات ملک</th>
                <th style={thStyle}>قیمت درخواستی</th>
                <th style={thStyle}>خام / متر</th>
                <th style={thStyle}>تعدیل / متر</th>
                <th style={thStyle}>این آگهی در برابر تعدیل</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const isGood = row.subjectAdjustedPriceDifferencePct <= 0;
                return (
                  <tr
                    key={row.token}
                    style={{ transition: "background .15s" }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background = T.surfaceHover;
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = "transparent";
                    }}
                  >
                    <td style={tdStyle}>
                      <a
                        href={row.url}
                        target="_blank"
                        rel="noreferrer"
                        style={{
                          textDecoration: "none",
                          display: "flex",
                          flexDirection: "column",
                          gap: 2,
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
                          {row.title}
                        </strong>
                        <small
                          dir="auto"
                          style={{ fontSize: 11, color: T.textMuted }}
                        >
                          {row.neighborhood} · {row.coordinateAccuracy}
                        </small>
                      </a>
                    </td>
                    <td style={tdStyle}>
                      <span
                        style={{
                          padding: "3px 10px",
                          borderRadius: 6,
                          background: T.secondaryBg,
                          color: T.secondary,
                          fontWeight: 700,
                          fontSize: 12,
                        }}
                      >
                        {formatPercent(row.similarity)}
                      </span>
                    </td>
                    <td style={tdStyle}>
                      {formatNumber(row.distanceMeters)} m
                    </td>
                    <td style={tdStyle}>
                      <strong
                        style={{
                          display: "block",
                          color: T.text,
                          fontWeight: 700,
                        }}
                      >
                        {formatNumber(row.area)} متر · {formatNumber(row.rooms)}{" "}
                        اتاق
                      </strong>
                      <small
                        style={{
                          display: "block",
                          fontSize: 11,
                          color: T.textMuted,
                          marginTop: 2,
                        }}
                      >
                        طبقه {formatNumber(row.floor)}/
                        {formatNumber(row.totalFloors)} ·{" "}
                        {row.elevator === 1
                          ? "آسانسور"
                          : row.elevator === 0
                            ? "بدون آسانسور"
                            : "آسانسور نامشخص"}{" "}
                        ·{" "}
                        {row.parking === 1
                          ? "پارکینگ"
                          : row.parking === 0
                            ? "بدون پارکینگ"
                            : "پارکینگ نامشخص"}
                      </small>
                    </td>
                    <td style={tdStyle}>{formatMoney(row.askingPrice)}</td>
                    <td style={tdStyle}>
                      {formatMoney(row.askingPricePerMeter)}
                    </td>
                    <td style={tdStyle}>
                      {formatMoney(row.adjustedPricePerMeter)}
                    </td>
                    <td
                      style={{
                        ...tdStyle,
                        color: isGood ? T.green : T.orange,
                        fontWeight: 700,
                      }}
                    >
                      {formatPercent(
                        row.subjectAdjustedPriceDifferencePct,
                        true,
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <p
          style={{
            textAlign: "center",
            padding: 40,
            color: T.textMuted,
            fontSize: 14,
          }}
        >
          هیچ مقایسه نزدیکی برای این آگهی قوانین انتخاب را رد نکرد.
        </p>
      )}
    </Panel>
  );
}

/* ══════════════════════════════════════════════════════════════════
   MAIN SCORE DETAIL PAGE
   ══════════════════════════════════════════════════════════════════ */
export default function ScoreDetailPage({ token }) {
  injectCSS();
  const [data, setData] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    fetch(`/score-details/${encodeURIComponent(token)}`, {
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok)
          throw new Error(
            response.status === 404
              ? "این توکن در دیتاست امتیازدهی‌شده وجود ندارد."
              : `سرور HTTP ${response.status} برگرداند`,
          );
        return response.json();
      })
      .then(setData)
      .catch((caught) => {
        if (caught.name !== "AbortError") setError(caught.message);
      });
    return () => controller.abort();
  }, [token]);

  if (!data && !error) return <LoadingPage />;
  if (error) return <ErrorPage message={error} />;

  const item = data.listing;
  const scoreTone = tone(item.scores.recommendation);

  const bandLabels = {
    "top-tier": "درجه یک",
    "strong-buy": "خرید قوی",
    solid: "مطمئن",
    watchlist: "لیست پایش",
    hold: "نگهداری",
    avoid: "اجتناب",
    review: "بازبینی",
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
      <AppHeader />

      <main
        style={{ maxWidth: 1400, margin: "0 auto", padding: "24px 28px 80px" }}
      >
        {/* Breadcrumb */}
        <a
          href="/#scored-listings"
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 8,
            padding: "8px 14px",
            borderRadius: T.radiusSm,
            border: `1px solid ${T.border}`,
            background: T.surface,
            color: T.textSec,
            textDecoration: "none",
            fontSize: 13,
            fontWeight: 600,
            marginBottom: 24,
            transition: "all .2s",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.color = T.white;
            e.currentTarget.style.borderColor = T.borderLight;
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.color = T.textSec;
            e.currentTarget.style.borderColor = T.border;
          }}
        >
          <Icon name="back" size={16} />
          <span style={{ transform: "scaleX(-1)", display: "inline-block" }}>
            →
          </span>
          بازگشت به آگهی‌های امتیازدهی‌شده
        </a>

        {/* ═══ HERO SECTION ═══ */}
        <section
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 260px",
            gap: 32,
            padding: 32,
            background: T.surface,
            border: `1px solid ${T.border}`,
            borderRadius: 20,
            boxShadow: T.shadowLg,
            marginBottom: 24,
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

          {/* Copy */}
          <div>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 12,
                marginBottom: 16,
                flexWrap: "wrap",
              }}
            >
              <span
                style={{
                  padding: "5px 14px",
                  borderRadius: 20,
                  background: `linear-gradient(135deg, ${T.primary}, ${T.secondary})`,
                  color: "#fff",
                  fontSize: 12,
                  fontWeight: 700,
                  boxShadow: `0 2px 12px ${T.primaryGlow}`,
                }}
              >
                {bandLabels[item.scores.band] ||
                  item.scores.band.replaceAll("-", " ")}
              </span>
              <span style={{ fontSize: 12, color: T.textMuted }}>
                رتبه{" "}
                <strong style={{ color: T.text }}>
                  #{formatNumber(item.rank)}
                </strong>{" "}
                از {formatNumber(data.population.total)} · برترین{" "}
                <strong style={{ color: T.secondary }}>
                  {formatPercent(data.population.topPercent)}
                </strong>
              </span>
            </div>
            <h1
              dir="auto"
              style={{
                fontSize: 30,
                fontWeight: 900,
                color: T.white,
                margin: "0 0 12px",
                lineHeight: 1.35,
                letterSpacing: -0.5,
              }}
            >
              {item.title}
            </h1>
            <p
              dir="auto"
              style={{
                fontSize: 15,
                color: T.textSec,
                margin: "0 0 20px",
                lineHeight: 1.75,
              }}
            >
              {item.neighborhood} · {formatNumber(item.property.area)} متر مربع
              · {formatNumber(item.property.rooms)} اتاق
            </p>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 14,
                flexWrap: "wrap",
              }}
            >
              <a
                href={item.url}
                target="_blank"
                rel="noreferrer"
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 8,
                  padding: "12px 22px",
                  borderRadius: T.radiusSm,
                  border: "none",
                  background: `linear-gradient(135deg, ${T.primary}, ${T.secondary})`,
                  color: "#fff",
                  fontSize: 14,
                  fontWeight: 700,
                  cursor: "pointer",
                  textDecoration: "none",
                  boxShadow: `0 4px 16px ${T.primaryGlow}`,
                  transition: "transform .2s, box-shadow .2s",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.transform = "translateY(-2px)";
                  e.currentTarget.style.boxShadow = `0 6px 24px ${T.primaryGlow}`;
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.transform = "translateY(0)";
                  e.currentTarget.style.boxShadow = `0 4px 16px ${T.primaryGlow}`;
                }}
              >
                مشاهده آگهی اصلی در دیوار
                <Icon name="external" size={17} />
              </a>
              <span
                style={{
                  fontSize: 11,
                  fontFamily: "monospace",
                  color: T.textMuted,
                  padding: "4px 12px",
                  borderRadius: 6,
                  background: T.raised,
                  border: `1px solid ${T.border}`,
                  direction: "ltr",
                }}
              >
                {item.token}
              </span>
            </div>
          </div>

          {/* Score Orbit */}
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              gap: 10,
              padding: 20,
              background: `radial-gradient(circle at center, ${toneBg2(scoreTone)}, transparent 70%)`,
              borderRadius: 20,
            }}
          >
            <div
              style={{
                width: 160,
                height: 160,
                borderRadius: "50%",
                background: `conic-gradient(${toneColor(scoreTone)} 0 ${item.scores.recommendation * 3.6}deg, ${T.raised} ${item.scores.recommendation * 3.6}deg 360deg)`,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                boxShadow: `0 0 40px ${toneColor(scoreTone)}44`,
              }}
            >
              <div
                style={{
                  width: 130,
                  height: 130,
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
                  style={{
                    fontSize: 46,
                    fontWeight: 900,
                    color: toneColor(scoreTone),
                    lineHeight: 1,
                    letterSpacing: -2,
                  }}
                >
                  {item.scores.recommendation}
                </strong>
                <span style={{ fontSize: 12, color: T.textMuted }}>
                  امتیاز نهایی
                </span>
              </div>
            </div>
            <small
              style={{
                fontSize: 12,
                color: T.textSec,
                padding: "6px 14px",
                borderRadius: 20,
                background: T.raised,
                border: `1px solid ${T.border}`,
              }}
            >
              اطمینان{" "}
              <strong style={{ color: T.white }}>
                {item.scores.confidence}٪
              </strong>
            </small>
          </div>
        </section>

        {/* ═══ VALUATION STRIP ═══ */}
        <section
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
            gap: 14,
            marginBottom: 24,
          }}
        >
          {[
            {
              label: "قیمت درخواستی",
              value: formatMoney(item.asking.askingPrice),
              small: `${formatMoney(item.asking.askingPricePerMeter)} / متر`,
              tone: "default",
            },
            {
              label: "پیش‌بینی ترکیبی",
              value: formatMoney(item.valuation.predictedPrice),
              small: `${formatMoney(item.valuation.predictedPricePerMeter)} / متر`,
              tone: "primary",
            },
            {
              label: "بازه پیش‌بینی",
              value: formatMoney(item.valuation.predictionRangeLow),
              small: `تا ${formatMoney(item.valuation.predictionRangeHigh)}`,
              tone: "secondary",
            },
            {
              label: "زیر معیار",
              value: formatPercent(item.valuation.blendedDiscountPct, true),
              small: `${formatMoney(item.valuation.askingVsPrediction)} فاصله پیش‌بینی`,
              tone: item.valuation.blendedDiscountPct >= 0 ? "good" : "bad",
              highlight: true,
            },
          ].map((card, i) => {
            const toneStyles = {
              default: { border: T.border, color: T.white, bg: T.surface },
              primary: {
                border: T.primaryBg2,
                color: T.primaryLight,
                bg: T.surface,
              },
              secondary: {
                border: T.secondaryBg2,
                color: T.secondary,
                bg: T.surface,
              },
              good: { border: T.greenBg2, color: T.green, bg: T.surface },
              bad: { border: T.redBg2, color: T.red, bg: T.surface },
            };
            const s = toneStyles[card.tone];
            return (
              <article
                key={i}
                style={{
                  background: s.bg,
                  border: `1px solid ${s.border}`,
                  borderRadius: T.radius,
                  padding: 18,
                  boxShadow: T.shadow,
                  transition: "transform .2s",
                  animation: "owjSlideUp .5s ease both",
                  animationDelay: `${i * 0.05}s`,
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.transform = "translateY(-3px)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.transform = "translateY(0)";
                }}
              >
                <span
                  style={{
                    fontSize: 12,
                    color: T.textMuted,
                    display: "block",
                    marginBottom: 8,
                    fontWeight: 600,
                  }}
                >
                  {card.label}
                </span>
                <strong
                  style={{
                    fontSize: 20,
                    fontWeight: 900,
                    color: s.color,
                    display: "block",
                    marginBottom: 4,
                    letterSpacing: -0.5,
                  }}
                >
                  {card.value}
                </strong>
                <small style={{ fontSize: 11, color: T.textSec }}>
                  {card.small}
                </small>
              </article>
            );
          })}
        </section>

        {/* ═══ DETAIL GRID ═══ */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
            gap: 20,
            marginBottom: 24,
          }}
        >
          <ScoreFactors item={item} />
          <PropertyFacts item={item} />

          {/* Evidence Quality */}
          <Panel>
            <CompactHeading
              kicker="کیفیت شواهد"
              title={`چرا اطمینان ${item.scores.confidence} است`}
            />
            <dl
              style={{
                display: "flex",
                flexDirection: "column",
                gap: 2,
                margin: 0,
              }}
            >
              {[
                [
                  "خطای میانه ترکیبی cross-fit",
                  formatPercent(
                    data.valuationValidation.medianAbsolutePercentageError,
                  ),
                ],
                [
                  "R² اعتبارسنجی ترکیبی (log)",
                  data.valuationValidation.rSquaredLog,
                ],
                [
                  "خطای میانه مدل پایه",
                  formatPercent(item.evidence.modelValidationMedianErrorPct),
                ],
                ["رکوردهای نزدیک", formatNumber(item.evidence.comparableCount)],
                [
                  "میانگین تطابق مقایسه",
                  formatPercent(item.evidence.averageComparableSimilarity),
                ],
                [
                  "پراکندگی قیمت تعدیل‌شده",
                  formatPercent(item.evidence.adjustedComparableDispersionPct),
                ],
                [
                  "قدرت شواهد مقایسه",
                  formatPercent(item.evidence.comparableEvidenceStrength),
                ],
                [
                  "حذف داده‌های پرت",
                  formatNumber(item.evidence.removedComparableOutliers),
                ],
                [
                  "ترکیب نزدیکی/مدل",
                  `${formatPercent(item.valuation.nearbyBlendWeightPct)} / ${formatPercent(100 - item.valuation.nearbyBlendWeightPct)}`,
                ],
              ].map(([dt, dd]) => (
                <div
                  key={dt}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    padding: "10px 0",
                    borderBottom: `1px solid ${T.border}`,
                    gap: 12,
                  }}
                >
                  <dt style={{ fontSize: 12, color: T.textSec }}>{dt}</dt>
                  <dd
                    style={{
                      fontSize: 13,
                      fontWeight: 800,
                      color: T.white,
                      margin: 0,
                    }}
                  >
                    {dd}
                  </dd>
                </div>
              ))}
            </dl>
          </Panel>

          {/* Interpretation */}
          <Panel>
            <CompactHeading kicker="تفسیر" title="آنچه ماشین مشاهده کرد" />
            <ul
              style={{
                listStyle: "none",
                padding: 0,
                margin: "0 0 16px",
                display: "flex",
                flexDirection: "column",
                gap: 10,
              }}
            >
              {item.explanations.map((text) => (
                <li
                  key={text}
                  style={{
                    display: "flex",
                    alignItems: "flex-start",
                    gap: 10,
                    padding: "10px 12px",
                    background: T.secondaryBg,
                    border: `1px solid ${T.secondaryBg2}`,
                    borderRadius: T.radiusXs,
                    fontSize: 13,
                    color: T.text,
                    lineHeight: 1.6,
                  }}
                >
                  <span
                    style={{ color: T.secondary, marginTop: 2, flexShrink: 0 }}
                  >
                    <Icon name="check" size={16} />
                  </span>
                  <span>{text}</span>
                </li>
              ))}
            </ul>

            {item.warnings.length > 0 && (
              <div
                style={{
                  display: "flex",
                  gap: 12,
                  padding: 14,
                  background: T.orangeBg,
                  border: `1px solid ${T.orangeBg2}`,
                  borderRadius: T.radiusSm,
                  marginBottom: 16,
                  alignItems: "flex-start",
                }}
              >
                <span style={{ color: T.orange, flexShrink: 0, marginTop: 2 }}>
                  <Icon name="alert" size={18} />
                </span>
                <div>
                  <strong
                    style={{
                      display: "block",
                      color: T.orange,
                      fontWeight: 800,
                      fontSize: 13,
                      marginBottom: 4,
                    }}
                  >
                    هشدارها
                  </strong>
                  <span style={{ fontSize: 12, color: T.textSec }}>
                    {item.warnings.join(" · ")}
                  </span>
                </div>
              </div>
            )}

            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 12,
                padding: 14,
                background: T.raised,
                borderRadius: T.radiusSm,
                border: `1px solid ${T.border}`,
              }}
            >
              <strong
                style={{
                  fontSize: 24,
                  fontWeight: 900,
                  color: item.cleaning.imputationCount > 0 ? T.orange : T.green,
                  minWidth: 32,
                }}
              >
                {item.cleaning.imputationCount}
              </strong>
              <div>
                <span
                  style={{
                    display: "block",
                    fontSize: 12,
                    fontWeight: 700,
                    color: T.text,
                    marginBottom: 2,
                  }}
                >
                  فیلد imputeشده
                </span>
                <small style={{ fontSize: 11, color: T.textMuted }}>
                  {item.evidence.imputedFields.join("، ") ||
                    "هیچ فیلدی برای این آگهی impute نشد."}
                </small>
              </div>
            </div>
          </Panel>

          <Comparables item={item} />
        </div>

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
              داده جزئیات JSON
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
