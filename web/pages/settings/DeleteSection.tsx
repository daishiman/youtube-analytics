// 設定画面「データを削除」区画（危険操作）。テナント名で確認し、削除依頼を予約する
import { useState } from "react";
import { api } from "../../api";
import { formatDateTime } from "../../components/AppShell";
import { ConfirmDialog } from "../../components/ConfirmDialog";
import { SectionCard } from "../../components/SectionCard";
import { useToast } from "../../components/Toast";
import { errorText } from "../shell-context";

export function DeleteSection({
  tenantName,
  deletion,
  canManage,
  onChanged,
}: {
  tenantName: string;
  deletion: { dueAt: string } | null;
  canManage: boolean;
  onChanged: () => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const toast = useToast();

  async function remove(confirmName: string) {
    setError("");
    setBusy(true);
    try {
      const { dueAt } = await api<{ dueAt: string }>("/api/tenant/delete", {
        method: "POST",
        body: { confirmName },
      });
      setOpen(false);
      toast(`削除依頼を受け付けました。削除期限: ${formatDateTime(dueAt)}`);
      await onChanged();
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <SectionCard
      id="delete"
      title="データを削除"
      tone="danger"
      description="保存したデータ（指標・レポート・画像）の削除依頼を受け付けます。自動削除の実行は準備中です"
    >
      {deletion ? (
        <p className="alert">
          削除依頼を受け付けています。削除期限: {formatDateTime(deletion.dueAt)}。
          完了確認はプライバシーポリシー記載の運営者へご連絡ください。
        </p>
      ) : canManage ? (
        <button
          type="button"
          className="button danger-solid"
          onClick={() => {
            setError("");
            setOpen(true);
          }}
        >
          データを削除
        </button>
      ) : (
        <p className="small muted">削除はワークスペースのオーナーが行います。</p>
      )}
      <ConfirmDialog
        open={open}
        title="データを削除"
        confirmLabel="削除する"
        confirmText={tenantName}
        danger
        busy={busy}
        error={error}
        onConfirm={(typed) => void remove(typed)}
        onCancel={() => setOpen(false)}
      >
        <p>「{tenantName}」の保存データの削除を依頼します。この依頼は取り消せません。</p>
      </ConfirmDialog>
    </SectionCard>
  );
}
