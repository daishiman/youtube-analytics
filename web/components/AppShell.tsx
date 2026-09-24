// ログイン後の全画面に共通の枠（サイドバー＋ヘッダー＋本文＋フッター）。qa-062・qa-063
// 900px 未満はサイドバーのナビを画面下部のタブへ切り替える
import { type ReactNode, useEffect, useRef, useState } from "react";
import { Link, NavLink, useLocation, useSearchParams } from "react-router";
import { type Me, ROLE_LABELS } from "../api";
import { type IconName, NavIcon } from "./NavIcon";
import { SiteFooter } from "./SiteFooter";

export const NAV_ITEMS: { to: string; label: string; icon: IconName }[] = [
  { to: "/", label: "ダッシュボード", icon: "home" },
  { to: "/videos", label: "動画", icon: "video" },
  { to: "/analysis", label: "AI分析", icon: "chart" },
  { to: "/actions", label: "改善アクション", icon: "bulb" },
  { to: "/settings", label: "設定", icon: "gear" },
];

export const PERIODS = [
  { key: "28d", label: "28日" },
  { key: "90d", label: "90日" },
  { key: "1y", label: "1年" },
  { key: "custom", label: "任意" },
] as const;

export function screenName(pathname: string): string {
  const hit = NAV_ITEMS.find((item) =>
    item.to === "/" ? pathname === "/" : pathname.startsWith(item.to),
  );
  return hit?.label ?? "";
}

/** 日時を JST で「2026年9月21日 10:24」の形に。値が無いときは「—」 */
export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return new Intl.DateTimeFormat("ja-JP", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);
}

/** 日付だけを JST で「2026/9/21」の形に */
export function formatDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return new Intl.DateTimeFormat("ja-JP", { timeZone: "Asia/Tokyo" }).format(d);
}

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
  return (
    <div className="shell">
      <aside className="sidebar">
        <NavLink className="brand" to="/" aria-label="YouTube分析 ホーム">
          YouTube分析
        </NavLink>
        {me.tenants.length > 0 && (
          <label className="field">
            <span className="small muted">ワークスペース</span>
            <select
              aria-label="ワークスペース切替"
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
            </NavLink>
          ))}
        </nav>
      </aside>
      <div className="main-column">
        <AppHeader me={me} {...actions} />
        <main className="content">
          {notice && (
            <p role="alert" className="alert">
              {notice}
            </p>
          )}
          {error && (
            <p role="alert" className="alert">
              {error}
            </p>
          )}
          {children}
        </main>
        <SiteFooter />
      </div>
    </div>
  );
}

function AppHeader({ me, ...actions }: ShellActions & { me: Me }) {
  const { pathname } = useLocation();
  const [params] = useSearchParams();
  const period = params.get("period") ?? "28d";

  return (
    <header className="app-header">
      <p className="header-title">{screenName(pathname)}</p>
      <p className="header-updated small muted">
        <span>最終更新</span>
        <span>{formatDateTime(me.lastUpdatedAt)}</span>
      </p>
      <nav className="period-tabs" aria-label="期間">
        {PERIODS.map((p) => (
          <Link
            key={p.key}
            to={`?period=${p.key}`}
            className={p.key === period ? "active" : undefined}
            aria-current={p.key === period ? "true" : undefined}
          >
            {p.label}
          </Link>
        ))}
      </nav>
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
            ワークスペースを追加
          </button>
          {me.currentTenant && (
            <button type="button" role="menuitem" onClick={pick(onLeaveTenant)}>
              このワークスペースから脱退
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
