// ログイン後の外枠（テナント切替・ログアウト）と、ダッシュボード仮置き・設定（メンバー管理）
// 画面の出し分けは表示上の配慮だけで、権限の正本は API 側の requirePermission（A3 で検証）
import { type FormEvent, useCallback, useEffect, useState } from "react";
import {
  Link,
  NavLink,
  Outlet,
  useNavigate,
  useOutletContext,
  useSearchParams,
} from "react-router";
import {
  ApiError,
  api,
  type Me,
  type Member,
  type PendingInvite,
  REDIRECT_MESSAGES,
  ROLE_LABELS,
  type Role,
} from "../api";

interface ShellContext {
  me: Me;
  reload: () => Promise<void>;
}

const errorText = (err: unknown) =>
  err instanceof ApiError ? `${err.message}（${err.hint}）` : "処理に失敗しました。";

export function Shell() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [me, setMe] = useState<Me | null>(null);
  const [error, setError] = useState("");

  const reload = useCallback(async () => {
    try {
      setMe(await api<Me>("/api/me"));
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) navigate("/login", { replace: true });
      else setError(errorText(err));
    }
  }, [navigate]);

  useEffect(() => {
    void reload();
  }, [reload]);

  async function switchTenant(tenantId: string) {
    try {
      await api("/api/session/tenant", { method: "POST", body: { tenantId } });
      await reload();
    } catch (err) {
      setError(errorText(err));
    }
  }

  async function logout() {
    await api("/api/auth/logout", { method: "POST" });
    navigate("/login");
  }

  if (!me) return <p className="page muted">{error || "読み込み中…"}</p>;
  const notice = params.get("notice");

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand">YouTube分析</div>
        {me.tenants.length > 0 && (
          <label className="field">
            <span>テナント</span>
            <select
              aria-label="テナント切替"
              value={me.currentTenant?.tenantId ?? ""}
              onChange={(e) => void switchTenant(e.target.value)}
            >
              {!me.currentTenant && <option value="">選択してください</option>}
              {me.tenants.map((t) => (
                <option key={t.tenantId} value={t.tenantId}>
                  {t.name}（{ROLE_LABELS[t.role]}）
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
          <button type="button" className="button" onClick={logout}>
            ログアウト
          </button>
        </div>
      </aside>
      <main className="content">
        {notice && REDIRECT_MESSAGES[notice] && (
          <p role="alert" className="alert">
            {REDIRECT_MESSAGES[notice]}
          </p>
        )}
        {error && (
          <p role="alert" className="alert">
            {error}
          </p>
        )}
        {me.currentTenant ? (
          <Outlet context={{ me, reload } satisfies ShellContext} />
        ) : (
          <NoTenant me={me} reload={reload} />
        )}
      </main>
    </div>
  );
}

/** 所属テナントなし: 受付停止中ならその旨、そうでなければ自分のテナントを作る */
function NoTenant({ me, reload }: ShellContext) {
  return (
    <section className="card">
      <h1>所属しているテナントがありません</h1>
      {me.signupClosed ? (
        <p className="alert">
          現在新規の受付を停止しています。既存テナントのオーナーから招待を受けてください。
        </p>
      ) : (
        <>
          <p className="muted">招待を受けるか、自分のテナントを作成してください。</p>
          <CreateTenantForm onCreated={reload} />
        </>
      )}
    </section>
  );
}

function CreateTenantForm({ onCreated }: { onCreated: () => Promise<void> }) {
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  async function submit(e: FormEvent) {
    e.preventDefault();
    setError("");
    try {
      await api("/api/tenants", { method: "POST", body: { name } });
      setName("");
      await onCreated();
    } catch (err) {
      setError(errorText(err));
    }
  }
  return (
    <form className="row" onSubmit={submit}>
      <input
        required
        maxLength={60}
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="テナント名（1〜60文字）"
        aria-label="新しいテナント名"
      />
      <button type="submit" className="button primary">
        テナントを作成
      </button>
      {error && (
        <p role="alert" className="alert">
          {error}
        </p>
      )}
    </form>
  );
}

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

export function SettingsPage() {
  const { me, reload } = useOutletContext<ShellContext>();
  const tenant = me.currentTenant;
  const [members, setMembers] = useState<Member[]>([]);
  const [invites, setInvites] = useState<PendingInvite[]>([]);
  const [error, setError] = useState("");
  const isOwner = tenant?.role === "owner";
  const base = tenant ? `/api/tenants/${tenant.tenantId}` : "";

  const load = useCallback(async () => {
    if (!base) return;
    try {
      setMembers((await api<{ members: Member[] }>(`${base}/members`)).members);
      setInvites(
        isOwner ? (await api<{ invites: PendingInvite[] }>(`${base}/invites`)).invites : [],
      );
    } catch (err) {
      setError(errorText(err));
    }
  }, [base, isOwner]);

  useEffect(() => {
    void load();
  }, [load]);

  async function run(action: () => Promise<unknown>, after: () => Promise<void> = load) {
    setError("");
    try {
      await action();
      await after();
    } catch (err) {
      setError(errorText(err));
    }
  }

  if (!tenant) return null;
  return (
    <>
      <section className="card">
        <h1>メンバー（{tenant.name}）</h1>
        {error && (
          <p role="alert" className="alert">
            {error}
          </p>
        )}
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>メールアドレス</th>
                <th>役割</th>
                <th>参加日</th>
                {isOwner && <th>操作</th>}
              </tr>
            </thead>
            <tbody>
              {members.map((m) => (
                <tr key={m.user_id}>
                  <td>
                    {m.email}
                    {m.user_id === me.user.userId && <span className="muted">（自分）</span>}
                  </td>
                  <td>
                    {isOwner ? (
                      <select
                        aria-label={`${m.email} の役割`}
                        value={m.role}
                        onChange={(e) =>
                          void run(
                            () =>
                              api(`${base}/members/${m.user_id}`, {
                                method: "PATCH",
                                body: { role: e.target.value },
                              }),
                            async () => {
                              await load();
                              await reload();
                            },
                          )
                        }
                      >
                        {(["owner", "editor", "viewer"] as Role[]).map((r) => (
                          <option key={r} value={r}>
                            {ROLE_LABELS[r]}
                          </option>
                        ))}
                      </select>
                    ) : (
                      ROLE_LABELS[m.role]
                    )}
                  </td>
                  <td>{m.joined_at.slice(0, 10)}</td>
                  {isOwner && (
                    <td>
                      {m.user_id !== me.user.userId && (
                        <button
                          type="button"
                          className="button danger"
                          onClick={() => {
                            if (confirm(`${m.email} をテナントから外しますか？`))
                              void run(() =>
                                api(`${base}/members/${m.user_id}`, { method: "DELETE" }),
                              );
                          }}
                        >
                          外す
                        </button>
                      )}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <button
          type="button"
          className="button"
          onClick={() => {
            if (confirm(`「${tenant.name}」から脱退しますか？`))
              void run(() => api(`${base}/leave`, { method: "POST" }), reload);
          }}
        >
          このテナントから脱退する
        </button>
      </section>

      {isOwner && <InviteSection base={base} invites={invites} onChange={load} />}

      <section className="card">
        <h2>テナントを追加</h2>
        {me.signupClosed ? (
          <p className="alert">現在新規の受付を停止しています。</p>
        ) : (
          <CreateTenantForm onCreated={reload} />
        )}
      </section>
    </>
  );
}

function InviteSection({
  base,
  invites,
  onChange,
}: {
  base: string;
  invites: PendingInvite[];
  onChange: () => Promise<void>;
}) {
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<Role>("viewer");
  const [issued, setIssued] = useState<{ url: string; expiresAt: string } | null>(null);
  const [error, setError] = useState("");

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError("");
    try {
      const r = await api<{ url: string; expiresAt: string }>(`${base}/invites`, {
        method: "POST",
        body: { email, role },
      });
      setIssued(r);
      setEmail("");
      await onChange();
    } catch (err) {
      setError(errorText(err));
    }
  }

  async function revoke(inviteId: string) {
    setError("");
    try {
      await api(`${base}/invites/${inviteId}`, { method: "DELETE" });
      await onChange();
    } catch (err) {
      setError(errorText(err));
    }
  }

  return (
    <section className="card">
      <h2>メンバーを招待</h2>
      <p className="muted">
        招待リンクは7日間・1回だけ有効です。招待したメールアドレスの Google
        アカウントでのみ参加できます。
      </p>
      <form className="row" onSubmit={submit}>
        <input
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="招待するメールアドレス"
          aria-label="招待するメールアドレス"
        />
        <select
          aria-label="招待する役割"
          value={role}
          onChange={(e) => setRole(e.target.value as Role)}
        >
          <option value="editor">{ROLE_LABELS.editor}</option>
          <option value="viewer">{ROLE_LABELS.viewer}</option>
        </select>
        <button type="submit" className="button primary">
          招待リンクを発行
        </button>
      </form>
      {error && (
        <p role="alert" className="alert">
          {error}
        </p>
      )}
      {issued && (
        <div className="issued">
          <p>招待リンク（この画面を閉じると再表示できません）:</p>
          <input
            readOnly
            value={issued.url}
            aria-label="発行した招待リンク"
            onFocus={(e) => e.target.select()}
          />
          <button
            type="button"
            className="button"
            onClick={() => void navigator.clipboard?.writeText(issued.url)}
          >
            コピー
          </button>
        </div>
      )}
      <h3>未使用の招待</h3>
      {invites.length === 0 ? (
        <p className="muted">ありません</p>
      ) : (
        <ul className="list">
          {invites.map((i) => (
            <li key={i.invite_id}>
              <span>
                {i.email}（{ROLE_LABELS[i.role]}・期限 {i.expires_at.slice(0, 10)}）
              </span>
              <button
                type="button"
                className="button danger"
                onClick={() => void revoke(i.invite_id)}
              >
                取り消す
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
