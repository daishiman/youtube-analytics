// 画面下部の選択中の依頼バー（ID・依頼内容・進捗バー・%・「詳細を開く」）。900px 未満では下部タブの上に固定
import type { AnalysisRequest } from "../../api";
import { ProgressBar } from "../../components/ProgressBar";
import { StatusBadge } from "../../components/StatusBadge";
import { progressTone, STATUS_TONE } from "./format";
import { isActive } from "./hooks";

export function SelectionBar({
  request,
  onOpen,
}: {
  request: AnalysisRequest | null;
  onOpen: (request: AnalysisRequest) => void;
}) {
  return (
    <aside className="selection-bar" aria-label="選択中の依頼">
      {request ? (
        <>
          <strong>{request.requestId}</strong>
          <StatusBadge tone={STATUS_TONE[request.status]}>{request.status}</StatusBadge>
          <span className="selection-text">{request.instruction || "（補足指示なし）"}</span>
          <span className="muted small">{isActive(request) ? "取込先" : "取込不可"}</span>
          <ProgressBar
            value={request.progress}
            label={`${request.requestId} の進捗`}
            tone={progressTone(request.status)}
          />
          <button
            type="button"
            className="button small"
            onClick={() => onOpen(request)}
            disabled={!request.reportId}
          >
            詳細を開く
          </button>
        </>
      ) : (
        <span className="muted">依頼を選ぶと、ここに進捗が出ます</span>
      )}
    </aside>
  );
}
