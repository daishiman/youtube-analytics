import { type FormEvent, useId, useState } from "react";
import { addDays, jstToday } from "../../src/domain/period";
import { periodError } from "../period";

/**
 * 任意期間の選択（開始日・終了日）。最長1年・未来日不可（今日は含めない＝昨日まで）。
 * AI分析の依頼欄とヘッダーの「任意」で同じ部品を使う
 */
export function DateRangePicker({
  initialFrom,
  initialTo,
  onApply,
  onCancel,
}: {
  initialFrom: string;
  initialTo: string;
  onApply: (range: { from: string; to: string }) => void;
  onCancel?: () => void;
}) {
  const [from, setFrom] = useState(initialFrom);
  const [to, setTo] = useState(initialTo);
  const [touched, setTouched] = useState(false);
  const errorId = useId();
  const today = jstToday();
  const max = addDays(today, -1);
  const error = periodError(from, to, today);

  function submit(event: FormEvent) {
    event.preventDefault();
    setTouched(true);
    if (!error) onApply({ from, to });
  }

  return (
    <form className="date-range" onSubmit={submit} noValidate>
      <div className="row">
        <label className="field">
          <span className="small">開始日</span>
          <input
            type="date"
            value={from}
            max={max}
            onChange={(e) => setFrom(e.target.value)}
            aria-describedby={touched && error ? errorId : undefined}
          />
        </label>
        <span aria-hidden="true">〜</span>
        <label className="field">
          <span className="small">終了日</span>
          <input
            type="date"
            value={to}
            max={max}
            onChange={(e) => setTo(e.target.value)}
            aria-describedby={touched && error ? errorId : undefined}
          />
        </label>
      </div>
      <p className="small muted">最長1年・昨日まで選べます</p>
      {touched && error && (
        <p id={errorId} role="alert" className="alert">
          {error}
        </p>
      )}
      <div className="row">
        {onCancel && (
          <button type="button" className="button" onClick={onCancel}>
            キャンセル
          </button>
        )}
        <button type="submit" className="button">
          この期間にする
        </button>
      </div>
    </form>
  );
}
