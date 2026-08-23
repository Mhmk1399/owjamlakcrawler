import { useCallback, useEffect, useMemo, useState } from "react";

/* ──────────────────────── Formatters (unchanged logic) ──────────────────────── */
const number = new Intl.NumberFormat("fa-IR");
const decimal = new Intl.NumberFormat("fa-IR", { maximumFractionDigits: 1 });
const dateTime = new Intl.DateTimeFormat("fa-IR", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "Asia/Tehran",
});

function formatNumber(value) {
  return Number.isFinite(value) ? number.format(value) : "—";
}
function formatPercent(value) {
  return Number.isFinite(value) ? `${decimal.format(value)}٪` : "—";
}
function formatSignedPercent(value) {
  if (!Number.isFinite(value)) return "—";
  return `${value > 0 ? "+" : ""}${decimal.format(value)}٪`;
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
  return hours ? `${hours} ساعت و ${remainder} دقیقه` : `${minutes} دقیقه`;
}
function formatMoney(value) {
  if (!Number.isFinite(value)) return "—";
  if (value >= 1_000_000_000)
    return `${decimal.format(value / 1_000_000_000)} میلیارد تومان`;
  if (value >= 1_000_000)
    return `${decimal.format(value / 1_000_000)} میلیون تومان`;
  return `${formatNumber(value)} تومان`;
}
function clamp(value) {
  return Math.max(0, Math.min(100, Number(value) || 0));
}

/* ──────────────────────── Design Tokens ──────────────────────── */
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
  surfaceGlass: "rgba(22,20,31,0.75)",
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
  orange: "#fb923c",
  orangeBg: "rgba(251,146,60,0.10)",
  red: "#f87171",
  redBg: "rgba(248,113,113,0.10)",

  radius: 14,
  radiusSm: 10,
  radiusXs: 7,

  shadow: "0 4px 24px rgba(0,0,0,0.25), 0 1px 4px rgba(0,0,0,0.15)",
  shadowLg: "0 8px 40px rgba(0,0,0,0.35)",
  glowPrimary: `0 0 40px rgba(102,48,141,0.15)`,
  glowSecondary: `0 0 40px rgba(1,174,155,0.12)`,
};

/* ──────────────────────── Global CSS Injection ──────────────────────── */
const GLOBAL_CSS = `
@import url('https://fonts.googleapis.com/css2?family=Vazirmatn:wght@300;400;500;600;700;800;900&display=swap');

*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

:root {
  --owj-primary: ${T.primary};
  --owj-secondary: ${T.secondary};
  font-family: 'Vazirmatn', Tahoma, sans-serif;
}

body { background: ${T.bg}; }

::-webkit-scrollbar { width: 5px; height: 5px; }
::-webkit-scrollbar-track { background: transparent; }
::-webkit-scrollbar-thumb { background: ${T.borderLight}; border-radius: 99px; }
::-webkit-scrollbar-thumb:hover { background: ${T.textMuted}; }

input::placeholder { color: ${T.textMuted}; font-family: inherit; }

@keyframes owjPulse {
  0%, 100% { opacity: 1; transform: scale(1); }
  50% { opacity: .45; transform: scale(1.15); }
}
@keyframes owjFloat {
  0%, 100% { transform: translateY(0); }
  50% { transform: translateY(-6px); }
}
@keyframes owjDot {
  0%, 80%, 100% { transform: scale(.5); opacity: .25; }
  40% { transform: scale(1); opacity: 1; }
}
@keyframes owjShimmer {
  0% { background-position: -200% 0; }
  100% { background-position: 200% 0; }
}
@keyframes owjSlideUp {
  from { opacity: 0; transform: translateY(16px); }
  to { opacity: 1; transform: translateY(0); }
}
@keyframes owjFadeIn {
  from { opacity: 0; }
  to { opacity: 1; }
}
`;

let injected = false;
function injectGlobalCSS() {
  if (injected) return;
  injected = true;
  const el = document.createElement("style");
  el.textContent = GLOBAL_CSS;
  document.head.appendChild(el);
}

/* ──────────────────────── Icon (unchanged) ──────────────────────── */
function Icon({ name, size = 20 }) {
  const paths = {
    activity: (
      <>
        <path d="M3 12h4l2.3-7 4.4 14 2.3-7h5" />
      </>
    ),
    alert: (
      <>
        <path d="M12 3 2.7 19h18.6L12 3Z" />
        <path d="M12 9v4" />
        <path d="M12 16.5h.01" />
      </>
    ),
    area: (
      <>
        <path d="M4 5h16v14H4z" />
        <path d="m4 14 4-4 4 3 4-5 4 4" />
      </>
    ),
    check: (
      <>
        <path d="m5 12 4 4L19 6" />
      </>
    ),
    chevron: (
      <>
        <path d="m9 18 6-6-6-6" />
      </>
    ),
    database: (
      <>
        <ellipse cx="12" cy="5" rx="8" ry="3" />
        <path d="M4 5v7c0 1.7 3.6 3 8 3s8-1.3 8-3V5" />
        <path d="M4 12v7c0 1.7 3.6 3 8 3s8-1.3 8-3v-7" />
      </>
    ),
    location: (
      <>
        <path d="M20 10c0 5-8 11-8 11S4 15 4 10a8 8 0 1 1 16 0Z" />
        <circle cx="12" cy="10" r="2.5" />
      </>
    ),
    refresh: (
      <>
        <path d="M20 7v5h-5" />
        <path d="M4 17v-5h5" />
        <path d="M6.1 8a7 7 0 0 1 11.7-2L20 8" />
        <path d="m4 16 2.2 2a7 7 0 0 0 11.7-2" />
      </>
    ),
    search: (
      <>
        <circle cx="11" cy="11" r="7" />
        <path d="m20 20-4-4" />
      </>
    ),
    spark: (
      <>
        <path d="m12 3 1.4 4.6L18 9l-4.6 1.4L12 15l-1.4-4.6L6 9l4.6-1.4L12 3Z" />
        <path d="m19 15 .7 2.3L22 18l-2.3.7L19 21l-.7-2.3L16 18l2.3-.7L19 15Z" />
      </>
    ),
    trend: (
      <>
        <path d="m3 17 6-6 4 4 8-9" />
        <path d="M15 6h6v6" />
      </>
    ),
    building: (
      <>
        <path d="M3 21h18" />
        <path d="M5 21V7l8-4v18" />
        <path d="M19 21V11l-6-4" />
        <path d="M9 9v.01M9 12v.01M9 15v.01M9 18v.01" />
      </>
    ),
  };
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <g
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        {paths[name] || paths.activity}
      </g>
    </svg>
  );
}

/* ──────────────────────── Progress ──────────────────────── */
function Progress({ value, tone = "cyan", label }) {
  const toneMap = {
    cyan: `linear-gradient(90deg, ${T.secondaryDark}, ${T.secondary}, ${T.secondaryLight})`,
    green: `linear-gradient(90deg, #059669, ${T.green})`,
    orange: `linear-gradient(90deg, #ea580c, ${T.orange})`,
    violet: `linear-gradient(90deg, ${T.primary}, ${T.primaryPale})`,
  };
  return (
    <div
      style={{
        height: 4,
        background: T.border,
        borderRadius: 99,
        overflow: "hidden",
        width: "100%",
      }}
      aria-label={label}
    >
      <span
        style={{
          display: "block",
          height: "100%",
          width: `${clamp(value)}%`,
          borderRadius: 99,
          background: toneMap[tone] || toneMap.cyan,
          transition: "width .7s cubic-bezier(.22,1,.36,1)",
          boxShadow:
            tone === "cyan"
              ? T.glowSecondary
              : tone === "violet"
                ? T.glowPrimary
                : "none",
        }}
      />
    </div>
  );
}

