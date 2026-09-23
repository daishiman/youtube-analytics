import { Link, useOutletContext } from "react-router";
import { ROLE_LABELS } from "../api";
import type { ShellContext } from "./shell-context";

export function DashboardPage() {
  const { me } = useOutletContext<ShellContext>();
  const tenant = me.currentTenant;
  if (!tenant) return null;

  return (
    <section className="card">
      <h1>{tenant.name}</h1>
      <p>
        あなたの役割: <strong>{ROLE_LABELS[tenant.role]}</strong>
      </p>
      <p className="muted">
        分析画面は今後の機能追加で表示されます。メンバーの確認・招待は
        <Link to="/settings">設定</Link>から行えます。
      </p>
    </section>
  );
}
