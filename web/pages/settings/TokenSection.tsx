// 設定画面「Claude Code連携トークン」区画。発行時の平文は1回だけ表示する

import { type FormEvent, useState } from "react";
import { TENANT_LABEL } from "../../../src/domain/labels";
import { api, type SkillToken } from "../../api";
import { formatDate, formatDateTime } from "../../components/AppShell";
import { ConfirmDialog } from "../../components/ConfirmDialog";
import { type Column, DataTable } from "../../components/DataTable";
import { SectionCard } from "../../components/SectionCard";
import { useToast } from "../../components/Toast";
import { errorText } from "../shell-context";

interface IssuedToken {
  tokenId: string;
  name: string;
  token: string;
  createdAt: string;
}

export function TokenSection({
  tokens,
  tokenLimit,
  canWrite,
  onChanged,
}: {
  tokens: SkillToken[];
  tokenLimit: number;
  canWrite: boolean;
  onChanged: () => Promise<void>;
}) {
  const [name, setName] = useState("");
  const [issued, setIssued] = useState<IssuedToken | null>(null);
  const [revoking, setRevoking] = useState<SkillToken | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const toast = useToast();

  async function issue(event: FormEvent) {
    event.preventDefault();
    setError("");
    setBusy(true);
    try {
      const result = await api<IssuedToken>("/api/skill-tokens", {
        method: "POST",
        body: { name: name.trim() },
      });
      setIssued(result);
      setName("");
      await onChanged();
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  }

  async function revoke(token: SkillToken) {
    setError("");
    setBusy(true);
    try {
      await api(`/api/skill-tokens/${token.token_id}`, { method: "DELETE" });
      setRevoking(null);
      if (issued?.tokenId === token.token_id) setIssued(null);
      toast(`「${token.name}」を失効しました。`);
      await onChanged();
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  }

  const columns: Column<SkillToken>[] = [
    { key: "name", label: "名前", render: (t) => t.name },
    { key: "created", label: "作成日", render: (t) => formatDate(t.created_at) },
    { key: "used", label: "最終使用", render: (t) => formatDateTime(t.last_used_at) },
    {
      key: "ops",
      label: "操作",
      render: (t) =>
        canWrite ? (
          <button
            type="button"
            className="button danger"
            aria-label={`${t.name} を失効`}
            disabled={busy}
            onClick={() => setRevoking(t)}
          >
            失効
          </button>
        ) : (
          "—"
        ),
    },
  ];

  return (
    <SectionCard
      id="tokens"
      title="Claude Code連携トークン"
      description={`Claude Code のスキルからこの${TENANT_LABEL}のデータを読むための鍵です。1人${tokenLimit}本まで発行できます。`}
    >
      <DataTable
        caption="発行済みトークン"
        columns={columns}
        rows={tokens}
        rowKey={(t) => t.token_id}
        empty="発行済みのトークンはありません"
      />
      {canWrite && (
        <form className="row" onSubmit={issue}>
          <input
            required
            maxLength={40}
            value={name}
            disabled={busy}
            onChange={(event) => setName(event.target.value)}
            placeholder="トークンの名前（例: 自宅のMac）"
            aria-label="トークンの名前"
          />
          <button type="submit" className="button primary" disabled={busy || !name.trim()}>
            新しいトークンを発行
          </button>
        </form>
      )}
      {error && (
        <p role="alert" className="alert">
          {error}
        </p>
      )}
      {issued && (
        <div className="issued">
          <p>
            「{issued.name}」のトークン（<strong>この画面を離れると二度と表示できません</strong>）:
          </p>
          <input
            readOnly
            value={issued.token}
            aria-label="発行したトークン"
            onFocus={(event) => event.target.select()}
          />
          <button
            type="button"
            className="button"
            onClick={() => {
              void navigator.clipboard?.writeText(issued.token);
              toast("トークンをコピーしました。");
            }}
          >
            コピー
          </button>
        </div>
      )}
      <ConfirmDialog
        open={revoking !== null}
        title="トークンを失効"
        confirmLabel="失効する"
        danger
        busy={busy}
        error={error}
        onConfirm={() => revoking && void revoke(revoking)}
        onCancel={() => setRevoking(null)}
      >
        <p>
          「{revoking?.name}」を失効します。このトークンを使うスキルは読み取りできなくなります。
        </p>
      </ConfirmDialog>
    </SectionCard>
  );
}