/* ──────────────────────── KpiCard ──────────────────────── */
function KpiCard({ eyebrow, value, detail, progress, tone, icon }) {
  const accents = {
    cyan: { c: T.secondary, bg: T.secondaryBg, glow: T.glowSecondary },
    green: { c: T.green, bg: T.greenBg, glow: "none" },
    orange: { c: T.orange, bg: T.orangeBg, glow: "none" },
    violet: { c: T.primary, bg: T.primaryBg, glow: T.glowPrimary },
  };
  const a = accents[tone] || accents.cyan;

  return (
    <article
      style={{
        background: T.surface,
        border: `1px solid ${T.border}`,
        borderTop: `3px solid ${a.c}`,
        borderRadius: T.radius,
        padding: "22px 22px 18px",
        display: "flex",
        flexDirection: "column",
        gap: 10,
        transition: "transform .2s, box-shadow .2s",
        cursor: "default",
        boxShadow: T.shadow,
        animation: "owjSlideUp .5s ease both",
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
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
        }}
      >
        <span
          style={{
            fontSize: 11,
            fontWeight: 700,
            color: T.textMuted,
            letterSpacing: 0.5,
          }}
        >
          {eyebrow}
        </span>
        <span
          style={{
            width: 38,
            height: 38,
            borderRadius: T.radiusSm,
            background: a.bg,
            color: a.c,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
          }}
        >
          <Icon name={icon} />
        </span>
      </div>
      <strong
        style={{
          fontSize: 30,
          fontWeight: 900,
          color: T.white,
          lineHeight: 1.1,
          letterSpacing: -1,
        }}
      >
        {value}
      </strong>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          fontSize: 12,
          color: T.textSec,
          gap: 6,
        }}
      >
        <span>{detail}</span>
        {Number.isFinite(progress) && (
          <span style={{ fontWeight: 600 }}>{formatPercent(progress)}</span>
        )}
      </div>
      {Number.isFinite(progress) && (
        <Progress
          value={progress}
          tone={tone}
          label={`${eyebrow}: ${progress}%`}
        />
      )}
    </article>
  );
}

/* ──────────────────────── SectionHeading ──────────────────────── */
function SectionHeading({ kicker, title, description, aside }) {
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "flex-start",
        marginBottom: 22,
        gap: 16,
        flexWrap: "wrap",
      }}
    >
      <div style={{ flex: 1, minWidth: 260 }}>
        <span
          style={{
            fontSize: 11,
            fontWeight: 800,
            color: T.secondary,
            letterSpacing: 1.2,
            marginBottom: 6,
            display: "block",
          }}
        >
          {kicker}
        </span>
        <h2
          style={{
            fontSize: 20,
            fontWeight: 800,
            color: T.white,
            margin: "0 0 6px",
            lineHeight: 1.35,
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
              lineHeight: 1.65,
              maxWidth: 580,
            }}
          >
            {description}
          </p>
        )}
      </div>
      {aside}
    </div>
  );
}

/* ──────────────────────── AttentionCard ──────────────────────── */
function AttentionCard({ tone, icon, title, value, text }) {
  const tones = {
    good: { c: T.green, bg: T.greenBg, border: T.green },
    warn: { c: T.orange, bg: T.orangeBg, border: T.orange },
    bad: { c: T.red, bg: T.redBg, border: T.red },
  };
  const a = tones[tone] || tones.good;

  return (
    <article
      style={{
        background: T.surface,
        border: `1px solid ${T.border}`,
        borderRight: `4px solid ${a.border}`,
        borderRadius: T.radius,
        padding: "18px 20px",
        display: "flex",
        gap: 14,
        alignItems: "flex-start",
        boxShadow: T.shadow,
        transition: "transform .2s",
        animation: "owjSlideUp .5s ease both",
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.transform = "translateY(-2px)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.transform = "translateY(0)";
      }}
    >
      <span
        style={{
          width: 42,
          height: 42,
          borderRadius: T.radiusSm,
          background: a.bg,
          color: a.c,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
        }}
      >
        <Icon name={icon} />
      </span>
      <div>
        <span
          style={{
            fontSize: 26,
            fontWeight: 900,
            color: T.white,
            lineHeight: 1,
            display: "block",
          }}
        >
          {value}
        </span>
        <h3
          style={{
            fontSize: 13,
            fontWeight: 700,
            color: T.text,
            margin: "6px 0 4px",
          }}
        >
          {title}
        </h3>
        <p
          style={{
            fontSize: 12,
            color: T.textMuted,
            margin: 0,
            lineHeight: 1.55,
          }}
        >
          {text}
        </p>
      </div>
    </article>
  );
}

