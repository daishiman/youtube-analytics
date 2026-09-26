// React（Vite SPA・React Router）の入口（qa-061）。ナビの5画面は Shell（AppShell）配下。動画・改善アクションは後続 feature で中身を作る
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Route, Routes } from "react-router";
import { ToastProvider } from "./components/Toast";
import { AnalysisPage } from "./pages/AnalysisPage";
import { DashboardPage } from "./pages/DashboardPage";
import { InvitePage } from "./pages/InvitePage";
import { LoginPage } from "./pages/LoginPage";
import { PlaceholderPage } from "./pages/PlaceholderPage";
import { SettingsPage } from "./pages/SettingsPage";
import { Shell } from "./pages/Shell";
import "./styles.css";

const root = document.querySelector("#app");
if (root) {
  createRoot(root).render(
    <StrictMode>
      <ToastProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route path="/invite" element={<InvitePage />} />
            <Route element={<Shell />}>
              <Route index element={<DashboardPage />} />
              <Route
                path="videos"
                element={<PlaceholderPage title="動画" lead="動画ごとの指標を確認します" />}
              />
              <Route path="analysis" element={<AnalysisPage />} />
              <Route
                path="actions"
                element={<PlaceholderPage title="改善アクション" lead="次に試す改善を管理します" />}
              />
              <Route path="settings" element={<SettingsPage />} />
            </Route>
            <Route path="*" element={<p className="page">ページが見つかりません</p>} />
          </Routes>
        </BrowserRouter>
      </ToastProvider>
    </StrictMode>,
  );
}
