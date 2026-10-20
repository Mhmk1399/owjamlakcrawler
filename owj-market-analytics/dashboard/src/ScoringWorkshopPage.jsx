import { useEffect, useMemo, useState } from "react";
import { AppFooter, AppHeader, ErrorPage, formatMoney, formatNumber, formatTime, Icon, LoadingPage, T } from "./shared.jsx";
import { calculateScenario, DEFAULT_SCORING_CONFIG, SCORING_PRESETS } from "./scoringWorkshopModel.js";

const BAND_LABELS = { "strong-value": "فرصت خرید بسیار خوب", promising: "ارزش بررسی دارد", fair: "قیمت نسبتاً منصفانه", "weak-value": "ارزش خرید پایین" };
const BAND_COLORS = { "strong-value": T.green, promising: T.secondary, fair: T.orange, "weak-value": T.red };
const FACTOR_LABELS = { elevator: "آسانسور", parking: "پارکینگ", storage: "انباری", balcony: "بالکن",
  floor: "طبقه", noElevatorHighFloor: "طبقه بالا بدون آسانسور", topFloor: "طبقه آخر", age: "سن بنا",
  newBuild: "نوساز بودن", unitDensity: "تعداد واحد در طبقه", area: "متراژ", rooms: "تعداد اتاق" };

function Control({ id, label, detail, value, onChange, min = 0, max = 100, step = 1, unit = "٪", signed = false }) {
  const shownValue = `${signed && value > 0 ? "+" : ""}${formatNumber(value)}${unit ? ` ${unit}` : ""}`;
  return <div className="workshop-control">
    <div className="workshop-control__head"><label htmlFor={id}>{label}</label><output htmlFor={id}>{shownValue}</output></div>
    <p>{detail}</p>
    <div className="workshop-control__inputs">
      <input id={id} type="range" min={min} max={max} step={step} value={value}
        onChange={(event) => onChange(Number(event.target.value))} />
      <input aria-label={`${label}`} type="number" min={min} max={max} step={step} value={value}
        onChange={(event) => onChange(Math.max(min, Math.min(max, Number(event.target.value))))} />
    </div>
  </div>;
}

function MiniStat({ label, value, detail, tone = T.secondary }) {
  return <article className="workshop-stat" style={{ "--workshop-accent": tone }}>
    <span>{label}</span><strong>{value}</strong><small>{detail}</small>
  </article>;
}

function Distribution({ histogram }) {
  const maximum = Math.max(1, ...histogram.map((item) => item.count));
  return <div className="workshop-histogram" aria-label="پراکندگی امتیازهای تنظیم آزمایشی">
    {histogram.map((item) => <div key={item.label} className="workshop-histogram__bin">
      <b>{formatNumber(item.count)}</b>
      <i style={{ height: `${Math.max(2, item.count / maximum * 100)}%` }} />
      <span dir="ltr">{item.label}</span>
    </div>)}
  </div>;
}