/* ──────────────────────── LocationQuality ──────────────────────── */
function LocationQuality({ data }) {
  const available = data.available || 0;
  const exactShare = available ? (data.exact / available) * 100 : 0;
  const approximateShare = available ? (data.approximate / available) * 100 : 0;

  return (
    <article
      style={{
        background: T.surface,
        border: `1px solid ${T.border}`,
        borderRadius: T.radius,
        padding: 28,
        boxShadow: T.shadow,
      }}
    >
      <SectionHeading
        kicker="سیگنال موقعیت"
        title="اطمینان مختصات"
        description="پین‌های دقیق بالاترین ارزش را دارند. پین‌های تقریبی در شعاع ۵۰۰ متری حریم خصوصی کار می‌کنند."
      />
      <div
        style={{
          display: "flex",
          gap: 32,
          alignItems: "center",
          marginBottom: 24,
          flexWrap: "wrap",
        }}
      >
        {/* Donut */}
        <div
          style={{
            width: 150,
            height: 150,
            borderRadius: "50%",
            background: `conic-gradient(${T.secondary} 0 ${exactShare}%, ${T.orange} ${exactShare}% ${exactShare + approximateShare}%, ${T.raised} ${exactShare + approximateShare}% 100%)`,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
            boxShadow: T.glowSecondary,
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
            <strong style={{ fontSize: 20, fontWeight: 900, color: T.white }}>
              {formatPercent(data.coverage)}
            </strong>
            <span style={{ fontSize: 11, color: T.textMuted }}>پوشش</span>
          </div>
        </div>
        {/* Legend */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 14,
            flex: 1,
            minWidth: 140,
          }}
        >
          {[
            {
              type: "exact",
              label: "دقیق",
              color: T.secondary,
              val: data.exact,
            },
            {
              type: "approx",
              label: "تقریبی",
              color: T.orange,
              val: data.approximate,
            },
            {
              type: "missing",
              label: "ناموجود",
              color: T.raised,
              val: data.missing,
            },
          ].map((item) => (
            <div
              key={item.type}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                fontSize: 13,
              }}
            >
              <span
                style={{
                  width: 10,
                  height: 10,
                  borderRadius: "50%",
                  background: item.color,
                  flexShrink: 0,
                }}
              />
              <span style={{ flex: 1, color: T.textSec }}>{item.label}</span>
              <strong style={{ fontWeight: 800, color: T.white }}>
                {formatNumber(item.val)}
              </strong>
            </div>
          ))}
        </div>
      </div>
      <div
        style={{
          background: T.raised,
          borderRadius: T.radiusSm,
          padding: 16,
          display: "flex",
          flexDirection: "column",
          gap: 8,
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <span style={{ fontSize: 13, color: T.textSec }}>
            تطابق منطقه درخواستی با جزئیات
          </span>
          <strong style={{ fontSize: 17, fontWeight: 800, color: T.secondary }}>
            {formatPercent(data.areaMatchRate)}
          </strong>
        </div>
        <Progress
          value={data.areaMatchRate}
          tone="cyan"
          label="نرخ تطابق منطقه"
        />
        <small style={{ fontSize: 11, color: T.textMuted }}>
          {formatNumber(data.areaMatches)} از {formatNumber(data.areaChecks)}{" "}
          رکورد بررسی‌شده
        </small>
      </div>
    </article>
  );
}

/* ──────────────────────── ModelReadiness ──────────────────────── */
function ModelReadiness({ data }) {
  const global = data.global || {};
  const globalProgress = global.minimumRequired
    ? Math.min(100, ((global.count || 0) / global.minimumRequired) * 100)
    : 0;
  const areaProgress = data.areaModelCount
    ? (data.readyAreaModelCount / data.areaModelCount) * 100
    : 0;

  return (
    <article
      style={{
        background: T.surface,
        border: `1px solid ${T.border}`,
        borderRadius: T.radius,
        padding: 28,
        boxShadow: T.shadow,
      }}
    >
      <SectionHeading
        kicker="رگرسیون"
        title="آمادگی مدل"
        description="آمادگی به معنای نمونه‌های کافی برای اجراست؛ جایگزین اعتبارسنجی holdout نیست."
      />
      {/* Status badge */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 14,
          padding: "14px 18px",
          background: T.primaryBg,
          border: `1px solid ${T.primaryBg2}`,
          borderRadius: T.radiusSm,
          marginBottom: 22,
        }}
      >
        <span
          style={{
            width: 12,
            height: 12,
            borderRadius: "50%",
            background: T.primary,
            boxShadow: `0 0 0 4px ${T.primaryBg2}`,
            animation: "owjPulse 2s infinite",
            flexShrink: 0,
          }}
        />
        <div>
          <strong
            style={{
              fontWeight: 800,
              color: T.white,
              fontSize: 14,
              display: "block",
            }}
          >
            {global.status === "experimental-ready"
              ? "مدل آزمایشی فعال"
              : "در حال جمع‌آوری نمونه"}
          </strong>
          <span style={{ fontSize: 12, color: T.textSec }}>{data.scope}</span>
        </div>
      </div>
      {/* Global */}
      <div style={{ marginBottom: 18 }}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            marginBottom: 6,
            fontSize: 13,
          }}
        >
          <span style={{ color: T.textSec }}>مشاهدات سراسری</span>
          <strong style={{ fontWeight: 800, color: T.white }}>
            {formatNumber(global.count)}
          </strong>
        </div>
        <Progress
          value={globalProgress}
          tone="orange"
          label="آمادگی نمونه مدل سراسری"
        />
        <small
          style={{
            fontSize: 11,
            color: T.textMuted,
            marginTop: 4,
            display: "block",
          }}
        >
          حداقل: {formatNumber(global.minimumRequired)}
        </small>
      </div>
      {/* Spatial */}
      <div style={{ marginBottom: 18 }}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            marginBottom: 6,
            fontSize: 13,
          }}
        >
          <span style={{ color: T.textSec }}>مدل‌های مکانی آماده</span>
          <strong style={{ fontWeight: 800, color: T.white }}>
            {formatNumber(data.readyAreaModelCount)} /{" "}
            {formatNumber(data.areaModelCount)}
          </strong>
        </div>
        <Progress value={areaProgress} tone="cyan" label="آمادگی مدل مکانی" />
        <small
          style={{
            fontSize: 11,
            color: T.textMuted,
            marginTop: 4,
            display: "block",
          }}
        >
          {formatNumber(data.publishedSpatialAreaCount)} از{" "}
          {formatNumber(data.spatialAreaCount)} سلول مکانی منتشرشده
        </small>
      </div>
      {/* Warning */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          fontSize: 12,
          color: T.orange,
          padding: "12px 14px",
          background: T.orangeBg,
          borderRadius: T.radiusXs,
        }}
      >
        <Icon name="alert" size={17} />
        <span>
          امتیازها تا زمان گذر از اعتبارسنجی holdout زمانی، آزمایشی هستند.
        </span>
      </div>
    </article>
  );
}

