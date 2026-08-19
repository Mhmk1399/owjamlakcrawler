import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import AnalyticsDashboard from "./AnalyticsDashboard.jsx";
import ScoreDetailPage from "./ScoreDetailPage.jsx";
import ScoringAnalyticsPage from "./ScoringAnalyticsPage.jsx";
import "./styles.css";

function AppRouter() {
  const path = window.location.pathname.replace(/\/$/, "") || "/";
  if (path === "/score-analytics") return <ScoringAnalyticsPage />;
  const listing = path.match(/^\/listing\/([A-Za-z0-9_-]+)$/);
  if (listing) return <ScoreDetailPage token={listing[1]} />;
  return <AnalyticsDashboard />;
}

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <AppRouter />
  </StrictMode>,
);
