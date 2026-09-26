import { useCallback, useState } from "react";
import { analysisApi, type ReportDetail, type ReportDiff } from "../../../api";
import { formatDateTime } from "../../../components/AppShell";
import { type Column, DataTable } from "../../../components/DataTable";
import { Modal } from "../../../components/Modal";
import { StatusBadge } from "../../../components/StatusBadge";
import { plain } from "../format";
import { candidateLabel } from "../history-review";
import { useLoad } from "../hooks";

/** レポートの版履歴（v3/v2/v1）と「2つの版を比較」 */
export function VersionHistory({
  detail,
  onOpenVersion,
}: {
  detail: ReportDetail;
  onOpenVersion: (reportId: string, version: number) => void;
}) {
  const versions = [...detail.versions].sort((a, b) => b.version - a.version);
  const [picked, setPicked] = useState<string[]>([]);
  const [comparing, setComparing] = useState(false);

  function toggle(id: string, on: boolean) {
    setPicked((prev) =>
      on ? [...prev.filter((p) => p !== id), id].slice(-2) : prev.filter((p) => p !== id),
    );
  }

  return (
    <section aria-labelledby="versions-heading">
      <h4 id="versions-heading">レポートの版履歴</h4>
      <ul className="version-list">
        {versions.map((v) => (
          <li key={v.reportId} className="row tight wrap">
            <label className="check">
              <input
                type="checkbox"
                aria-label={`v${v.version} を比較に使う`}
                checked={picked.includes(v.reportId)}
                onChange={(e) => toggle(v.reportId, e.target.checked)}
              />
            </label>
            <button
              type="button"
              className="link-button"
              aria-current={v.reportId === detail.reportId ? "true" : undefined}
              onClick={() => onOpenVersion(v.reportId, v.version)}
            >
              v{v.version}
            </button>
            <span className="muted">{formatDateTime(v.createdAt)}</span>
            {v.archived && <StatusBadge tone="neutral">アーカイブ</StatusBadge>}
          </li>
        ))}
      </ul>
      <button
        type="button"
        className="button"
        disabled={picked.length !== 2}
        onClick={() => setComparing(true)}
      >
        2つの版を比較
      </button>
      {picked.length !== 2 && <p className="muted small">比べる版を2つ選んでください</p>}
      {comparing && picked.length === 2 && (
        <VersionDiffModal
          a={picked[0] as string}
          b={picked[1] as string}
          onClose={() => setComparing(false)}
        />
      )}
    </section>
  );
}

type DiffSide = ReportDiff["a"];
type DiffKey = keyof ReportDiff["changed"];

/** 比べる項目（行見出し）と、各版の値の出し方 */
const DIFF_ROWS: { key: DiffKey; label: string; text: (side: DiffSide) => string }[] = [
  { key: "title", label: "レポート名", text: (s) => plain(s.title) },
  { key: "summary", label: "要約", text: (s) => plain(s.summary) },
  { key: "conclusion", label: "結論", text: (s) => plain(s.conclusion) },
  { key: "outcome", label: "判定", text: (s) => plain(s.outcome) },
  { key: "candidate", label: "改善候補", text: (s) => candidateLabel(s.candidate) },
];

function VersionDiffModal({ a, b, onClose }: { a: string; b: string; onClose: () => void }) {
  const fetchDiff = useCallback((signal: AbortSignal) => analysisApi.diff(a, b, signal), [a, b]);
  const { data: diff, error } = useLoad(fetchDiff);

  const [left, right] = diff ? [diff.a, diff.b].sort((x, y) => x.version - y.version) : [];
  const columns: Column<(typeof DIFF_ROWS)[number]>[] =
    diff && left && right
      ? [
          {
            key: "label",
            label: "項目",
            rowHeader: true,
            render: (r) => (
              <>
                {r.label}
                {diff.changed[r.key] && <StatusBadge tone="warn">変化</StatusBadge>}
              </>
            ),
          },
          { key: "left", label: `v${left.version}`, render: (r) => r.text(left) },
          { key: "right", label: `v${right.version}`, render: (r) => r.text(right) },
        ]
      : [];

  return (
    <Modal open title="2つの版を比較" onClose={onClose} closeLabel="閉じる">
      {error && (
        <p role="alert" className="alert">
          {error}
        </p>
      )}
      {!diff && !error && <p className="muted">読み込み中…</p>}
      {diff && columns.length > 0 && (
        <div className="stack">
          <DataTable
            caption="版の差分"
            className="diff-table"
            columns={columns}
            rows={DIFF_ROWS}
            rowKey={(r) => r.key}
            rowProps={(r) => ({ className: diff.changed[r.key] ? "changed" : undefined })}
            empty=""
          />
          <DiffList title="発見" added={diff.findings.added} removed={diff.findings.removed} />
          <DiffList title="アクション" added={diff.actions.added} removed={diff.actions.removed} />
        </div>
      )}
    </Modal>
  );
}

function DiffList({
  title,
  added,
  removed,
}: {
  title: string;
  added: string[];
  removed: string[];
}) {
  return (
    <section>
      <h4>{title}</h4>
      {added.length === 0 && removed.length === 0 ? (
        <p className="muted">変化なし</p>
      ) : (
        <ul>
          {added.map((t) => (
            <li key={`+${t}`}>＋ 追加: {t}</li>
          ))}
          {removed.map((t) => (
            <li key={`-${t}`}>− 削除: {t}</li>
          ))}
        </ul>
      )}
    </section>
  );
}