/* ──────────────────────── AreaCoverage ──────────────────────── */
function AreaCoverage({ data }) {
  const [query, setQuery] = useState("");
  const [shortfallsOnly, setShortfallsOnly] = useState(false);
  const [visible, setVisible] = useState(20);
  const filtered = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase("fa");
    return [...(data.areas || [])]
      .filter((area) => !shortfallsOnly || area.shortfall > 0)
      .filter(
        (area) =>
          !needle ||
          `${area.name} ${area.slug}`.toLocaleLowerCase("fa").includes(needle),
      )
      .sort(
        (left, right) =>
          right.shortfall - left.shortfall ||
          left.name.localeCompare(right.name, "fa"),
      );
  }, [data.areas, query, shortfallsOnly]);

  useEffect(() => setVisible(20), [query, shortfallsOnly]);

  const panelStyle = {
    background: T.surface,
    border: `1px solid ${T.border}`,
    borderRadius: T.radius,
    padding: 28,
    marginBottom: 24,
    boxShadow: T.shadow,
  };

  return (
    <section style={panelStyle}>
      <SectionHeading
        kicker="صف ۴۵۳ منطقه"
        title="پوشش کشف مناطق"
        description="کمبود یعنی دیوار کمتر از ده آگهی آپارتمان درخواستی را برگردانده."
        aside={
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "flex-end",
              gap: 2,
            }}
          >
            <strong
              style={{
                fontSize: 30,
                fontWeight: 900,
                color: T.secondary,
                lineHeight: 1,
              }}
            >
              {formatNumber(data.complete)}
            </strong>
            <span style={{ fontSize: 12, color: T.textMuted }}>
              منطقه در هدف
            </span>
          </div>
        }
      />
      {/* Tools */}
      <div
        style={{
          display: "flex",
          gap: 12,
          alignItems: "center",
          marginBottom: 16,
          flexWrap: "wrap",
        }}
      >
        <label
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            padding: "9px 14px",
            borderRadius: T.radiusSm,
            background: T.raised,
            border: `1px solid ${T.border}`,
            flex: 1,
            minWidth: 200,
            color: T.textMuted,
            transition: "border-color .2s",
          }}
        >
          <Icon name="search" size={18} />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="جستجوی منطقه یا slug"
            style={{
              border: "none",
              background: "none",
              color: T.text,
              fontSize: 13,
              outline: "none",
              width: "100%",
              fontFamily: "inherit",
              direction: "rtl",
            }}
          />
        </label>
        <label
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            fontSize: 13,
            color: T.textSec,
            cursor: "pointer",
            whiteSpace: "nowrap",
          }}
        >
          <input
            type="checkbox"
            checked={shortfallsOnly}
            onChange={(e) => setShortfallsOnly(e.target.checked)}
            style={{
              width: 16,
              height: 16,
              accentColor: T.primary,
              cursor: "pointer",
            }}
          />
          <span>فقط کمبودها</span>
        </label>
        <span
          style={{ fontSize: 12, color: T.textMuted, whiteSpace: "nowrap" }}
        >
          {formatNumber(filtered.length)} نتیجه
        </span>
      </div>
      {/* Table */}
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
              {["منطقه", "یافت‌شده", "هدف", "کمبود", "تکراری", "وضعیت"].map(
                (h) => (
                  <th
                    key={h}
                    style={{
                      padding: "12px 16px",
                      fontSize: 11,
                      fontWeight: 700,
                      color: T.textMuted,
                      background: T.raised,
                      borderBottom: `1px solid ${T.border}`,
                      textAlign: "right",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {h}
                  </th>
                ),
              )}
            </tr>
          </thead>
          <tbody>
            {filtered.slice(0, visible).map((area) => {
              const tdBase = {
                padding: "12px 16px",
                borderBottom: `1px solid ${T.border}`,
                color: T.textSec,
                whiteSpace: "nowrap",
              };
              return (
                <tr
                  key={area.id ?? area.slug}
                  style={{ transition: "background .15s" }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = T.surfaceHover;
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = "transparent";
                  }}
                >
                  <td style={tdBase}>
                    <a
                      href={area.url || "#"}
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
                        style={{ fontWeight: 700, color: T.text, fontSize: 13 }}
                      >
                        {area.name}
                      </strong>
                      <span
                        style={{
                          fontSize: 11,
                          color: T.textMuted,
                          fontFamily: "monospace",
                          direction: "ltr",
                          textAlign: "right",
                        }}
                      >
                        {area.slug}
                      </span>
                    </a>
                  </td>
                  <td style={tdBase}>{formatNumber(area.discovered)}</td>
                  <td style={tdBase}>{formatNumber(area.target)}</td>
                  <td
                    style={{
                      ...tdBase,
                      color: area.shortfall ? T.orange : T.textSec,
                      fontWeight: area.shortfall ? 700 : 400,
                    }}
                  >
                    {formatNumber(area.shortfall)}
                  </td>
                  <td style={tdBase}>{formatNumber(area.duplicates)}</td>
                  <td style={tdBase}>
                    <span
                      style={{
                        display: "inline-flex",
                        padding: "3px 12px",
                        borderRadius: 6,
                        fontSize: 11,
                        fontWeight: 700,
                        background: area.shortfall ? T.orangeBg : T.greenBg,
                        color: area.shortfall ? T.orange : T.green,
                      }}
                    >
                      {area.shortfall ? "بررسی" : "کامل"}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {visible < filtered.length && (
        <button
          style={{
            display: "block",
            width: "100%",
            padding: 12,
            marginTop: 16,
            borderRadius: T.radiusSm,
            border: `1px solid ${T.borderLight}`,
            background: "transparent",
            color: T.textSec,
            fontSize: 13,
            fontWeight: 600,
            cursor: "pointer",
            fontFamily: "inherit",
            transition: "all .2s",
          }}
          onClick={() => setVisible((v) => v + 20)}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = T.raised;
            e.currentTarget.style.color = T.white;
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = "transparent";
            e.currentTarget.style.color = T.textSec;
          }}
        >
          نمایش ۲۰ مورد بیشتر
        </button>
      )}
    </section>
  );
}

/* ──────────────────────── Score Factors (unchanged data) ──────────────────────── */
const SCORE_FACTORS = [
  {
    key: "dealValue",
    label: "ارزش معامله",
    short: "معامله",
    weight: null,
    description: "شواهد ارزش قبل از دروازه اطمینان",
  },
  {
    key: "modelValue",
    label: "ارزش مدل",
    short: "مدل",
    weight: 0.45,
    description: "صدک تخفیف نسبت به مدل مکانی خارج از چین",
  },
  {
    key: "nearbyValue",
    label: "ارزش همسایگی",
    short: "همسایگی",
    weight: 0.4,
    description: "صدک تخفیف نسبت به مقایسه‌های نزدیک",
  },
  {
    key: "localPosition",
    label: "موقعیت محلی",
    short: "موقعیت",
    weight: 0.15,
    description: "قیمت هر متر مربع در مجموعه مقایسه محلی",
  },
  {
    key: "confidence",
    label: "اطمینان",
    short: "اطمینان",
    weight: null,
    description: "اعتبارسنجی، مقایسه، مختصات و کیفیت داده",
  },
  {
    key: "dataQuality",
    label: "کیفیت داده",
    short: "کیفیت",
    weight: null,
    description: "جریمه برای فیلدهای منبع impute‌شده",
  },
  {
    key: "propertyQuality",
    label: "کیفیت ملک",
    short: "ملک",
    weight: null,
    description: "سن، طبقه، تراکم واحد و امکانات",
  },
  {
    key: "risk",
    label: "ریسک",
    short: "ریسک",
    weight: null,
    inverse: true,
    description: "بالاتر یعنی قیمت غیرعادی یا شواهد ناقص",
  },
];

function scoreMetric(item, key) {
  if (key === "score" || key === "recommendation")
    return item.scores?.recommendation ?? item.score;
  if (key === "modelDiscountPct")
    return (
      item.valuation?.modelDiscountPct ?? item.prediction?.askingVsPredictionPct
    );
  if (key === "nearbyDiscountPct")
    return (
      item.valuation?.nearbyDiscountPct ?? item.prediction?.askingVsNearbyPct
    );
  return item.scores?.[key] ?? item.components?.[key];
}

/* ──────────────────────── FactorScore ──────────────────────── */
function FactorScore({ value, weight, inverse = false }) {
  if (!Number.isFinite(value))
    return <span style={{ color: T.textMuted, fontSize: 13 }}>—</span>;
  const interpreted = inverse ? 100 - value : value;
  const barColor =
    interpreted >= 75 ? T.green : interpreted >= 45 ? T.orange : T.red;

  return (
    <div
      style={{ display: "flex", flexDirection: "column", gap: 3, minWidth: 68 }}
      title={
        weight
          ? `${decimal.format(value * weight)} امتیاز وزنی`
          : `${value} امتیاز`
      }
    >
      <div style={{ display: "flex", alignItems: "baseline", gap: 4 }}>
        <strong style={{ fontWeight: 800, fontSize: 13, color: T.white }}>
          {formatNumber(value)}
        </strong>
        <small style={{ fontSize: 10, color: T.textMuted }}>
          {weight ? `+${decimal.format(value * weight)}` : "خام"}
        </small>
      </div>
      <span
        style={{
          height: 3,
          background: T.border,
          borderRadius: 4,
          overflow: "hidden",
        }}
      >
        <i
          style={{
            display: "block",
            height: "100%",
            width: `${clamp(value)}%`,
            borderRadius: 4,
            background: barColor,
            transition: "width .5s",
          }}
        />
      </span>
    </div>
  );
}

/* ──────────────────────── GapValue ──────────────────────── */
function GapValue({ value }) {
  const c = !Number.isFinite(value)
    ? T.textMuted
    : value >= 0
      ? T.green
      : T.red;
  return (
    <span
      style={{
        fontWeight: 800,
        fontSize: 13,
        color: c,
        direction: "ltr",
        display: "inline-block",
      }}
    >
      {formatSignedPercent(value)}
    </span>
  );
}

/* ──────────────────────── Recommendations ──────────────────────── */
function Recommendations({ data }) {
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState({
    key: "recommendation",
    direction: "desc",
  });
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
        const response = await fetch(`/scores?${parameters}`, {
          signal: controller.signal,
        });
        if (!response.ok)
          throw new Error(`Score API returned HTTP ${response.status}`);
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
      .filter(
        (item) =>
          !needle ||
          `${item.title} ${item.token} ${item.neighborhood}`
            .toLocaleLowerCase("fa")
            .includes(needle),
      )
      .sort((left, right) => {
        if (sort.key === "listing") {
          const result = (left.title || "").localeCompare(
            right.title || "",
            "fa",
          );
          return sort.direction === "asc" ? result : -result;
        }
        const lv = scoreMetric(left, sort.key);
        const rv = scoreMetric(right, sort.key);
        if (!Number.isFinite(lv)) return 1;
        if (!Number.isFinite(rv)) return -1;
        return sort.direction === "asc" ? lv - rv : rv - lv;
      });
  }, [data.top, pipelineAvailable, query, remoteRows, sort]);

  async function loadMore() {
    if (!pipelineAvailable || tableLoading || rows.length >= filteredTotal)
      return;
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
      if (!response.ok)
        throw new Error(`Score API returned HTTP ${response.status}`);
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
      direction:
        current.key === key && current.direction === "desc" ? "asc" : "desc",
    }));
  }

  function SortHeading({ column, children, title }) {
    const active = sort.key === column;
    return (
      <button
        onClick={() => changeSort(column)}
        title={title}
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 3,
          background: "none",
          border: "none",
          color: active ? T.white : T.textMuted,
          fontWeight: active ? 800 : 600,
          fontSize: 11,
          cursor: "pointer",
          padding: 0,
          fontFamily: "inherit",
          whiteSpace: "nowrap",
        }}
      >
        <span>{children}</span>
        <i style={{ fontSize: 9, opacity: 0.6, fontStyle: "normal" }}>
          {active ? (sort.direction === "desc" ? "↓" : "↑") : "↕"}
        </i>
      </button>
    );
  }

  const panelStyle = {
    background: T.surface,
    border: `1px solid ${T.border}`,
    borderRadius: T.radius,
    padding: 28,
    marginBottom: 24,
    boxShadow: T.shadow,
  };
  const thStyle = {
    padding: "12px 14px",
    fontSize: 11,
    fontWeight: 700,
    color: T.textMuted,
    background: T.raised,
    borderBottom: `1px solid ${T.border}`,
    textAlign: "right",
    whiteSpace: "nowrap",
  };
  const tdStyle = {
    padding: "12px 14px",
    borderBottom: `1px solid ${T.border}`,
    color: T.textSec,
    whiteSpace: "nowrap",
    verticalAlign: "middle",
  };

  return (
    <section style={panelStyle}>
      <SectionHeading
        kicker="سیستم پیشنهاد"
        title="جزئیات امتیازدهی آگهی‌ها"
        description="مدل هدانیک cross-fit و مقایسه‌های تعدیل‌شده ارزش معامله را می‌سازند؛ دروازه‌های اطمینان و ریسک فقط امتیاز نهایی را کاهش می‌دهند."
        aside={
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "flex-end",
              gap: 2,
            }}
          >
            <strong
              style={{
                fontSize: 30,
                fontWeight: 900,
                color: T.primary,
                lineHeight: 1,
              }}
            >
              {formatNumber(
                data.summary?.scoreDistribution?.median ??
                  data.averageScore ??
                  0,
              )}
            </strong>
            <span style={{ fontSize: 12, color: T.textMuted }}>
              میانه امتیاز
            </span>
          </div>
        }
      />
      {/* Search */}
      <div
        style={{
          display: "flex",
          gap: 12,
          alignItems: "center",
          marginBottom: 16,
          flexWrap: "wrap",
        }}
      >
        <label
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            padding: "9px 14px",
            borderRadius: T.radiusSm,
            background: T.raised,
            border: `1px solid ${T.border}`,
            flex: 1,
            minWidth: 200,
            color: T.textMuted,
          }}
        >
          <Icon name="search" size={18} />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="جستجوی آگهی، توکن یا محله"
            style={{
              border: "none",
              background: "none",
              color: T.text,
              fontSize: 13,
              outline: "none",
              width: "100%",
              fontFamily: "inherit",
              direction: "rtl",
            }}
          />
        </label>
        <span
          style={{ fontSize: 12, color: T.textMuted, whiteSpace: "nowrap" }}
        >
          {tableLoading
            ? "در حال بروزرسانی…"
            : `${formatNumber(rows.length)} از ${formatNumber(filteredTotal)} آگهی`}
        </span>
      </div>
      {/* Table */}
      <div
        style={{
          overflowX: "auto",
          borderRadius: T.radiusSm,
          border: `1px solid ${T.border}`,
          marginBottom: 8,
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
              <th style={{ ...thStyle, minWidth: 220 }}>
                <SortHeading column="listing">آگهی</SortHeading>
              </th>
              <th style={thStyle}>
                <SortHeading
                  column="recommendation"
                  title="امتیاز نهایی تعدیل‌شده"
                >
                  نهایی
                </SortHeading>
              </th>
              {SCORE_FACTORS.map((f) => (
                <th
                  key={f.key}
                  style={thStyle}
                  title={`${f.description}${f.weight ? ` · وزن ${f.weight * 100}٪` : ""}`}
                >
                  <SortHeading column={f.key}>
                    {f.short}
                    {f.weight && (
                      <small
                        style={{
                          display: "block",
                          fontSize: 9,
                          opacity: 0.5,
                          fontWeight: 400,
                        }}
                      >
                        {f.weight * 100}٪
                      </small>
                    )}
                  </SortHeading>
                </th>
              ))}
              <th style={thStyle}>
                <SortHeading
                  column="modelDiscountPct"
                  title="مثبت = زیر قیمت مدل"
                >
                  تخفیف مدل
                </SortHeading>
              </th>
              <th style={thStyle}>
                <SortHeading
                  column="nearbyDiscountPct"
                  title="مثبت = زیر قیمت همسایگی"
                >
                  تخفیف نزدیک
                </SortHeading>
              </th>
              <th style={thStyle}>شواهد</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((item) => {
              const rec = scoreMetric(item, "recommendation");
              const level = rec >= 80 ? "high" : rec >= 60 ? "medium" : "low";
              const scoreColors = {
                high: { bg: T.greenBg, c: T.green, b: "rgba(52,211,153,.25)" },
                medium: {
                  bg: T.orangeBg,
                  c: T.orange,
                  b: "rgba(251,146,60,.25)",
                },
                low: { bg: T.redBg, c: T.red, b: "rgba(248,113,113,.25)" },
              };
              const sc = scoreColors[level];
              return (
                <tr
                  key={item.token}
                  style={{ transition: "background .15s" }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = T.surfaceHover;
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = "transparent";
                  }}
                >
                  <td style={{ ...tdStyle, minWidth: 220 }}>
                    <a
                      href={`/listing/${encodeURIComponent(item.token)}`}
                      style={{
                        textDecoration: "none",
                        display: "flex",
                        flexDirection: "column",
                        gap: 2,
                      }}
                    >
                      <strong
                        dir="auto"
                        style={{ fontWeight: 700, color: T.text, fontSize: 13 }}
                      >
                        {item.title || item.token}
                      </strong>
                      <span
                        dir="auto"
                        style={{ fontSize: 12, color: T.textSec }}
                      >
                        {item.neighborhood || "منطقه نامشخص"} ·{" "}
                        {formatNumber(item.property?.area ?? item.area)} متر ·{" "}
                        {formatMoney(
                          item.asking?.askingPrice ?? item.askingPrice,
                        )}
                      </span>
                      <small
                        style={{
                          fontSize: 10,
                          color: T.textMuted,
                          fontFamily: "monospace",
                          direction: "ltr",
                          textAlign: "right",
                        }}
                      >
                        {item.token} ·{" "}
                        {item.location?.accuracy ??
                          item.coordinateAccuracy ??
                          "نامشخص"}
                      </small>
                    </a>
                  </td>
                  <td style={tdStyle}>
                    <div
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        justifyContent: "center",
                        width: 46,
                        height: 46,
                        borderRadius: T.radiusSm,
                        background: sc.bg,
                        color: sc.c,
                        fontWeight: 900,
                        fontSize: 17,
                        border: `1px solid ${sc.b}`,
                      }}
                    >
                      {formatNumber(rec)}
                    </div>
                  </td>
                  {SCORE_FACTORS.map((f) => (
                    <td key={f.key} style={tdStyle}>
                      <FactorScore
                        value={scoreMetric(item, f.key)}
                        weight={f.weight}
                        inverse={f.inverse}
                      />
                    </td>
                  ))}
                  <td style={tdStyle}>
                    <GapValue value={scoreMetric(item, "modelDiscountPct")} />
                  </td>
                  <td style={tdStyle}>
                    <GapValue value={scoreMetric(item, "nearbyDiscountPct")} />
                  </td>
                  <td style={tdStyle}>
                    <div
                      style={{
                        display: "flex",
                        flexDirection: "column",
                        gap: 1,
                        minWidth: 90,
                      }}
                    >
                      <div
                        style={{
                          display: "flex",
                          alignItems: "baseline",
                          gap: 5,
                        }}
                      >
                        <strong
                          style={{
                            fontWeight: 800,
                            color: T.white,
                            fontSize: 13,
                          }}
                        >
                          {formatNumber(
                            item.evidence?.comparableCount ??
                              item.prediction?.modelSampleCount,
                          )}
                        </strong>
                        <span style={{ fontSize: 11, color: T.textSec }}>
                          {item.evidence ? "مقایسه" : "نمونه"}
                        </span>
                      </div>
                      <small
                        style={{
                          fontSize: 10,
                          color: T.textMuted,
                          lineHeight: 1.3,
                        }}
                      >
                        {item.evidence
                          ? `${formatPercent(item.evidence.valuationValidationMedianErrorPct ?? item.evidence.modelValidationMedianErrorPct)} خطای میانه`
                          : `${formatNumber(item.nearby?.count)} همسایه`}
                      </small>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {pipelineAvailable && rows.length < filteredTotal && (
        <button
          onClick={loadMore}
          disabled={tableLoading}
          style={{
            display: "block",
            width: "100%",
            padding: 12,
            marginTop: 8,
            borderRadius: T.radiusSm,
            border: `1px solid ${T.borderLight}`,
            background: "transparent",
            color: T.textSec,
            fontSize: 13,
            fontWeight: 600,
            cursor: "pointer",
            fontFamily: "inherit",
          }}
        >
          {tableLoading ? "در حال بارگذاری…" : "نمایش ۱۰۰ آگهی بیشتر"}
        </button>
      )}
      {!rows.length && (
        <div
          style={{
            textAlign: "center",
            padding: 40,
            color: T.textMuted,
            fontSize: 14,
          }}
        >
          هیچ آگهی با این جستجو مطابقت ندارد.
        </div>
      )}
      <p
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          fontSize: 12,
          color: T.textMuted,
          marginTop: 14,
          padding: "12px 14px",
          background: T.raised,
          borderRadius: T.radiusXs,
          lineHeight: 1.55,
        }}
      >
        <Icon name="alert" size={16} />
        تخفیف مثبت یعنی قیمت درخواستی زیر معیار است. امتیازها از پیش‌بینی‌های
        cross-validate شده هستند اما قیمت درخواستی، قیمت فروش قطعی نیست.
      </p>
    </section>
  );
}

