import { PSYCH_LAYERS } from "../../../../src/domain/report-schema";
import type { ReportDetail } from "../../../api";
import { StatusBadge } from "../../../components/StatusBadge";
import { plain } from "../format";

/** 視聴者心理（推定）の小枠。考え→感情→行動を1行ずつ・推定バッジ・確信度% */
export function PsychBox({ detail }: { detail: ReportDetail }) {
  const rows = PSYCH_LAYERS.map((layer) => detail.psych.find((p) => p.layer === layer)).filter(
    (p) => p !== undefined,
  );
  const shown = rows.length ? rows : detail.psych.slice(0, 3);
  return (
    <section className="psych-box" aria-labelledby="psych-box-heading">
      <h4 id="psych-box-heading">
        視聴者心理（推定） <StatusBadge tone="warn">推定</StatusBadge>
      </h4>
      {shown.length ? (
        <ul>
          {shown.map((p) => (
            <li key={p.no}>
              <strong>{p.layer}</strong>: {p.claim}（確信度 {Math.round(p.confidence * 100)}%）
            </li>
          ))}
        </ul>
      ) : (
        <p className="muted">この版に心理の推定はありません</p>
      )}
    </section>
  );
}

export function PsychTab({ detail }: { detail: ReportDetail }) {
  if (!detail.psych.length) return <p className="muted">この版に心理の推定はありません</p>;
  return (
    <ul className="stack">
      {detail.psych.map((p) => (
        <li key={p.no} className="card-lite">
          <p>
            <strong>{p.layer}</strong> <StatusBadge tone="warn">推定</StatusBadge> 確信度{" "}
            {Math.round(p.confidence * 100)}%
          </p>
          <p>{p.claim}</p>
          <p className="muted">根拠: {plain(p.evidence)}</p>
          {p.counterHypothesis && <p className="muted">対立仮説: {p.counterHypothesis}</p>}
        </li>
      ))}
    </ul>
  );
}
