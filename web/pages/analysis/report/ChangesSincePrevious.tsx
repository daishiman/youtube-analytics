import type { ReportDetail } from "../../../api";
import { StatusBadge } from "../../../components/StatusBadge";
import { changesView } from "../history-review";

/** 要約の先頭。参照した直近版・直前の版との比較・前回仮説の当否・施策効果。履歴0件は「初回分析」 */
export function ChangesSincePrevious({ detail }: { detail: ReportDetail }) {
  const view = changesView(detail.historyReview, detail.historyVersionsUsed);
  return (
    <section className="changes" aria-labelledby="changes-heading">
      <h4 id="changes-heading">前回からの変化</h4>
      {view.first ? (
        <p>
          <StatusBadge tone="neutral">初回分析</StatusBadge>{" "}
          比べられる過去の版がないため、今回が基準になります。
        </p>
      ) : (
        <ul>
          <li>参照した直近版: {view.versions}</li>
          {view.comparison && (
            <>
              <li>
                改善候補（v{view.comparison.version} と比較）: {view.comparison.candidate}
              </li>
              <li>下流の差: {view.comparison.downstream}</li>
            </>
          )}
          <li>
            前回仮説の当否:
            <NestedList items={view.hypotheses} />
          </li>
          <li>
            施策効果:
            <NestedList items={view.effects} />
          </li>
        </ul>
      )}
    </section>
  );
}

function NestedList({ items }: { items: string[] }) {
  if (items.length === 0) return " 記録なし";
  return (
    <ul>
      {items.map((item) => (
        <li key={item}>{item}</li>
      ))}
    </ul>
  );
}