/* ──────────────────────── EventStream ──────────────────────── */
function EventStream({ events }) {
  const panelStyle = {
    background: T.surface,
    border: `1px solid ${T.border}`,
    borderRadius: T.radius,
    padding: 28,
    marginBottom: 24,
    boxShadow: T.shadow,
  };
  const levelColors = { info: T.secondary, warn: T.orange, error: T.red };

  return (
    <section style={panelStyle}>
      <SectionHeading
        kicker="مانیتورینگ"
        title="رویدادهای اخیر سرور"
        description="آخرین رویدادهای ساختاریافته، از قبل توسط لاگر سرور ویرایش شده‌اند."
      />
      <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
        {(events || []).slice(0, 12).map((event, index) => (
          <div
            key={`${event.timestamp}-${event.event}-${index}`}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 12,
              padding: "10px 14px",
              borderRadius: T.radiusXs,
              transition: "background .15s",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = T.surfaceHover;
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = "transparent";
            }}
          >
            <span
              style={{
                width: 8,
                height: 8,
                borderRadius: "50%",
                background: levelColors[event.level] || T.secondary,
                flexShrink: 0,
              }}
            />
            <time
              style={{
                fontSize: 11,
                color: T.textMuted,
                fontFamily: "monospace",
                direction: "ltr",
                whiteSpace: "nowrap",
              }}
            >
              {formatTime(event.timestamp)}
            </time>
            <strong
              style={{
                fontWeight: 700,
                color: T.text,
                whiteSpace: "nowrap",
                fontSize: 13,
              }}
            >
              {event.event}
            </strong>
            <span
              style={{
                color: T.textSec,
                flex: 1,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
                fontSize: 13,
              }}
            >
              {event.message}
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}

/* ──────────────────────── Loading / Error ──────────────────────── */
function LoadingState() {
  injectGlobalCSS();
  return (
    <main
      style={{
        direction: "rtl",
        fontFamily: "'Vazirmatn', Tahoma, sans-serif",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        minHeight: "100vh",
        background: T.bgGradient,
        color: T.text,
        textAlign: "center",
        padding: 40,
        gap: 20,
      }}
    >
      <div style={{ display: "flex", gap: 10 }}>
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            style={{
              width: 14,
              height: 14,
              borderRadius: "50%",
              background: i === 1 ? T.secondary : T.primary,
              animation: `owjDot 1.3s ${i * 0.16}s infinite ease-in-out`,
            }}
          />
        ))}
      </div>
      <h1 style={{ fontSize: 22, fontWeight: 800, color: T.white, margin: 0 }}>
        خواندن تله‌متری بازار
      </h1>
      <p style={{ fontSize: 14, color: T.textSec, margin: 0 }}>
        ترکیب آخرین خزش، آگهی‌ها، کیفیت مختصات و وضعیت مدل.
      </p>
    </main>
  );
}

