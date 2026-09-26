// ログイン後の全画面に共通の枠（サイドバー＋ヘッダー＋本文＋フッター）。qa-074・qa-075
// 900px 未満はサイドバーのナビを画面下部のタブへ切り替える

import { type ReactNode, useEffect, useRef, useState } from "react";
import { NavLink, useLocation } from "react-router";
import { TENANT_LABEL } from "../../src/domain/labels";
import { type Me, ROLE_LABELS } from "../api";
import { formatDateTime } from "../format";
import { usePeriod } from "../period";
import { Alert } from "./Alert";
import { type IconName, NavIcon } from "./NavIcon";
import { PeriodSelector } from "./PeriodSelector";
import { SiteFooter } from "./SiteFooter";

export const NAV_ITEMS: { to: string; label: string; icon: IconName; comingSoon?: boolean }[] = [
  { to: "/", label: "ダッシュボード", icon: "home" },
  { to: "/videos", label: "動画", icon: "video", comingSoon: true },
  { to: "/analysis", label: "AI分析", icon: "chart" },
  { to: "/actions", label: "改善アクション", icon: "bulb", comingSoon: true },
  { to: "/settings", label: "設定", icon: "gear" },
];

export function screenName(pathname: string): string {
  const hit = NAV_ITEMS.find((item) =>
    item.to === "/" ? pathname === "/" : pathname.startsWith(item.to),
  );
  return hit?.label ?? "";
}

// 範囲外の設定画面（TokenSection・MemberSection）がここから読むため再公開する
export { formatDate, formatDateTime } from "../format";

interface ShellActions {
  onLogout: () => Promise<void>;
  onAddTenant: () => void;
  onLeaveTenant: () => void;
}

interface AppShellProps extends ShellActions {
  me: Me;
  notice?: string;
  error: string;
  switchingTenant: boolean;
  onSwitchTenant: (tenantId: string) => Promise<void>;
  children: ReactNode;
}

export function AppShell({
  me,
  notice,
  error,
  switchingTenant,
  onSwitchTenant,
  children,
  ...actions
}: AppShellProps) {
  const shellRef = useRef<HTMLDivElement>(null);
  const sidebarRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const shell = shellRef.current;
    const sidebar = sidebarRef.current;
    const header = shell?.querySelector<HTMLElement>(".app-header");
    const nav = sidebar?.querySelector<HTMLElement>(".main-nav");
    if (!shell || !sidebar || !header || !nav) return;
    // 下部タブ（900px未満）はラベルが折り返すと高くなる。Shell の外にあるトーストも使うので root に置く
    const root = document.documentElement;
    const updateOffset = () => {
      shell.style.setProperty(
        "--mobile-sidebar-height",
        `${sidebar.getBoundingClientRect().height}px`,
      );
      shell.style.setProperty("--app-header-height", `${header.getBoundingClientRect().height}px`);
      root.style.setProperty("--mobile-nav-height", `${nav.getBoundingClientRect().height}px`);
    };
    const observer = new ResizeObserver(updateOffset);
    observer.observe(sidebar);
    observer.observe(header);
    observer.observe(nav);
    updateOffset();
    return () => {
      observer.disconnect();
      root.style.removeProperty("--mobile-nav-height");
    };
  }, []);

  return (
    <div className="shell" ref={shellRef}>
      <aside className="sidebar" ref={sidebarRef}>
        <NavLink className="brand" to="/" aria-label="Channel Insight ホーム">
          Channel Insight
        </NavLink>
        {me.tenants.length > 0 && (
          <label className="field">
            <span className="small muted">{TENANT_LABEL}</span>
            <select
              aria-label={`${TENANT_LABEL}切替`}
              value={me.currentTenant?.tenantId ?? ""}
              disabled={switchingTenant}
              onChange={(event) => void onSwitchTenant(event.target.value)}
            >
              {!me.currentTenant && <option value="">選択してください</option>}
              {me.tenants.map((tenant) => (
                <option key={tenant.tenantId} value={tenant.tenantId}>
                  {tenant.name}（{ROLE_LABELS[tenant.role]}）
                </option>
              ))}
            </select>
          </label>
        )}
        <nav className="main-nav" aria-label="メイン">
          {NAV_ITEMS.map((item) => (
            <NavLink key={item.to} to={item.to} end={item.to === "/"}>
              <NavIcon name={item.icon} />
              <span>{item.label}</span>
              {item.comingSoon && <span className="nav-coming-soon">準備中</span>}
            </NavLink>
          ))}
        </nav>
      </aside>
      <div className="main-column">
        <AppHeader me={me} {...actions} />
        <main className="content">
          <Alert>{notice}</Alert>
          <Alert>{error}</Alert>
          {children}
        </main>
        <SiteFooter />
      </div>
    </div>
  );
}

function AppHeader({ me, ...actions }: ShellActions & { me: Me }) {
  const { pathname } = useLocation();
  const { period, setPeriod } = usePeriod();

  return (
    <header className="app-header">
      <p className="header-title">{screenName(pathname)}</p>
      <p className="header-updated small muted">
        <span>基本日次の最終成功</span>
        <span>{formatDateTime(me.lastUpdatedAt)}</span>
      </p>
      {/* 期間は ?period= で全画面共有。ほかのクエリ（?request= など）は残す。 */}
      <PeriodSelector variant="header" period={period} setPeriod={setPeriod} />
      <AccountMenu me={me} {...actions} />
    </header>
  );
}

function AccountMenu({ me, onLogout, onAddTenant, onLeaveTenant }: ShellActions & { me: Me }) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (event: MouseEvent) => {
      if (!box.current?.contains(event.target as Node)) setOpen(false);
    };
    const esc = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", esc);
    };
  }, [open]);

  const pick = (action: () => void) => () => {
    setOpen(false);
    action();
  };

  return (
    <div className="account-menu" ref={box}>
      <button
        type="button"
        className="avatar-button"
        aria-label="アカウントメニュー"
        aria-expanded={open}
        aria-haspopup="menu"
        onClick={() => setOpen((v) => !v)}
      >
        <span className="avatar" aria-hidden="true">
          {me.user.email.slice(0, 1).toUpperCase()}
        </span>
      </button>
      {open && (
        <div className="menu" role="menu" aria-label="アカウントメニュー">
          <p className="small muted menu-email">{me.user.email}</p>
          <button type="button" role="menuitem" onClick={pick(onAddTenant)}>
            {TENANT_LABEL}を追加
          </button>
          {me.currentTenant && (
            <button type="button" role="menuitem" onClick={pick(onLeaveTenant)}>
              この{TENANT_LABEL}から脱退
            </button>
          )}
          <button type="button" role="menuitem" onClick={pick(() => void onLogout())}>
            ログアウト
          </button>
        </div>
      )}
    </div>
  );
}
