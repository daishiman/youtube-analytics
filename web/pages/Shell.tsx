// ログイン後のセッション境界。画面レイアウトは AppShell、テナント固有データは各画面に委譲する。
import { useCallback, useEffect, useState } from "react";
import { Outlet, useNavigate, useSearchParams } from "react-router";
import { ApiError, api, type Me, REDIRECT_MESSAGES } from "../api";
import { AppShell } from "../components/AppShell";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { CreateTenantForm } from "../components/CreateTenantForm";
import { Modal } from "../components/Modal";
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
  const [dialog, setDialog] = useState<"add" | "leave" | null>(null);
  const [leaveError, setLeaveError] = useState("");
  const [leaving, setLeaving] = useState(false);

  const reload = useCallback(async () => {
    setSession({ status: "loading" });
    try {
      const me = await api<Me>("/api/me");
      setActionError("");
      setSession({ status: "ready", me: { ...me, lastUpdatedAt: me.lastUpdatedAt ?? null } });
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

  async function leave(tenantId: string) {
    setLeaveError("");
    setLeaving(true);
    try {
      await api(`/api/tenants/${tenantId}/leave`, { method: "POST" });
      setDialog(null);
      navigate("/");
      await reload();
    } catch (err) {
      setLeaveError(errorText(err));
    } finally {
      setLeaving(false);
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
  const tenant = me.currentTenant;

  return (
    <AppShell
      me={me}
      notice={noticeText}
      error={actionError}
      switchingTenant={switchingTenant}
      onSwitchTenant={switchTenant}
      onLogout={logout}
      onAddTenant={() => setDialog("add")}
      onLeaveTenant={() => {
        setLeaveError("");
        setDialog("leave");
      }}
    >
      {switchingTenant ? (
        <p className="muted" role="status">
          ワークスペースを切り替えています…
        </p>
      ) : tenant ? (
        <Outlet key={tenant.tenantId} context={{ me, reload } satisfies ShellContext} />
      ) : (
        <NoTenant me={me} reload={reload} />
      )}

      <AddTenantDialog
        open={dialog === "add"}
        signupClosed={me.signupClosed}
        onClose={() => setDialog(null)}
        onCreated={async () => {
          setDialog(null);
          await reload();
        }}
      />
      {tenant && (
        <ConfirmDialog
          open={dialog === "leave"}
          title="このワークスペースから脱退"
          confirmLabel="脱退する"
          danger
          busy={leaving}
          error={leaveError}
          onConfirm={() => void leave(tenant.tenantId)}
          onCancel={() => setDialog(null)}
        >
          <p>「{tenant.name}」から脱退します。再び参加するにはオーナーからの招待が必要です。</p>
        </ConfirmDialog>
      )}
    </AppShell>
  );
}

/** ヘッダーのメニューから開く「テナントを追加」 */
function AddTenantDialog({
  open,
  signupClosed,
  onClose,
  onCreated,
}: {
  open: boolean;
  signupClosed: boolean;
  onClose: () => void;
  onCreated: () => Promise<void>;
}) {
  return (
    <Modal open={open} title="ワークスペースを追加" onClose={onClose}>
      {signupClosed ? (
        <p className="alert">現在新規の受付を停止しています。</p>
      ) : (
        <CreateTenantForm onCreated={onCreated} />
      )}
      <div className="row dialog-actions">
        <button type="button" className="button" onClick={onClose}>
          閉じる
        </button>
      </div>
    </Modal>
  );
}

/** 所属テナントなし: 受付停止中ならその旨、そうでなければ自分のテナントを作る */
function NoTenant({ me, reload }: ShellContext) {
  return (
    <section className="card">
      <h1>所属しているワークスペースがありません</h1>
      {me.signupClosed ? (
        <p className="alert">
          現在新規の受付を停止しています。既存ワークスペースのオーナーから招待を受けてください。
        </p>
      ) : (
        <>
          <p className="muted">招待を受けるか、自分のワークスペースを作成してください。</p>
          <CreateTenantForm onCreated={reload} />
        </>
      )}
    </section>
  );
}
