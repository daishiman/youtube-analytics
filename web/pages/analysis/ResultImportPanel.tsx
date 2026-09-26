// ③左下: 結果の取り込み。取込先は選択中の依頼、未選択なら完了済みの依頼を1件作る（qa-092）
import { useState } from "react";
import { type AnalysisRequest, ApiError, analysisApi, type ImportedReport } from "../../api";
import { useToast } from "../../components/Toast";
import { errorText } from "../shell-context";
import { checkJson } from "./format";
import { isActive } from "./hooks";

export function ResultImportPanel({
  selectedRequest,
  onImported,
}: {
  selectedRequest: AnalysisRequest | null;
  onImported: (report: ImportedReport) => Promise<void>;
}) {
  const toast = useToast();
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<{ message: string; hint: string } | null>(null);
  const requestId = selectedRequest && isActive(selectedRequest) ? selectedRequest.requestId : null;

  async function submit() {
    if (busy) return;
    const check = checkJson(text);
    if (!check.ok) {
      setProblem({ message: check.message, hint: check.hint });
      return;
    }
    const pastedRequestId = check.value.request_id;
    if (requestId && pastedRequestId !== undefined && pastedRequestId !== requestId) {
      setProblem({
        message: `JSONの依頼ID（${String(pastedRequestId)}）と選択中の依頼 ${requestId} が異なります`,
        hint: "正しい依頼を選ぶか、JSONの request_id を選択中の依頼IDに直してください",
      });
      return;
    }
    if (!requestId && pastedRequestId !== undefined) {
      setProblem({
        message: `JSONに依頼ID（${String(pastedRequestId)}）が含まれています`,
        hint: "その待機中・実行中の依頼を選ぶか、JSONの request_id を削除してください",
      });
      return;
    }
    setBusy(true);
    setProblem(null);
    try {
      const body = requestId ? { ...check.value, request_id: requestId } : check.value;
      const report = await analysisApi.importResult(body);
      toast(
        report.requestCreated
          ? `結果を取り込み、依頼 ${report.requestId} を完了にしました（v${report.version}）。`
          : `依頼 ${report.requestId} の結果を取り込みました（v${report.version}）。`,
      );
      setText("");
      await onImported(report);
    } catch (err) {
      // 構文の誤り（行番号付き）は送る前に checkJson で止める。ここはサーバの文言とヒントのまま
      if (err instanceof ApiError) setProblem({ message: err.message, hint: err.hint });
      else setProblem({ message: errorText(err), hint: "" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="stack import-panel">
      <h3 id="import-heading">結果の取り込み</h3>
      <p className="muted">
        取込先:{" "}
        {requestId
          ? `選択中の依頼 ${requestId}`
          : selectedRequest
            ? `選択中の依頼 ${selectedRequest.requestId} は${selectedRequest.status}のため取込先にできません。結果を取り込むと、完了済みの依頼を1件作ります`
            : "依頼を選んでいないため、完了済みの依頼を1件作ります"}
      </p>
      <label className="field">
        <span className="visually-hidden">結果JSON</span>
        <textarea
          value={text}
          rows={6}
          spellCheck={false}
          className="mono"
          placeholder='{"version": 1, "title": "…", "brief": {}, …}'
          aria-describedby={problem ? "import-error" : undefined}
          aria-invalid={problem ? true : undefined}
          onChange={(e) => setText(e.target.value)}
        />
      </label>
      {problem && (
        <div id="import-error" role="alert" className="alert">
          <p>{problem.message}</p>
          {problem.hint && <p>{problem.hint}</p>}
        </div>
      )}
      <div className="row">
        <button type="button" className="button" onClick={() => void submit()} disabled={busy}>
          {busy ? "取り込んでいます…" : "結果を取り込む"}
        </button>
        <button
          type="button"
          className="button"
          onClick={() => {
            setText("");
            setProblem(null);
          }}
          disabled={busy}
        >
          クリア
        </button>
      </div>
    </div>
  );
}
