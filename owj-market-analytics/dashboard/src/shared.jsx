import { useEffect } from "react";

/* ══════════════════════════════════════════════════════════════════
   FORMATTERS (translated to Persian, logic unchanged)
   ══════════════════════════════════════════════════════════════════ */
export const numberFormat = new Intl.NumberFormat("fa-IR");
export const decimalFormat = new Intl.NumberFormat("fa-IR", {
  maximumFractionDigits: 1,
});
const dateTime = new Intl.DateTimeFormat("fa-IR", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "Asia/Tehran",
});

export function formatNumber(value) {
  return Number.isFinite(value) ? numberFormat.format(value) : "—";
}

export function formatPercent(value, signed = false) {
  if (!Number.isFinite(value)) return "—";
  return `${signed && value > 0 ? "+" : ""}${decimalFormat.format(value)}٪`;
}

export function formatMoney(value) {
  if (!Number.isFinite(value)) return "—";
  if (Math.abs(value) >= 1_000_000_000)
    return `${decimalFormat.format(value / 1_000_000_000)} میلیارد تومان`;
  if (Math.abs(value) >= 1_000_000)
    return `${decimalFormat.format(value / 1_000_000)} میلیون تومان`;
  return `${formatNumber(value)} تومان`;
}

export function formatTime(value) {
  const parsed = new Date(value);
  return value && !Number.isNaN(parsed.valueOf())
    ? dateTime.format(parsed)
    : "—";
}

export function clamp(value) {
  return Math.max(0, Math.min(100, Number(value) || 0));
}

/* ══════════════════════════════════════════════════════════════════
   DESIGN TOKENS (shared with all pages)
   ══════════════════════════════════════════════════════════════════ */