function ErrorState({ error, retry }) {
  injectGlobalCSS();
  return (
    <main
      style={{
        direction: "rtl",
        fontFamily: "'Vazirmatn', Tahoma, sans-serif",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        minHeight: "100vh",
        background: T.bgGradient,
        color: T.text,
        textAlign: "center",
        padding: 40,
        gap: 20,
      }}
    >
      <span
        style={{
          width: 60,
          height: 60,
          borderRadius: 16,
          background: T.redBg,
          color: T.red,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Icon name="alert" size={28} />
      </span>
      <h1 style={{ fontSize: 22, fontWeight: 800, color: T.white, margin: 0 }}>
        داده‌های داشبورد در دسترس نیست
      </h1>
      <p style={{ fontSize: 14, color: T.textSec, margin: 0 }}>{error}</p>
      <button
        onClick={retry}
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 8,
          padding: "12px 28px",
          borderRadius: T.radiusSm,
          border: "none",
          background: `linear-gradient(135deg, ${T.primary}, ${T.secondary})`,
          color: "#fff",
          fontSize: 14,
          fontWeight: 700,
          cursor: "pointer",
          fontFamily: "inherit",
          boxShadow: `0 4px 20px ${T.primaryGlow}`,
        }}
      >
        <Icon name="refresh" size={18} /> تلاش مجدد
      </button>
    </main>
  );
}

