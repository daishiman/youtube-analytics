// 設定画面「メンバー」区画（オーナーだけに表示）。メンバー一覧・役割変更・外す・招待
import { type FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { api, type Member, type PendingInvite, ROLE_LABELS, type Role } from "../../api";
import { formatDate } from "../../components/AppShell";
import { ConfirmDialog } from "../../components/ConfirmDialog";
import { SectionCard } from "../../components/SectionCard";
import { errorText, type ShellContext } from "../shell-context";

interface TenantResources {
  status: "loading" | "ready" | "error";
  members: Member[];
  invites: PendingInvite[];
  error: string;
}

function isAbortError(err: unknown): boolean {
  return err instanceof DOMException && err.name === "AbortError";
}

function useTenantResources(tenantId: string, isOwner: boolean) {
  const generation = useRef(0);
  const abortController = useRef<AbortController | null>(null);
  const [resources, setResources] = useState<TenantResources>({
    status: "loading",
    members: [],
    invites: [],
    error: "",
  });

  const load = useCallback(async () => {
    const requestGeneration = generation.current + 1;
    generation.current = requestGeneration;
    abortController.current?.abort();
    const controller = new AbortController();
    abortController.current = controller;
    setResources({ status: "loading", members: [], invites: [], error: "" });

    try {
      const base = `/api/tenants/${tenantId}`;
      const [memberResponse, inviteResponse] = await Promise.all([
        api<{ members: Member[] }>(`${base}/members`, { signal: controller.signal }),
        isOwner
          ? api<{ invites: PendingInvite[] }>(`${base}/invites`, { signal: controller.signal })
          : Promise.resolve({ invites: [] }),
      ]);
      if (generation.current !== requestGeneration || controller.signal.aborted) return;
      setResources({
        status: "ready",
        members: memberResponse.members,
        invites: inviteResponse.invites,
        error: "",
      });
    } catch (err) {
      if (
        generation.current !== requestGeneration ||
        controller.signal.aborted ||
        isAbortError(err)
      ) {
        return;
      }
      setResources({ status: "error", members: [], invites: [], error: errorText(err) });
    }
  }, [isOwner, tenantId]);

  useEffect(() => {
    void load();
    return () => {
      generation.current += 1;
      abortController.current?.abort();
    };
  }, [load]);

  return { ...resources, load };
}

export function MemberSection({
  me,
  reload,
  tenant,
}: ShellContext & { tenant: NonNullable<ShellContext["me"]["currentTenant"]> }) {
  const base = `/api/tenants/${tenant.tenantId}`;
  const resources = useTenantResources(tenant.tenantId, true);
  const [mutationError, setMutationError] = useState("");
  const [mutating, setMutating] = useState(false);
  const [hasLoadedResources, setHasLoadedResources] = useState(false);
  const [removing, setRemoving] = useState<Member | null>(null);

  useEffect(() => {
    if (resources.status === "ready") setHasLoadedResources(true);
  }, [resources.status]);

  async function run(action: () => Promise<void>, after: () => Promise<void>) {
    setMutationError("");
    setMutating(true);
    try {
      await action();
      await after();
    } catch (err) {
      setMutationError(errorText(err));
    } finally {
      setMutating(false);
    }
  }

  function changeMemberRole(member: Member, role: Role) {
    void run(
      async () => {
        await api(`${base}/members/${member.user_id}`, { method: "PATCH", body: { role } });
      },
      // 自分の権限変更は親の認可 context を先に確定する。古い owner 権限で invite を再取得しない。
      member.user_id === me.user.userId ? reload : resources.load,
    );
  }

  const error = mutationError || resources.error;
  const controlsDisabled = mutating || resources.status === "loading";

  return (
    <SectionCard
      id="members"
      title={`メンバー（${tenant.name}）`}
      description="役割の変更・メンバーの削除・招待ができます。"
    >
      {error && (
        <p role="alert" className="alert">
          {error}
        </p>
      )}
      {resources.status === "loading" && (
        <p className="muted" role="status">
          メンバーを読み込んでいます…
        </p>
      )}
      {resources.status === "error" && (
        <button type="button" className="button" onClick={() => void resources.load()}>
          再試行
        </button>
      )}
      {resources.status === "ready" && (
        <div className="table-wrap">
          <table className="data-table">
            <caption className="visually-hidden">メンバー一覧</caption>
            <thead>
              <tr>
                <th scope="col">メールアドレス</th>
                <th scope="col">役割</th>
                <th scope="col">参加日</th>
                <th scope="col">操作</th>
              </tr>
            </thead>
            <tbody>
              {resources.members.map((member) => (
                <tr key={member.user_id}>
                  <td data-label="メールアドレス">
                    {member.email}
                    {member.user_id === me.user.userId && <span className="muted">（自分）</span>}
                  </td>
                  <td data-label="役割">
                    <select
                      aria-label={`${member.email} の役割`}
                      value={member.role}
                      disabled={controlsDisabled}
                      onChange={(event) => changeMemberRole(member, event.target.value as Role)}
                    >
                      {(["owner", "editor", "viewer"] as Role[]).map((role) => (
                        <option key={role} value={role}>
                          {ROLE_LABELS[role]}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td data-label="参加日">{formatDate(member.joined_at)}</td>
                  <td data-label="操作">
                    {member.user_id !== me.user.userId && (
                      <button
                        type="button"
                        className="button danger"
                        disabled={controlsDisabled}
                        onClick={() => setRemoving(member)}
                      >
                        外す
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {hasLoadedResources && (
        <InviteSection
          key={tenant.tenantId}
          tenantId={tenant.tenantId}
          base={base}
          invites={resources.invites}
          onChange={resources.load}
          disabled={mutating}
        />
      )}

      <ConfirmDialog
        open={removing !== null}
        title="メンバーを外す"
        confirmLabel="外す"
        danger
        busy={mutating}
        onConfirm={() => {
          const target = removing;
          if (!target) return;
          setRemoving(null);
          void run(async () => {
            await api(`${base}/members/${target.user_id}`, { method: "DELETE" });
          }, resources.load);
        }}
        onCancel={() => setRemoving(null)}
      >
        <p>{removing?.email} をこのワークスペースから外します。</p>
      </ConfirmDialog>
    </SectionCard>
  );
}

function InviteSection({
  tenantId,
  base,
  invites,
  onChange,
  disabled,
}: {
  tenantId: string;
  base: string;
  invites: PendingInvite[];
  onChange: () => Promise<void>;
  disabled: boolean;
}) {
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<Role>("viewer");
  const [issued, setIssued] = useState<{
    tenantId: string;
    url: string;
    expiresAt: string;
  } | null>(null);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      const result = await api<{ url: string; expiresAt: string }>(`${base}/invites`, {
        method: "POST",
        body: { email, role },
      });
      setIssued({ tenantId, ...result });
      setEmail("");
      await onChange();
    } catch (err) {
      setError(errorText(err));
    } finally {
      setSubmitting(false);
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

  const busy = disabled || submitting;
  const issuedForCurrentTenant = issued?.tenantId === tenantId ? issued : null;

  return (
    <div className="subsection">
      <h3>メンバーを招待</h3>
      <p className="muted">
        招待リンクは7日間・1回だけ有効です。招待したメールアドレスの Google
        アカウントでのみ参加できます。
      </p>
      <form className="row" onSubmit={submit}>
        <input
          type="email"
          required
          value={email}
          disabled={busy}
          onChange={(event) => setEmail(event.target.value)}
          placeholder="招待するメールアドレス"
          aria-label="招待するメールアドレス"
        />
        <select
          aria-label="招待する役割"
          value={role}
          disabled={busy}
          onChange={(event) => setRole(event.target.value as Role)}
        >
          <option value="editor">{ROLE_LABELS.editor}</option>
          <option value="viewer">{ROLE_LABELS.viewer}</option>
        </select>
        <button type="submit" className="button primary" disabled={busy}>
          招待リンクを発行
        </button>
      </form>
      {error && (
        <p role="alert" className="alert">
          {error}
        </p>
      )}
      {issuedForCurrentTenant && (
        <div className="issued">
          <p>招待リンク（この画面を閉じると再表示できません）:</p>
          <input
            readOnly
            value={issuedForCurrentTenant.url}
            aria-label="発行した招待リンク"
            onFocus={(event) => event.target.select()}
          />
          <button
            type="button"
            className="button"
            onClick={() => void navigator.clipboard?.writeText(issuedForCurrentTenant.url)}
          >
            コピー
          </button>
        </div>
      )}
      <h4>未使用の招待</h4>
      {invites.length === 0 ? (
        <p className="muted">ありません</p>
      ) : (
        <ul className="list">
          {invites.map((invite) => (
            <li key={invite.invite_id}>
              <span>
                {invite.email}（{ROLE_LABELS[invite.role]}・期限 {formatDate(invite.expires_at)}）
              </span>
              <button
                type="button"
                className="button danger"
                disabled={busy}
                onClick={() => void revoke(invite.invite_id)}
              >
                取り消す
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
