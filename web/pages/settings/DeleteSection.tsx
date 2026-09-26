// 設定画面「データを削除」区画。名前で確定し、依頼直後に対象の利用を止める
import { useState } from "react";
import { TENANT_LABEL } from "../../../src/domain/labels";
import { api } from "../../api";
import { ConfirmDialog } from "../../components/ConfirmDialog";
import { SectionCard } from "../../components/SectionCard";
import { useToast } from "../../components/Toast";
import { formatDateTime } from "../../format";
import { errorText } from "../shell-context";

export function DeleteSection({
  tenantName,
  deletion,
  canManage,
  onDeleted,
}: {
  tenantName: string;
  deletion: { dueAt: string } | null;
  canManage: boolean;
  onDeleted: () => Promise<void>;
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
      await onDeleted();
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
      description={`依頼後すぐにこの${TENANT_LABEL}を利用できなくし、保存した指標・レポート・画像を7日以内に削除します`}
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
        <p className="small muted">削除は{TENANT_LABEL}のオーナーが行います。</p>
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
