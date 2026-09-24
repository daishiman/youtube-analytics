import type { ReactNode } from "react";
import { NavLink } from "react-router";
import { type Me, ROLE_LABELS } from "../api";

interface ShellFrameProps {
  me: Me;
  notice?: string;
  error: string;
  switchingTenant: boolean;
  onSwitchTenant: (tenantId: string) => Promise<void>;
  onLogout: () => Promise<void>;
  children: ReactNode;
}

export function ShellFrame({
  me,
  notice,
  error,
  switchingTenant,
  onSwitchTenant,
  onLogout,
  children,
}: ShellFrameProps) {
  return (
    <div className="shell">
      <aside className="sidebar">
        <NavLink className="brand" to="/" aria-label="Channel Insight ホーム">
          Channel Insight
        </NavLink>
        {me.tenants.length > 0 && (
          <label className="field">
            <span>テナント</span>
            <select
              aria-label="テナント切替"
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
        <nav>
          <NavLink to="/" end>
            ダッシュボード
          </NavLink>
          <NavLink to="/settings">設定</NavLink>
        </nav>
        <div className="account">
          <span className="muted small">{me.user.email}</span>
          <button type="button" className="button" onClick={() => void onLogout()}>
            ログアウト
          </button>
        </div>
      </aside>
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
    </div>
  );
}