export const T = {
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

/* ══════════════════════════════════════════════════════════════════
   GLOBAL CSS INJECTION (once per app lifecycle)
   ══════════════════════════════════════════════════════════════════ */
const GLOBAL_CSS = `
@import url('https://fonts.googleapis.com/css2?family=Vazirmatn:wght@300;400;500;600;700;800;900&display=swap');

*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

html, body {
  background: ${T.bg};
  font-family: 'Vazirmatn', Tahoma, sans-serif;
  color: ${T.text};
  direction: rtl;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}

a { color: inherit; }

::-webkit-scrollbar { width: 6px; height: 6px; }
::-webkit-scrollbar-track { background: transparent; }
::-webkit-scrollbar-thumb { background: ${T.borderLight}; border-radius: 99px; }
::-webkit-scrollbar-thumb:hover { background: ${T.textMuted}; }

input::placeholder { color: ${T.textMuted}; font-family: inherit; }

button { font-family: inherit; }

@keyframes owjPulse {
  0%, 100% { opacity: 1; transform: scale(1); }
  50% { opacity: .5; transform: scale(1.15); }
}
@keyframes owjFloat {
  0%, 100% { transform: translateY(0); }
  50% { transform: translateY(-6px); }
}
@keyframes owjDot {
  0%, 80%, 100% { transform: scale(.5); opacity: .25; }
  40% { transform: scale(1); opacity: 1; }
}
@keyframes owjSlideUp {
  from { opacity: 0; transform: translateY(16px); }
  to { opacity: 1; transform: translateY(0); }
}
@keyframes owjFadeIn {
  from { opacity: 0; }
  to { opacity: 1; }
}
@keyframes owjSpin {
  to { transform: rotate(360deg); }
}
`;

let cssInjected = false;
export function injectGlobalCSS() {
  if (cssInjected || typeof document === "undefined") return;
  cssInjected = true;
  const el = document.createElement("style");
  el.textContent = GLOBAL_CSS;
  document.head.appendChild(el);
}

/* ══════════════════════════════════════════════════════════════════
   ICON COMPONENT (unchanged logic)
   ══════════════════════════════════════════════════════════════════ */
export function Icon({ name, size = 20 }) {
  const paths = {
    activity: <path d="M3 12h4l2.3-7 4.4 14 2.3-7h5" />,
    alert: (
      <>
        <path d="M12 3 2.7 19h18.6L12 3Z" />
        <path d="M12 9v4" />
        <path d="M12 16.5h.01" />
      </>
    ),
    arrow: (
      <>
        <path d="M5 12h14" />
        <path d="m13 6 6 6-6 6" />
      </>
    ),
    back: (
      <>
        <path d="M19 12H5" />
        <path d="m11 18-6-6 6-6" />
      </>
    ),
    check: <path d="m5 12 4 4L19 6" />,
    database: (
      <>
        <ellipse cx="12" cy="5" rx="8" ry="3" />
        <path d="M4 5v7c0 1.7 3.6 3 8 3s8-1.3 8-3V5" />
        <path d="M4 12v7c0 1.7 3.6 3 8 3s8-1.3 8-3v-7" />
      </>
    ),
    external: (
      <>
        <path d="M14 5h5v5" />
        <path d="m10 14 9-9" />
        <path d="M19 14v5H5V5h5" />
      </>
    ),
    location: (
      <>
        <path d="M20 10c0 5-8 11-8 11S4 15 4 10a8 8 0 1 1 16 0Z" />
        <circle cx="12" cy="10" r="2.5" />
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
    refresh: (
      <>
        <path d="M20 7v5h-5" />
        <path d="M4 17v-5h5" />
        <path d="M6.1 8a7 7 0 0 1 11.7-2L20 8" />
        <path d="m4 16 2.2 2a7 7 0 0 0 11.7-2" />
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
      style={{ flexShrink: 0 }}
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

/* ══════════════════════════════════════════════════════════════════
   APP HEADER (املاک اوج branded)
   ══════════════════════════════════════════════════════════════════ */
export function AppHeader({ active = "overview" }) {
  useEffect(() => {
    injectGlobalCSS();
  }, []);

  const navLinks = [
    { key: "overview", label: "نمای کلی", href: "/" },
    { key: "analytics", label: "تحلیل امتیاز", href: "/score-analytics" },
  ];

  return (
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
        direction: "rtl",
        fontFamily: "'Vazirmatn', Tahoma, sans-serif",
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
          transition: "opacity .2s",
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.opacity = "0.85";
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.opacity = "1";
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
            boxShadow: `0 2px 12px ${T.primaryGlow}`,
          }}
        >
          <Icon name="building" size={22} />
        </span>
        <span
          style={{ display: "flex", flexDirection: "column", lineHeight: 1.2 }}
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
          <small style={{ fontSize: 11, color: T.textMuted, fontWeight: 400 }}>
            رصدخانه بازار مسکن
          </small>
        </span>
      </a>

      {/* Nav */}
      <nav
        style={{ display: "flex", gap: 4, marginRight: 16, flex: 1 }}
        aria-label="ناوبری اصلی"
      >
        {navLinks.map((link) => {
          const isActive = active === link.key;
          return (
            <a
              key={link.key}
              href={link.href}
              style={{
                padding: "8px 18px",
                borderRadius: 8,
                fontSize: 13,
                fontWeight: isActive ? 700 : 500,
                color: isActive ? T.white : T.textSec,
                textDecoration: "none",
                background: isActive ? T.primaryBg : "transparent",
                border: `1px solid ${isActive ? T.primaryBg2 : "transparent"}`,
                transition: "all .2s",
              }}
              onMouseEnter={(e) => {
                if (!isActive) {
                  e.currentTarget.style.color = T.text;
                  e.currentTarget.style.background = T.raised;
                }
              }}
              onMouseLeave={(e) => {
                if (!isActive) {
                  e.currentTarget.style.color = T.textSec;
                  e.currentTarget.style.background = "transparent";
                }
              }}
            >
              {link.label}
            </a>
          );
        })}
      </nav>
    </header>
  );
}

/* ══════════════════════════════════════════════════════════════════
   APP FOOTER
   ══════════════════════════════════════════════════════════════════ */
export function AppFooter() {
  return (
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
        direction: "rtl",
        fontFamily: "'Vazirmatn', Tahoma, sans-serif",
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
  );
}

/* ══════════════════════════════════════════════════════════════════
   LOADING PAGE
   ══════════════════════════════════════════════════════════════════ */
export function LoadingPage({ message = "در حال خواندن شواهد امتیازدهی" }) {
  useEffect(() => {
    injectGlobalCSS();
  }, []);

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
        animation: "owjFadeIn .3s ease",
      }}
    >
      {/* Animated logo */}
      <div
        style={{
          width: 72,
          height: 72,
          borderRadius: 20,
          background: `linear-gradient(135deg, ${T.primary}, ${T.secondary})`,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "#fff",
          boxShadow: `0 8px 32px ${T.primaryGlow}`,
          animation: "owjFloat 3s ease-in-out infinite",
          marginBottom: 8,
        }}
      >
        <Icon name="building" size={36} />
      </div>

      {/* Dots */}
      <div style={{ display: "flex", gap: 10 }}>
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            style={{
              width: 12,
              height: 12,
              borderRadius: "50%",
              background: i === 1 ? T.secondary : T.primary,
              animation: `owjDot 1.3s ${i * 0.16}s infinite ease-in-out`,
            }}
          />
        ))}
      </div>

      <h1 style={{ fontSize: 22, fontWeight: 800, color: T.white, margin: 0 }}>
        {message}
      </h1>
      <p
        style={{
          fontSize: 14,
          color: T.textSec,
          margin: 0,
          maxWidth: 420,
          lineHeight: 1.7,
        }}
      >
        در حال بارگذاری JSON امتیازدهی تولیدشده از سرور.
      </p>
    </main>
  );
}

