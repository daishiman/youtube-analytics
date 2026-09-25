import { useState } from "react";
import { analysisApi, type ReportDetail } from "../../../api";
import { StatusBadge } from "../../../components/StatusBadge";
import { useToast } from "../../../components/Toast";
import { errorText } from "../../shell-context";
import { formatMetric, metricLabel } from "../format";

/** 次に取るべきアクション。主対象1件を先頭・初期は主対象だけチェック（qa-091） */
export function ActionChecklist({
  detail,
  canWrite,
  onRegistered,
}: {
  detail: ReportDetail;
  canWrite: boolean;
  onRegistered: () => void;
}) {
  const toast = useToast();
  const actions = [...detail.actions].sort((a, b) => Number(b.primary) - Number(a.primary));
  const [checked, setChecked] = useState<Set<string>>(
    () => new Set(detail.actions.filter((a) => a.primary && !a.registered).map((a) => a.key)),
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function register() {
    if (busy || checked.size === 0) return;
    setBusy(true);
    setError("");
    try {
      const res = await analysisApi.registerActions(detail.reportId, [...checked]);
      toast(
        `改善アクションに ${res.created.length} 件登録しました${res.alreadyRegistered.length ? `（登録済み ${res.alreadyRegistered.length} 件）` : ""}。`,
      );
      setChecked(new Set());
      onRegistered();
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section aria-labelledby="actions-heading">
      <h4 id="actions-heading">次に取るべきアクション</h4>
      {actions.length === 0 ? (
        <p className="muted">この版にアクションはありません</p>
      ) : (
        <ul className="checklist">
          {actions.map((a) => (
            <li key={a.key}>
              {canWrite && !a.registered ? (
                <label className="check">
                  <input
                    type="checkbox"
                    checked={checked.has(a.key)}
                    onChange={(e) =>
                      setChecked((prev) => {
                        const next = new Set(prev);
                        if (e.target.checked) next.add(a.key);
                        else next.delete(a.key);
                        return next;
                      })
                    }
                  />
                  {actionText(a)}
                </label>
              ) : (
                <span className="check">
                  {actionText(a)}
                  {a.registered && <StatusBadge tone="ok">登録済み</StatusBadge>}
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
      {error && (
        <p role="alert" className="alert">
          {error}
        </p>
      )}
      {canWrite && actions.some((a) => !a.registered) && (
        <button
          type="button"
          className="button"
          onClick={() => void register()}
          disabled={busy || checked.size === 0}
        >
          改善アクションに登録
        </button>
      )}
    </section>
  );
}

function actionText(a: ReportDetail["actions"][number]) {
  const range =
    a.baselineValue !== null && a.targetValue !== null
      ? ` ${formatMetric(a.metric, a.baselineValue)}→${formatMetric(a.metric, a.targetValue)}`
      : "";
  return (
    <span>
      {a.primary && <StatusBadge tone="warn">主対象</StatusBadge>} {a.title}（{a.stage}・
      {metricLabel(a.metric)}
      {range}）
    </span>
  );
}
