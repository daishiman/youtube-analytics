// ②実行状況: ID・ステータス・対象期間・作成日時・進捗・依頼内容・操作（qa-089）。
// 待機中・実行中=キャンセル（確認付き）/ 完了=詳細 / 失敗・取消=再実行（同じ条件で新しいID）
import { useState } from "react";
import { CREATED_VIA_LABELS, isActiveStatus, STAGE_LABELS } from "../../../src/domain/analysis";
import { type AnalysisRequest, analysisApi } from "../../api";
import { formatDateTime } from "../../components/AppShell";
import { ConfirmDialog } from "../../components/ConfirmDialog";
import { type Column, DataTable } from "../../components/DataTable";
import { ProgressBar } from "../../components/ProgressBar";
import { SectionCard } from "../../components/SectionCard";
import { StatusBadge } from "../../components/StatusBadge";
import { useToast } from "../../components/Toast";
import { errorText } from "../shell-context";
import { formatRange, progressTone, STATUS_TONE } from "./format";
import { ManualCopy, usePromptCopy } from "./PromptCopy";

export function RequestStatusTable({
  items,
  error,
  canWrite,
  selectedId,
  onSelect,
  onOpenReport,
  onChanged,
}: {
  items: AnalysisRequest[] | null;
  error: string;
  canWrite: boolean;
  selectedId: string | null;
  onSelect: (request: AnalysisRequest) => void;
  onOpenReport: (request: AnalysisRequest) => void;
  onChanged: (request?: AnalysisRequest) => Promise<void>;
}) {
  const toast = useToast();
  const { copyPrompt, manual, dismissManual } = usePromptCopy();
  const [canceling, setCanceling] = useState<AnalysisRequest | null>(null);
  const [busy, setBusy] = useState(false);
  const [dialogError, setDialogError] = useState("");
  const [rowError, setRowError] = useState("");
  const [copyingId, setCopyingId] = useState<string | null>(null);
  const [retryingId, setRetryingId] = useState<string | null>(null);

  async function cancel() {
    if (!canceling) return;
    setBusy(true);
    setDialogError("");
    try {
      const updated = await analysisApi.cancel(canceling.requestId);
      toast(`依頼 ${updated.requestId} を取り消しました。`);
      setCanceling(null);
      await onChanged(updated);
    } catch (err) {
      setDialogError(errorText(err));
    } finally {
      setBusy(false);
    }
  }

  async function retry(request: AnalysisRequest) {
    if (retryingId) return;
    setRetryingId(request.requestId);
    setRowError("");
    try {
      const created = await analysisApi.retry(request.requestId);
      await onChanged(created);
      await copyExisting(created, true);
    } catch (err) {
      setRowError(errorText(err));
    } finally {
      setRetryingId(null);
    }
  }

  async function copyExisting(request: AnalysisRequest, retried = false) {
    if (copyingId) return;
    setCopyingId(request.requestId);
    setRowError("");
    try {
      await copyPrompt(
        request.requestId,
        retried
          ? `同じ条件で依頼 ${request.requestId} を作り、プロンプトをコピーしました。Claude Code に貼り付けてください。`
          : `依頼 ${request.requestId} のプロンプトをコピーしました。Claude Code に貼り付けてください。`,
        retried,
      );
    } catch (err) {
      setRowError(
        `依頼 ${request.requestId} のプロンプトを取得できませんでした。行の「プロンプトをコピー」から再試行してください。${errorText(err)}`,
      );
    } finally {
      setCopyingId(null);
    }
  }

  const columns: Column<AnalysisRequest>[] = [
    {
      key: "id",
      label: "ID",
      render: (r) => (
        <button
          type="button"
          className="link-button"
          aria-current={r.requestId === selectedId ? "true" : undefined}
          onClick={() => onSelect(r)}
        >
          {r.requestId}
        </button>
      ),
    },
    {
      key: "status",
      label: "ステータス",
      render: (r) => (
        <span className="row tight">
          <StatusBadge tone={STATUS_TONE[r.status]}>{r.status}</StatusBadge>
          {r.createdVia === "skill" && (
            <StatusBadge tone="neutral">{CREATED_VIA_LABELS.skill}</StatusBadge>
          )}
        </span>
      ),
    },
    { key: "period", label: "対象期間", render: (r) => formatRange(r.periodStart, r.periodEnd) },
    { key: "created", label: "作成日時", render: (r) => formatDateTime(r.createdAt) },
    {
      key: "progress",
      label: "進捗",
      render: (r) => (
        <ProgressBar
          value={r.progress}
          label={`${r.requestId} の進捗${r.stage ? `（${STAGE_LABELS[r.stage]}）` : ""}`}
          tone={progressTone(r.status)}
        />
      ),
    },
    {
      key: "instruction",
      label: "依頼内容",
      render: (r) => (
        <span className="clamp">
          {r.instruction || "（補足指示なし）"}
          {r.status === "失敗" && r.error && (
            <span className="request-error">
              <br />
              原因: {r.error}
              <br />
              対処:
              同じ条件で再実行してください。続けて失敗するときは設定画面でトークンと連携状態を確かめてください。
            </span>
          )}
        </span>
      ),
    },
    {
      key: "ops",
      label: "操作",
      render: (r) => rowAction(r),
    },
  ];

  function rowAction(request: AnalysisRequest) {
    if (request.status === "完了")
      return (
        <button
          type="button"
          className="button small"
          onClick={() => onOpenReport(request)}
          disabled={!request.reportId}
        >
          詳細
        </button>
      );
    if (!canWrite) return <span className="muted">—</span>;
    if (isActiveStatus(request.status))
      return (
        <span className="row tight wrap">
          {request.createdVia === "web" && (
            <button
              type="button"
              className="button small"
              onClick={() => void copyExisting(request)}
              disabled={copyingId !== null}
            >
              プロンプトをコピー
            </button>
          )}
          <button
            type="button"
            className="button small"
            onClick={() => {
              setDialogError("");
              setCanceling(request);
            }}
          >
            キャンセル
          </button>
        </span>
      );
    return (
      <button
        type="button"
        className="button small"
        onClick={() => void retry(request)}
        disabled={retryingId !== null}
      >
        {retryingId === request.requestId ? "再実行中…" : "再実行"}
      </button>
    );
  }

  return (
    <SectionCard id="analysis-status" title="② 実行状況">
      {error && (
        <p role="alert" className="alert">
          {error}
        </p>
      )}
      {rowError && (
        <p role="alert" className="alert">
          {rowError}
        </p>
      )}
      {items === null ? (
        <p className="muted">読み込み中…</p>
      ) : (
        <DataTable
          caption="分析依頼の実行状況"
          columns={columns}
          rows={items}
          rowKey={(r) => r.requestId}
          empty="まだ依頼はありません。① 依頼からプロンプトをコピーしてください。"
        />
      )}
      {manual && <ManualCopy {...manual} onClose={dismissManual} />}
      <ConfirmDialog
        open={canceling !== null}
        title="依頼を取り消しますか？"
        confirmLabel="取り消す"
        danger
        busy={busy}
        error={dialogError}
        onConfirm={() => void cancel()}
        onCancel={() => setCanceling(null)}
      >
        <p>
          依頼 {canceling?.requestId}
          を取り消します。以後、この依頼への進捗更新と結果送信は受け付けません。すでに動いている
          Claude Code
          は自動では停止しません。取り消した依頼は元に戻せません（再実行で新しい依頼を作れます）。
        </p>
      </ConfirmDialog>
    </SectionCard>
  );
}