/* ══════════════════════════════════════════════════════════════════
   ERROR PAGE
   ══════════════════════════════════════════════════════════════════ */
export function ErrorPage({ message }) {
  useEffect(() => {
    injectGlobalCSS();
  }, []);

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
        animation: "owjFadeIn .3s ease",
      }}
    >
      <span
        style={{
          width: 72,
          height: 72,
          borderRadius: 20,
          background: T.redBg,
          border: `1px solid ${T.redBg2}`,
          color: T.red,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          animation: "owjPulse 2.5s infinite",
        }}
      >
        <Icon name="alert" size={32} />
      </span>
      <h1 style={{ fontSize: 22, fontWeight: 800, color: T.white, margin: 0 }}>
        این صفحه بارگذاری نشد
      </h1>
      <p
        style={{
          fontSize: 14,
          color: T.textSec,
          margin: 0,
          maxWidth: 480,
          lineHeight: 1.7,
          padding: "12px 18px",
          background: T.surface,
          border: `1px solid ${T.border}`,
          borderRadius: T.radiusSm,
        }}
      >
        {message}
      </p>
      <a
        href="/"
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 8,
          padding: "12px 26px",
          borderRadius: T.radiusSm,
          background: `linear-gradient(135deg, ${T.primary}, ${T.secondary})`,
          color: "#fff",
          fontSize: 14,
          fontWeight: 700,
          textDecoration: "none",
          cursor: "pointer",
          boxShadow: `0 4px 20px ${T.primaryGlow}`,
          transition: "transform .2s, box-shadow .2s",
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.transform = "translateY(-2px)";
          e.currentTarget.style.boxShadow = `0 6px 28px ${T.primaryGlow}`;
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.transform = "translateY(0)";
          e.currentTarget.style.boxShadow = `0 4px 20px ${T.primaryGlow}`;
        }}
      >
        <Icon name="back" size={18} />
        بازگشت به نمای کلی
      </a>
    </main>
  );
}

/* ══════════════════════════════════════════════════════════════════
   SCORE BAR
   ══════════════════════════════════════════════════════════════════ */
export function ScoreBar({ value, tone = "cyan" }) {
  const toneMap = {
    cyan: `linear-gradient(90deg, ${T.secondaryDark}, ${T.secondary}, ${T.secondaryLight})`,
    green: `linear-gradient(90deg, #059669, ${T.green})`,
    orange: `linear-gradient(90deg, #ea580c, ${T.orange})`,
    red: `linear-gradient(90deg, #dc2626, ${T.red})`,
    violet: `linear-gradient(90deg, ${T.primary}, ${T.primaryPale})`,
  };
  const glowMap = {
    cyan: T.secondaryGlow,
    violet: T.primaryGlow,
    green: "rgba(52,211,153,0.25)",
    orange: "rgba(251,146,60,0.25)",
    red: "rgba(248,113,113,0.25)",
  };

  return (
    <span
      style={{
        display: "block",
        height: 5,
        background: T.border,
        borderRadius: 99,
        overflow: "hidden",
        width: "100%",
      }}
    >
      <i
        style={{
          display: "block",
          height: "100%",
          width: `${clamp(value)}%`,
          borderRadius: 99,
          background: toneMap[tone] || toneMap.cyan,
          boxShadow: `0 0 10px ${glowMap[tone] || glowMap.cyan}`,
          transition: "width .7s cubic-bezier(.22,1,.36,1)",
        }}
      />
    </span>
  );
}
