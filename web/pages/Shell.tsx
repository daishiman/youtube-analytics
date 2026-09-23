// ログイン後のセッション境界。画面レイアウトとテナント固有データは別 component に委譲する。
import { useCallback, useEffect, useState } from "react";
import { Outlet, useNavigate, useSearchParams } from "react-router";
import { ApiError, api, type Me, REDIRECT_MESSAGES } from "../api";
import { CreateTenantForm } from "../components/CreateTenantForm";
import { ShellFrame } from "../components/ShellFrame";
import { errorText, type ShellContext } from "./shell-context";

type SessionLoadState =
  | { status: "loading" }
  | { status: "ready"; me: Me }
  | { status: "error"; message: string };

export function Shell() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [session, setSession] = useState<SessionLoadState>({ status: "loading" });
  const [actionError, setActionError] = useState("");
  const [switchingTenant, setSwitchingTenant] = useState(false);

  const reload = useCallback(async () => {
    setSession({ status: "loading" });
    try {
      const me = await api<Me>("/api/me");
      setActionError("");
      setSession({ status: "ready", me });
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        navigate("/login", { replace: true });
        return;
      }
      setSession({ status: "error", message: errorText(err) });
    }
  }, [navigate]);

  useEffect(() => {
    void reload();
  }, [reload]);

  async function switchTenant(tenantId: string) {
    setActionError("");
    setSwitchingTenant(true);
    try {
      await api("/api/session/tenant", { method: "POST", body: { tenantId } });
      await reload();
    } catch (err) {
      setActionError(errorText(err));
    } finally {
      setSwitchingTenant(false);
    }
  }

  async function logout() {
    setActionError("");
    try {
      await api("/api/auth/logout", { method: "POST" });
      navigate("/login");
    } catch (err) {
      setActionError(errorText(err));
    }
  }

  if (session.status === "loading") return <p className="page muted">読み込み中…</p>;
  if (session.status === "error") {
    return (
      <main className="page">
        <p role="alert" className="alert">
          {session.message}
        </p>
        <button type="button" className="button primary" onClick={() => void reload()}>
          再試行
        </button>
      </main>
    );
  }

  const { me } = session;
  const notice = params.get("notice");
  const noticeText = notice ? REDIRECT_MESSAGES[notice] : undefined;

  return (
    <ShellFrame
      me={me}
      notice={noticeText}
      error={actionError}
      switchingTenant={switchingTenant}
      onSwitchTenant={switchTenant}
      onLogout={logout}
    >
      {switchingTenant ? (
        <p className="muted" role="status">
          テナントを切り替えています…
        </p>
      ) : me.currentTenant ? (
        <Outlet key={me.currentTenant.tenantId} context={{ me, reload } satisfies ShellContext} />
      ) : (
        <NoTenant me={me} reload={reload} />
      )}
    </ShellFrame>
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
