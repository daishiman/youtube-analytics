// 要約タブ。先頭に「前回からの変化」→週次5段ファネル→対象週の診断→下流結果→最大の改善候補を置き、
// 因果を断定しない。表の中身は history-review.ts の変換関数だけが作る
import type { ReportDetail } from "../../../api";
import { type Column, DataTable } from "../../../components/DataTable";
import { StatusBadge } from "../../../components/StatusBadge";
import {
  candidateText,
  type DiagnosisRow,
  diagnosisNote,
  diagnosisRows,
  downstreamItems,
  WEEKLY_METRICS,
  type WeeklyRow,
  weeklyRows,
} from "../history-review";
import { ActionChecklist } from "./ActionChecklist";
import { ChangesSincePrevious } from "./ChangesSincePrevious";
import { PsychBox } from "./PsychTab";
import { VersionHistory } from "./VersionHistory";

const WEEKLY_COLUMNS: Column<WeeklyRow>[] = [
  { key: "week", label: "週", render: (r) => r.week },
  ...WEEKLY_METRICS.map(({ metric, label }) => ({
    key: metric,
    label,
    render: (r: WeeklyRow) => r.values[metric],
  })),
];

const DIAGNOSIS_COLUMNS: Column<DiagnosisRow>[] = [
  { key: "stage", label: "段", render: (r) => r.stage },
  {
    key: "label",
    label: "指標",
    render: (r) => (
      <>
        {r.label}
        {r.candidate && <StatusBadge tone="warn">改善候補</StatusBadge>}
      </>
    ),
  },
  { key: "actual", label: "実績", render: (r) => r.actual },
  { key: "target", label: "目標", render: (r) => r.target },
  { key: "gap", label: "目標比", render: (r) => r.gap },
  { key: "pending", label: "判定保留の理由", render: (r) => r.pending },
];

export function SummaryTab({
  detail,
  canWrite,
  onRegistered,
  onOpenVersion,
}: {
  detail: ReportDetail;
  canWrite: boolean;
  onRegistered: () => void;
  onOpenVersion: (reportId: string, version: number) => void;
}) {
  const note = diagnosisNote(detail.results);
  const downstream = downstreamItems(detail.results);
  const top = detail.findings.slice(0, 3);
  return (
    <div className="stack">
      <ChangesSincePrevious detail={detail} />
      <section aria-labelledby="funnel-heading">
        <h4 id="funnel-heading">週次ファネル</h4>
        <DataTable
          caption="週次ファネル"
          columns={WEEKLY_COLUMNS}
          rows={weeklyRows(detail.results)}
          rowKey={(r) => r.week}
          empty="この版にファネルの記録はありません"
        />
      </section>
      <section aria-labelledby="diagnosis-heading">
        <h4 id="diagnosis-heading">対象週の診断{note.week && `（${note.week}週）`}</h4>
        <DataTable
          caption="対象週の原因指標ごとの診断"
          columns={DIAGNOSIS_COLUMNS}
          rows={diagnosisRows(detail.results)}
          rowKey={(r) => r.metric}
          empty="この版に診断の記録はありません"
        />
        {note.pending.length > 0 && (
          <p className="muted small">判定保留: {note.pending.join("・")}</p>
        )}
      </section>
      <section aria-labelledby="downstream-heading">
        <h4 id="downstream-heading">下流結果</h4>
        {downstream.length ? (
          <dl className="meta">
            {downstream.map((d) => (
              <div key={d.key}>
                <dt>{d.label}</dt>
                <dd>{d.value}</dd>
              </div>
            ))}
          </dl>
        ) : (
          <p>記録なし</p>
        )}
      </section>
      <section aria-labelledby="candidate-heading" className="candidate">
        <h4 id="candidate-heading">最大の改善候補</h4>
        <p>{candidateText(detail.results, detail.outcome)}</p>
        <p className="muted">{detail.conclusion}</p>
        <p className="muted small">※ 相関にもとづく推定で、因果を断定するものではありません。</p>
      </section>
      <section aria-labelledby="findings-heading">
        <h4 id="findings-heading">主な発見</h4>
        {top.length ? (
          <ol>
            {top.map((f) => (
              <li key={f.no}>
                <strong>{f.title}</strong>
                {f.fact && <span> — {f.fact}</span>}
                {f.verdict && <StatusBadge tone="neutral">{f.verdict}</StatusBadge>}
              </li>
            ))}
          </ol>
        ) : (
          <p className="muted">発見の記録はありません</p>
        )}
      </section>
      <PsychBox detail={detail} />
      <ActionChecklist detail={detail} canWrite={canWrite} onRegistered={onRegistered} />
      <VersionHistory detail={detail} onOpenVersion={onOpenVersion} />
    </div>
  );
}