/* ══════════════════════════════════════════════════════════════════
   MAIN DASHBOARD
   ══════════════════════════════════════════════════════════════════ */
export default function AnalyticsDashboard({
  endpoint = "/dashboard",
  refreshMs = 30_000,
}) {
  injectGlobalCSS();

  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(
    async ({ quiet = false } = {}) => {
      if (!quiet) setRefreshing(true);
      try {
        const response = await fetch(endpoint, {
          headers: { accept: "application/json" },
        });
        if (!response.ok)
          throw new Error(`Server returned HTTP ${response.status}`);
        const payload = await response.json();
        if (!payload?.crawl || !payload?.overview)
          throw new Error("Dashboard response has an unexpected shape");
        setData(payload);
        setError(null);
      } catch (caught) {
        setError(caught.message || "Unknown dashboard error");
      } finally {
        setRefreshing(false);
      }
    },
    [endpoint],
  );

  useEffect(() => {
    void load();
    const timer = window.setInterval(
      () => void load({ quiet: true }),
      refreshMs,
    );
    return () => window.clearInterval(timer);
  }, [load, refreshMs]);

  if (!data && !error) return <LoadingState />;
  if (!data && error) return <ErrorState error={error} retry={() => load()} />;

  const {
    crawl,
    overview,
    locationQuality,
    areaCoverage,
    model,
    recommendations,
    recentEvents,
  } = data;
  const areaCompletion = crawl.areasTotal
    ? (crawl.areasCompleted / crawl.areasTotal) * 100
    : 0;
  const statusTone =
    crawl.status === "completed"
      ? "good"
      : crawl.status === "failed"
        ? "bad"
        : "warn";
  const statusLabels = {
    completed: "تکمیل‌شده",
    failed: "ناموفق",
    running: "در حال اجرا",
    pending: "در انتظار",
  };
  const toneColors = { good: T.green, bad: T.red, warn: T.orange };
  const toneBgs = { good: T.greenBg, bad: T.redBg, warn: T.orangeBg };

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
      {/* ═══ TOPBAR ═══ */}
      <header
        style={{
          position: "sticky",
          top: 0,
          zIndex: 100,
          display: "flex",
          alignItems: "center",
          gap: 16,
          padding: "0 28px",
          height: 68,
          background: T.surfaceGlass,
          backdropFilter: "blur(24px) saturate(1.8)",
          WebkitBackdropFilter: "blur(24px) saturate(1.8)",
          borderBottom: `1px solid ${T.border}`,
        }}
      >
        {/* Brand */}
        <a
          href="/"
          style={{
            display: "flex",
            alignItems: "center",
            gap: 12,
            textDecoration: "none",
            color: T.text,
            flexShrink: 0,
          }}
        >
          <span
            style={{
              width: 40,
              height: 40,
              borderRadius: 12,
              background: `linear-gradient(135deg, ${T.primary} 0%, ${T.secondary} 100%)`,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "#fff",
              fontWeight: 900,
              fontSize: 14,
              boxShadow: `0 2px 12px ${T.primaryGlow}`,
            }}
          >
            <Icon name="building" size={22} />
          </span>
          <span
            style={{
              display: "flex",
              flexDirection: "column",
              lineHeight: 1.2,
            }}
          >
            <strong
              style={{
                fontWeight: 900,
                fontSize: 17,
                color: T.white,
                letterSpacing: -0.5,
              }}
            >
              املاک اوج
            </strong>
            <small
              style={{ fontSize: 11, color: T.textMuted, fontWeight: 400 }}
            >
              رصدخانه بازار مسکن
            </small>
          </span>
        </a>

        {/* Nav */}
        <nav
          style={{ display: "flex", gap: 4, marginRight: 16, flex: 1 }}
          aria-label="ناوبری اصلی"
        >
          {[
            { label: "نمای کلی", href: "/", active: true },
            { label: "تحلیل امتیاز", href: "/score-analytics", active: false },
          ].map((link) => (
            <a
              key={link.href}
              href={link.href}
              style={{
                padding: "8px 18px",
                borderRadius: 8,
                fontSize: 13,
                fontWeight: link.active ? 700 : 500,
                color: link.active ? T.white : T.textSec,
                textDecoration: "none",
                background: link.active ? T.primaryBg : "transparent",
                transition: "all .2s",
                border: link.active
                  ? `1px solid ${T.primaryBg2}`
                  : "1px solid transparent",
              }}
            >
              {link.label}
            </a>
          ))}
        </nav>

        {/* Meta */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 12,
            flexShrink: 0,
          }}
        >
          <span
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              fontSize: 12,
              fontWeight: 700,
              padding: "5px 14px",
              borderRadius: 20,
              background: toneBgs[statusTone],
              color: toneColors[statusTone],
            }}
          >
            <i
              style={{
                width: 7,
                height: 7,
                borderRadius: "50%",
                background: toneColors[statusTone],
                display: "inline-block",
                animation:
                  statusTone !== "good" ? "owjPulse 2s infinite" : "none",
              }}
            />
            {statusLabels[crawl.status] || crawl.status}
          </span>
          <span style={{ fontSize: 12, color: T.textMuted }}>
            بروزرسانی: {formatTime(data.sourceUpdatedAt || data.generatedAt)}
          </span>
          <button
            onClick={() => load()}
            disabled={refreshing}
            title="بازخوانی داشبورد"
            style={{
              width: 38,
              height: 38,
              borderRadius: T.radiusSm,
              border: `1px solid ${T.borderLight}`,
              background: "transparent",
              color: T.textSec,
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              transition: "all .2s",
            }}
          >
            <Icon name="refresh" />
          </button>
        </div>
      </header>

      {/* ═══ MAIN CONTENT ═══ */}
      <main
        style={{ maxWidth: 1400, margin: "0 auto", padding: "0 28px 80px" }}
      >
        {/* ─── Hero ─── */}
        <section
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 360px",
            gap: 36,
            padding: "52px 0 44px",
            alignItems: "center",
          }}
        >
          <div style={{ animation: "owjSlideUp .6s ease both" }}>
            <span
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 8,
                fontSize: 13,
                fontWeight: 700,
                color: T.secondary,
                marginBottom: 14,
              }}
            >
              <Icon name="activity" size={17} />
              هوش عملیاتی / فروش آپارتمان تهران
            </span>
            <h1
              style={{
                fontSize: 34,
                fontWeight: 900,
                lineHeight: 1.4,
                color: T.white,
                margin: "0 0 14px",
                letterSpacing: -0.5,
              }}
            >
              ببینید آیا داده‌های بازار{" "}
              <em
                style={{
                  fontStyle: "normal",
                  background: `linear-gradient(135deg, ${T.primaryLight}, ${T.secondary})`,
                  WebkitBackgroundClip: "text",
                  WebkitTextFillColor: "transparent",
                  backgroundClip: "text",
                }}
              >
                قابل اعتماد هستند.
              </em>
            </h1>
            <p
              style={{
                fontSize: 15,
                color: T.textSec,
                lineHeight: 1.75,
                margin: 0,
                maxWidth: 560,
              }}
            >
              یک نمای عملیاتی از پوشش جمع‌آوری، دقت موقعیت، آمادگی مدل و
              آگهی‌هایی که ارزش بررسی دارند.
            </p>
          </div>

          {/* Run Card */}
          <div
            style={{
              background: T.surface,
              border: `1px solid ${T.border}`,
              borderRadius: 18,
              padding: 26,
              display: "flex",
              flexDirection: "column",
              gap: 18,
              boxShadow: T.shadowLg,
              animation: "owjSlideUp .7s ease both",
              position: "relative",
              overflow: "hidden",
            }}
          >
            {/* Decorative gradient line */}
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
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
              }}
            >
              <span style={{ fontSize: 13, color: T.textMuted }}>
                آخرین خزش
              </span>
              <strong
                style={{
                  fontSize: 13,
                  fontWeight: 800,
                  fontFamily: "monospace",
                  color: T.primaryLight,
                  background: T.primaryBg,
                  padding: "3px 10px",
                  borderRadius: 6,
                }}
              >
                {crawl.runId?.slice(0, 8) || "—"}
              </strong>
            </div>
            <div style={{ textAlign: "center", padding: "8px 0" }}>
              <strong
                style={{
                  fontSize: 44,
                  fontWeight: 900,
                  color: T.white,
                  display: "block",
                  lineHeight: 1,
                  letterSpacing: -2,
                }}
              >
                {formatNumber(crawl.processed)}
              </strong>
              <span
                style={{
                  fontSize: 13,
                  color: T.textSec,
                  marginTop: 4,
                  display: "block",
                }}
              >
                آگهی پردازش‌شده
              </span>
            </div>
            <Progress
              value={crawl.successRate}
              tone="cyan"
              label="نرخ موفقیت خزش"
            />
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                fontSize: 12,
                color: T.textMuted,
                paddingTop: 14,
                borderTop: `1px solid ${T.border}`,
              }}
            >
              <span>{formatDuration(crawl.durationMs)}</span>
              <span>
                {formatNumber(crawl.areasCompleted)} /{" "}
                {formatNumber(crawl.areasTotal)} منطقه
              </span>
            </div>
          </div>
        </section>

        {/* ─── KPI Grid ─── */}
        <section
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(4, 1fr)",
            gap: 18,
            marginBottom: 36,
          }}
          aria-label="معیارهای کلیدی کیفیت"
        >
          <KpiCard
            eyebrow="موفقیت خزش"
            value={formatPercent(crawl.successRate)}
            detail={`${formatNumber(crawl.successful)} موفق · ${formatNumber(crawl.failed)} ناموفق`}
            progress={crawl.successRate}
            tone="cyan"
            icon="check"
          />
          <KpiCard
            eyebrow="تکمیل مناطق"
            value={formatPercent(areaCompletion)}
            detail={`${formatNumber(crawl.areasCompleted)} از ${formatNumber(crawl.areasTotal)} منطقه`}
            progress={areaCompletion}
            tone="green"
            icon="area"
          />
          <KpiCard
            eyebrow="پوشش کاندیداها"
            value={formatPercent(overview.candidateCoverage)}
            detail={`${formatNumber(crawl.discovered)} از ${formatNumber(overview.candidateTarget)} هدف`}
            progress={overview.candidateCoverage}
            tone="orange"
            icon="database"
          />
          <KpiCard
            eyebrow="پوشش مختصات"
            value={formatPercent(locationQuality.coverage)}
            detail={`${formatNumber(locationQuality.available)} قابل استفاده · ${formatNumber(locationQuality.missing)} ناموجود`}
            progress={locationQuality.coverage}
            tone="violet"
            icon="location"
          />
        </section>

        {/* ─── Attention ─── */}
        <section style={{ marginBottom: 36 }}>
          <SectionHeading
            kicker="دروازه‌های کیفیت"
            title="نیازمند توجه"
            description="اعدادی که می‌توانند تصمیمات جمع‌آوری یا مدل‌سازی را تغییر دهند."
          />
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(4, 1fr)",
              gap: 16,
            }}
          >
            <AttentionCard
              tone={crawl.failed ? "warn" : "good"}
              icon={crawl.failed ? "alert" : "check"}
              value={formatNumber(crawl.failed)}
              title="رکوردهای جزئیات ناموفق"
              text={
                crawl.failed
                  ? "رویدادهای crawl.listing.failure را قبل از تأیید کامل بودن پوشش بررسی کنید."
                  : "هیچ خطای جزئیات آگهی در این اجرا وجود ندارد."
              }
            />
            <AttentionCard
              tone={areaCoverage.withShortfall ? "warn" : "good"}
              icon="area"
              value={formatNumber(areaCoverage.withShortfall)}
              title="مناطق زیر هدف"
              text={`${formatNumber(areaCoverage.totalShortfall)} آگهی کمتر از هدف تعیین‌شده هر منطقه.`}
            />
            <AttentionCard
              tone={locationQuality.missing ? "warn" : "good"}
              icon="location"
              value={formatNumber(locationQuality.missing)}
              title="آگهی‌های بدون مختصات"
              text="با امنیت ذخیره شده‌اند اما از مقایسه مختصاتی و امتیازدهی حذف می‌شوند."
            />
            <AttentionCard
              tone={crawl.contactEndpointAttempts ? "bad" : "good"}
              icon={crawl.contactEndpointAttempts ? "alert" : "check"}
              value={formatNumber(crawl.contactEndpointAttempts)}
              title="تلاش‌های endpoint تماس"
              text={
                crawl.contactEndpointAttempts
                  ? "فعالیت guardrail شناسایی شد؛ فوراً بررسی کنید."
                  : "guardrail جمع‌آوری عمومی بدون مشکل باقی ماند."
              }
            />
          </div>
        </section>

        {/* ─── Split: Location + Model ─── */}
        <section
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: 24,
            marginBottom: 24,
          }}
        >
          <LocationQuality data={locationQuality} />
          <ModelReadiness data={model} />
        </section>

        {/* ─── Area Coverage ─── */}
        <AreaCoverage data={areaCoverage} />

        {/* ─── Scored Listings ─── */}
        <div id="scored-listings">
          <Recommendations
            data={data.scoring?.available ? data.scoring : recommendations}
          />
        </div>

        {/* ─── Events ─── */}
        <EventStream events={recentEvents} />

        {/* ─── Raw JSON ─── */}
        <details
          style={{
            background: T.surface,
            border: `1px solid ${T.border}`,
            borderRadius: T.radius,
            overflow: "hidden",
            marginBottom: 24,
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
              <Icon name="database" size={18} /> داده خام JSON
            </span>
            <span style={{ fontSize: 12, color: T.textMuted }}>
              مشاهده محتوای دقیق API
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

      {/* ═══ FOOTER ═══ */}
      <footer
        style={{
          display: "flex",
          justifyContent: "space-between",
          padding: "22px 28px",
          borderTop: `1px solid ${T.border}`,
          fontSize: 12,
          color: T.textMuted,
          maxWidth: 1400,
          margin: "0 auto",
          flexWrap: "wrap",
          gap: 8,
        }}
      >
        <span>
          <strong style={{ color: T.textSec }}>املاک اوج</strong> · تحلیل بازار
          مسکن · فقط داده‌های عمومی
        </span>
        <span>
          امتیازها ابزارهای تصمیم‌گیری آزمایشی هستند، نه توصیه سرمایه‌گذاری.
        </span>
      </footer>
    </div>
  );
}