export default function ScoringWorkshopPage() {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [config, setConfig] = useState(() => {
    try { return { ...DEFAULT_SCORING_CONFIG, ...JSON.parse(localStorage.getItem("owj-scoring-workshop") || "{}") }; }
    catch { return { ...DEFAULT_SCORING_CONFIG }; }
  });
  const [query, setQuery] = useState("");
  const [copyStatus, setCopyStatus] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    fetch("/score-workshop-data", { signal: controller.signal })
      .then((response) => response.ok ? response.json() : Promise.reject(new Error(`Server returned HTTP ${response.status}`)))
      .then(setData).catch((caught) => { if (caught.name !== "AbortError") setError(caught.message); });
    return () => controller.abort();
  }, []);
  useEffect(() => { localStorage.setItem("owj-scoring-workshop", JSON.stringify(config)); }, [config]);

  const scenario = useMemo(() => calculateScenario(data?.listings || [], config), [data, config]);
  const shownRows = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase("fa");
    return scenario.rows.filter((row) => !normalized || `${row.title} ${row.neighborhood} ${row.token}`.toLocaleLowerCase("fa").includes(normalized)).slice(0, 100);
  }, [scenario, query]);
  const thresholdsValid = config.strongThreshold > config.promisingThreshold &&
    config.promisingThreshold > config.fairThreshold;
  const neighborhoodRows = Object.values(scenario.neighborhoods).sort((a, b) =>
    (config.neighborhoodScores?.[b.name] ?? b.score) - (config.neighborhoodScores?.[a.name] ?? a.score));
  const update = (key, value) => setConfig((current) => ({ ...current, [key]: value }));
  const updateNeighborhood = (name, value) => setConfig((current) => ({ ...current,
    neighborhoodScores: { ...current.neighborhoodScores, [name]: value } }));
  const copyConfiguration = async () => {
    const payload = JSON.stringify({ scoringVersion: data.scoringVersion, savedAt: new Date().toISOString(), config }, null, 2);
    try { await navigator.clipboard.writeText(payload); setCopyStatus("تنظیمات کپی شد"); }
    catch { setCopyStatus("مرورگر اجازه کپی نداد"); }
    window.setTimeout(() => setCopyStatus(""), 2500);
  };

  if (!data && !error) return <LoadingPage message="در حال آماده‌سازی کارگاه امتیازدهی" />;
  if (error) return <ErrorPage message={error} />;

  return <div className="workshop-page" dir="rtl">
    <AppHeader active="workshop" />
    <main className="workshop-main">
      <section className="workshop-hero">
        <div><span><Icon name="trend" size={18} /> محیط آزمایشی امتیازدهی</span>
          <h1>آزمایش و تنظیم امتیاز آگهی‌ها</h1>
          <p>سهم هر بخش و اثر هر ویژگی را همراه مدیر تغییر دهید و نتیجه را همان لحظه روی امتیاز و رتبه آگهی‌ها ببینید. تغییرهای این صفحه آزمایشی‌اند و اطلاعات اصلی را عوض نمی‌کنند.</p>
        </div>
        <aside><span>نسخه داده</span><strong>{data.scoringVersion}</strong><small>{formatNumber(data.total)} آگهی · {formatTime(data.generatedAt)}</small></aside>
      </section>

      <div className="workshop-layout">
        <aside className="workshop-sidebar">
          <section className="workshop-panel">
            <div className="workshop-panel__head"><div><span>شروع سریع</span><h2>الگوهای آماده</h2></div>
              <button type="button" onClick={() => setConfig({ ...DEFAULT_SCORING_CONFIG })}>بازگشت به پیشنهاد اولیه</button></div>
            <div className="workshop-presets">
              {Object.entries(SCORING_PRESETS).map(([key, preset]) => <button type="button" key={key}
                onClick={() => setConfig({ ...preset.values })}>{preset.label}</button>)}
            </div>
          </section>

          <section className="workshop-panel">
            <div className="workshop-panel__head"><div><span>مرحله ۱</span><h2>مناسب‌بودن قیمت</h2></div>
              <b className={scenario.dealWeightTotal === 100 ? "is-valid" : "is-invalid"}>{formatNumber(scenario.dealWeightTotal)}٪</b></div>
            <p className="workshop-help">وزن یعنی سهم هر معیار در نتیجه این مرحله؛ وزن بیشتر، اثر بیشتر. بهتر است جمع سه وزن ۱۰۰٪ باشد.</p>
            <Control id="weight-model" label="مقایسه با قیمت برآوردی" detail="بررسی می‌کند قیمت آگهی چقدر از قیمت برآوردشده سامانه ارزان‌تر یا گران‌تر است." value={config.modelValue} onChange={(v) => update("modelValue", v)} />
            <Control id="weight-nearby" label="مقایسه با آگهی‌های مشابه" detail="قیمت این ملک را با آگهی‌های مشابه و نزدیک در همان محدوده مقایسه می‌کند." value={config.nearbyValue} onChange={(v) => update("nearbyValue", v)} />
            <Control id="weight-position" label="جایگاه قیمت در محله" detail="نشان می‌دهد قیمت هر متر این آگهی در میان قیمت‌های همان محله پایین، معمولی یا بالا است." value={config.localPosition} onChange={(v) => update("localPosition", v)} />
          </section>

          <section className="workshop-panel">
            <div className="workshop-panel__head"><div><span>ترکیب نهایی</span><h2>سهم بخش‌ها در امتیاز نهایی</h2></div>
              <b className={scenario.overallWeightTotal === 100 ? "is-valid" : "is-invalid"}>{formatNumber(scenario.overallWeightTotal)}٪</b></div>
            <p className="workshop-help">این سه عدد مشخص می‌کنند قیمت، ویژگی‌های ملک و محله هرکدام چه سهمی از امتیاز پیش از تعدیل داشته باشند.</p>
            <Control id="pillar-valuation" label="مناسب‌بودن قیمت" detail="خلاصه سه مقایسه قیمتی مرحله قبل؛ وزن بیشتر یعنی حساسیت بیشتر به ارزان یا گران بودن آگهی." value={config.valuationWeight} onChange={(v) => update("valuationWeight", v)} />
            <Control id="pillar-property" label="ویژگی‌های خودِ ملک" detail="امکانات، طبقه، سن بنا، متراژ، تعداد اتاق و تعداد واحد در طبقه را در نظر می‌گیرد." value={config.propertyWeight} onChange={(v) => update("propertyWeight", v)} />
            <Control id="pillar-neighborhood" label="امتیاز محله" detail="امتیاز عددی محله را وارد نتیجه می‌کند؛ این عدد در بخش «محله‌ها» قابل اصلاح است." value={config.neighborhoodWeight} onChange={(v) => update("neighborhoodWeight", v)} />
          </section>

          <section className="workshop-panel">
            <div className="workshop-panel__head"><div><span>امکانات</span><h2>اثر امکانات بر امتیاز ملک</h2></div></div>
            <p className="workshop-help">امتیاز ویژگی‌های ملک از ۵۰ شروع می‌شود. عدد مثبت به آن اضافه و عدد منفی از آن کم می‌شود؛ نتیجه همیشه بین صفر تا ۱۰۰ می‌ماند.</p>
            <Control id="elevator-yes" label="داشتن آسانسور" detail="اگر آگهی آسانسور داشته باشد، این مقدار به امتیاز ملک اضافه می‌شود." value={config.elevatorYes} min={-20} max={20} unit="امتیاز" signed onChange={(v) => update("elevatorYes", v)} />
            <Control id="elevator-no" label="نداشتن آسانسور" detail="اگر آگهی آسانسور نداشته باشد، این مقدار روی امتیاز ملک اعمال می‌شود؛ عدد منفی یعنی کسر امتیاز." value={config.elevatorNo} min={-20} max={20} unit="امتیاز" signed onChange={(v) => update("elevatorNo", v)} />
            <Control id="parking-yes" label="داشتن پارکینگ" detail="اگر ملک پارکینگ داشته باشد، این مقدار به امتیاز ملک اضافه می‌شود." value={config.parkingYes} min={-20} max={20} unit="امتیاز" signed onChange={(v) => update("parkingYes", v)} />
            <Control id="parking-no" label="نداشتن پارکینگ" detail="اگر ملک پارکینگ نداشته باشد، این مقدار از امتیاز ملک کم می‌شود." value={config.parkingNo} min={-20} max={20} unit="امتیاز" signed onChange={(v) => update("parkingNo", v)} />
            <Control id="storage-yes" label="داشتن انباری" detail="اثر وجود انباری بر امتیاز ویژگی‌های ملک." value={config.storageYes} min={-20} max={20} unit="امتیاز" signed onChange={(v) => update("storageYes", v)} />
            <Control id="storage-no" label="نداشتن انباری" detail="اثر نبود انباری؛ عدد منفی از امتیاز ملک کم می‌کند." value={config.storageNo} min={-20} max={20} unit="امتیاز" signed onChange={(v) => update("storageNo", v)} />
            <Control id="balcony-yes" label="داشتن بالکن" detail="اثر وجود بالکن بر امتیاز ویژگی‌های ملک." value={config.balconyYes} min={-20} max={20} unit="امتیاز" signed onChange={(v) => update("balconyYes", v)} />
            <Control id="balcony-no" label="نداشتن بالکن" detail="اثر نبود بالکن؛ عدد منفی از امتیاز ملک کم می‌کند." value={config.balconyNo} min={-20} max={20} unit="امتیاز" signed onChange={(v) => update("balconyNo", v)} />
          </section>

          <section className="workshop-panel">
            <div className="workshop-panel__head"><div><span>مشخصات ساختمان</span><h2>اثر طبقه، سن و اندازه ملک</h2></div></div>
            <Control id="floor-third" label="هر طبقه بالاتر از طبقه دوم" detail="برای طبقه سوم یک‌بار، طبقه چهارم دو بار و به همین ترتیب اعمال می‌شود." value={config.floorAboveSecondPenalty} min={-15} max={5} step={0.5} unit="امتیاز" signed onChange={(v) => update("floorAboveSecondPenalty", v)} />
            <Control id="floor-no-elevator" label="کسر اضافه برای طبقه بالا بدون آسانسور" detail="علاوه بر اثر طبقه، برای هر طبقه بالاتر از دوم در ساختمان بدون آسانسور اعمال می‌شود." value={config.noElevatorHighFloorPenalty} min={-20} max={0} step={0.5} unit="امتیاز" signed onChange={(v) => update("noElevatorHighFloorPenalty", v)} />
            <Control id="floor-basement" label="واحد زیرزمین" detail="این مقدار یک‌بار برای واحدی که در زیرزمین قرار دارد اعمال می‌شود." value={config.basementPenalty} min={-30} max={0} unit="امتیاز" signed onChange={(v) => update("basementPenalty", v)} />
            <Control id="floor-ground" label="واحد همکف" detail="اثر قرارگرفتن واحد در طبقه همکف بر امتیاز ملک." value={config.groundFloorPenalty} min={-20} max={5} unit="امتیاز" signed onChange={(v) => update("groundFloorPenalty", v)} />
            <Control id="floor-top" label="واحد طبقه آخر" detail="اثر قرارگرفتن واحد در آخرین طبقه ساختمان، مانند احتمال گرما یا مشکل بام." value={config.topFloorPenalty} min={-20} max={5} unit="امتیاز" signed onChange={(v) => update("topFloorPenalty", v)} />
            <Control id="age-year" label="کسر امتیاز به‌ازای هر سال عمر بنا" detail="در سن بنا ضرب می‌شود؛ مثلاً منفی ۰٫۵ برای بنای ۱۰ ساله یعنی کسر ۵ امتیاز." value={config.agePerYearPenalty} min={-2} max={0} step={0.05} unit="امتیاز" signed onChange={(v) => update("agePerYearPenalty", v)} />
            <Control id="new-build" label="امتیاز نوساز بودن" detail="اگر عمر بنا صفر یا یک سال باشد، این مقدار یک‌بار به امتیاز ملک اضافه می‌شود." value={config.newBuildBonus} min={-10} max={15} unit="امتیاز" signed onChange={(v) => update("newBuildBonus", v)} />
            <Control id="single-unit" label="تک‌واحدی بودن طبقه" detail="اگر در هر طبقه فقط یک واحد باشد، این مقدار به امتیاز ملک اضافه می‌شود." value={config.singleUnitBonus} min={-10} max={15} unit="امتیاز" signed onChange={(v) => update("singleUnitBonus", v)} />
            <Control id="extra-unit" label="هر واحد اضافه در یک طبقه" detail="از واحد دوم به بعد، به‌ازای هر واحد اضافه این مقدار اعمال می‌شود؛ مثلاً سه واحد یعنی دو بار." value={config.extraUnitPenalty} min={-10} max={0} step={0.5} unit="امتیاز" signed onChange={(v) => update("extraUnitPenalty", v)} />
            <Control id="area-step" label="اثر هر ۲۵ متر اختلاف با ۷۵ متر" detail="۷۵ متر نقطه مبنا است؛ ملک ۱۰۰ متری یک بار و ملک ۵۰ متری یک بار در جهت مخالف اثر می‌گیرد." value={config.areaPer25Sqm} min={-5} max={5} step={0.5} unit="امتیاز" signed onChange={(v) => update("areaPer25Sqm", v)} />
            <Control id="room-point" label="اثر هر اتاق اختلاف با دو اتاق" detail="دو اتاق نقطه مبنا است؛ سه‌خوابه یک بار و یک‌خوابه یک بار در جهت مخالف اثر می‌گیرد." value={config.roomPoint} min={-5} max={5} step={0.5} unit="امتیاز" signed onChange={(v) => update("roomPoint", v)} />
          </section>

          <section className="workshop-panel">
            <div className="workshop-panel__head"><div><span>مرحله ۲</span><h2>تعدیل بر اساس اعتماد و ریسک</h2></div></div>
            <p className="workshop-help">پس از محاسبه قیمت، ملک و محله، قابل‌اعتماد بودن داده و نشانه‌های ریسک می‌توانند امتیاز را کاهش دهند.</p>
            <Control id="confidence-floor" label="حداقل سهم امتیاز در نبود اطمینان" detail="اگر اعتماد به داده صفر باشد، همین درصد از امتیاز حفظ می‌شود؛ با افزایش اعتماد، سهم حفظ‌شده به ۱۰۰٪ نزدیک می‌شود." value={config.confidenceFloor} onChange={(v) => update("confidenceFloor", v)} />
            <Control id="risk-penalty" label="بیشترین کاهش به‌دلیل ریسک" detail="اگر ریسک ۱۰۰ باشد، امتیاز حداکثر به‌اندازه این درصد کاهش می‌یابد؛ ریسک کمتر، کاهش کمتری دارد." value={config.riskPenalty} onChange={(v) => update("riskPenalty", v)} />
          </section>

          <section className="workshop-panel">
            <div className="workshop-panel__head"><div><span>مرحله ۳</span><h2>حد نصاب دسته‌بندی</h2></div><b className={thresholdsValid ? "is-valid" : "is-invalid"}>{thresholdsValid ? "درست" : "نیاز به اصلاح"}</b></div>
            <Control id="threshold-strong" label="فرصت خرید بسیار خوب" detail="هر آگهی با امتیاز برابر یا بیشتر از این عدد در بالاترین دسته قرار می‌گیرد." value={config.strongThreshold} unit="از ۱۰۰" onChange={(v) => update("strongThreshold", v)} />
            <Control id="threshold-promising" label="ارزش بررسی دارد" detail="حداقل امتیاز برای آگهی‌هایی که ارزش بررسی بیشتر دارند." value={config.promisingThreshold} unit="از ۱۰۰" onChange={(v) => update("promisingThreshold", v)} />
            <Control id="threshold-fair" label="قیمت نسبتاً منصفانه" detail="حداقل امتیاز دسته میانی؛ امتیازهای پایین‌تر در دسته «ارزش خرید پایین» قرار می‌گیرند." value={config.fairThreshold} unit="از ۱۰۰" onChange={(v) => update("fairThreshold", v)} />
          </section>

          <button className="workshop-copy" type="button" onClick={copyConfiguration}>کپی تنظیمات برای جلسه</button>
          <div className="workshop-live" aria-live="polite">{copyStatus || `تنظیم آزمایشی روی ${formatNumber(data.total)} آگهی اعمال شد`}</div>
        </aside>

        <div className="workshop-results">
          {!thresholdsValid && <div className="workshop-warning" role="alert">حد نصاب‌ها باید از «فرصت خرید بسیار خوب» تا «قیمت نسبتاً منصفانه» به‌ترتیب کمتر شوند.</div>}
          <section className="workshop-panel workshop-guide" aria-labelledby="score-guide-title">
            <div className="workshop-panel__head"><div><span>راهنمای جلسه</span><h2 id="score-guide-title">این امتیاز چگونه ساخته می‌شود؟</h2></div><strong>۰ تا ۱۰۰</strong></div>
            <div className="workshop-guide__grid">
              <article><b>۱. مناسب‌بودن قیمت</b><p>قیمت آگهی با قیمت برآوردی، آگهی‌های مشابه و قیمت‌های همان محله سنجیده می‌شود.</p></article>
              <article><b>۲. ویژگی‌های ملک</b><p>محاسبه از ۵۰ شروع می‌شود؛ امکانات و ویژگی‌های مثبت اضافه و کاستی‌ها کم می‌شوند.</p></article>
              <article><b>۳. امتیاز محله</b><p>امتیاز خودکار محله یا عددی که مدیر بر اساس شناخت بازار وارد کرده است، استفاده می‌شود.</p></article>
              <article><b>۴. اعتماد و ریسک</b><p>در پایان، کمبود داده یا نشانه‌های ریسک می‌تواند امتیاز ترکیبی را کاهش دهد.</p></article>
            </div>
          </section>
          <section className="workshop-stats">
            <MiniStat label="میانگین امتیاز آزمایشی" value={formatNumber(scenario.summary.average)} detail={`میانه: ${formatNumber(scenario.summary.median)}`} />
            <MiniStat label="تغییر دسته" value={formatNumber(scenario.summary.bandChanges)} detail="آگهی نسبت به امتیاز فعلی" tone={T.orange} />
            <MiniStat label="تغییر در ۱۰ رتبه اول" value={formatNumber(scenario.summary.topTenChanges)} detail="آگهی تازه‌وارد به ۱۰ رتبه اول" tone={T.primaryPale} />
            <MiniStat label="فرصت خرید بسیار خوب" value={formatNumber(scenario.summary.strong)} detail={`${formatNumber(scenario.summary.promising)} آگهی ارزش بررسی دارد`} tone={T.green} />
          </section>

          <section className="workshop-panel workshop-distribution">
            <div className="workshop-panel__head"><div><span>اثر تنظیم آزمایشی</span><h2>پراکندگی امتیازهای جدید</h2></div><small>امتیاز ترکیبی ← تعدیل اعتماد ← کاهش ریسک</small></div>
            <Distribution histogram={scenario.histogram} />
            <div className="workshop-band-summary">
              {[["strong-value",scenario.summary.strong],["promising",scenario.summary.promising],["fair",scenario.summary.fair],["weak-value",scenario.summary.weak]].map(([band,count]) =>
                <span key={band}><i style={{ background: BAND_COLORS[band] }} />{BAND_LABELS[band]} <b>{formatNumber(count)}</b></span>)}
            </div>
          </section>

          <section className="workshop-panel">
            <div className="workshop-panel__head"><div><span>شناخت محدوده</span><h2>امتیاز محله‌ها</h2></div><small>قابل اصلاح توسط مدیر · از ۱۰۰</small></div>
            <p className="workshop-help">امتیاز پیشنهادی هر محله از سطح معمول قیمت هر متر و تعداد آگهی‌های قابل‌استفاده آن ساخته می‌شود. برای محله‌هایی که آگهی کمی دارند، عدد به امتیاز میانه ۵۰ نزدیک‌تر می‌ماند. عددی که مدیر وارد کند جای امتیاز پیشنهادی را می‌گیرد.</p>
            <div className="neighborhood-score-grid">
              {neighborhoodRows.map((item) => <label key={item.name}>
                <span><b>{item.name}</b><small>{formatNumber(item.count)} آگهی · {formatMoney(item.medianPricePerMeter)} / متر</small></span>
                <input type="number" min="0" max="100" value={config.neighborhoodScores?.[item.name] ?? item.score}
                  onChange={(event) => updateNeighborhood(item.name, Math.max(0, Math.min(100, Number(event.target.value))))} />
              </label>)}
            </div>
          </section>

          <section className="workshop-panel">
            <div className="workshop-table-head"><div><span>رتبه‌بندی زنده</span><h2>اثر تنظیم‌ها بر هر آگهی</h2></div>
              <label><span className="sr-only">جستجوی آگهی</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="عنوان، محله یا توکن…" /></label></div>
            <div className="workshop-table-wrap"><table className="workshop-table">
              <thead><tr><th>رتبه</th><th>آگهی</th><th>مناسب‌بودن قیمت</th><th>ویژگی‌های ملک</th><th>امتیاز محله</th><th>اعتماد به داده</th><th>ریسک ارزیابی</th><th>امتیاز فعلی</th><th>امتیاز آزمایشی</th><th>تغییر رتبه</th></tr></thead>
              <tbody>{shownRows.map((row) => { const movement = row.rank - row.scenario.rank; return <tr key={row.token}>
                <td><strong>{formatNumber(row.scenario.rank)}</strong></td>
                <td><a href={`/listing/${row.token}`}><b>{row.title}</b><small>{row.neighborhood} · {formatMoney(row.askingPrice)}</small></a></td>
                <td>{formatNumber(row.scenario.dealValue)}</td><td><details className="property-breakdown"><summary>{formatNumber(row.scenario.property.score)}</summary>
                  <div>{Object.entries(row.scenario.property.contributions).map(([key,value]) => <span key={key}>{FACTOR_LABELS[key] || key}: <b>{value > 0 ? "+" : ""}{formatNumber(value)}</b></span>)}</div></details></td>
                <td>{formatNumber(row.scenario.neighborhoodScore)}</td>
                <td>{formatNumber(row.scores.confidence)}</td><td>{formatNumber(row.scores.risk)}</td><td>{formatNumber(row.scores.recommendation)}</td>
                <td><b className="workshop-score" style={{ color: BAND_COLORS[row.scenario.band] }}>{formatNumber(row.scenario.recommendation)}</b><small>{BAND_LABELS[row.scenario.band]}</small></td>
                <td className={movement > 0 ? "movement-up" : movement < 0 ? "movement-down" : ""}>{movement > 0 ? "+" : ""}{formatNumber(movement)}</td>
              </tr>; })}</tbody>
            </table></div>
            <p className="workshop-table-note">برای عملکرد بهتر، این جدول ۱۰۰ نتیجه اولِ فیلتر جاری را نشان می‌دهد؛ محاسبات خلاصه روی همه آگهی‌ها انجام شده است.</p>
          </section>
        </div>
      </div>
    </main>
    <AppFooter disclaimer="این صفحه فقط برای آزمایش و گفت‌وگو درباره مدل امتیازدهی است؛ تغییرها در اطلاعات اصلی ذخیره نمی‌شوند." />
  </div>;
}
