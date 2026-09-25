import { useState } from "react";
import { formatDay, PERIODS, type Period, type PeriodKey } from "../period";
import { DateRangePicker } from "./DateRangePicker";
import { Modal } from "./Modal";

type SetPeriod = (key: PeriodKey, range?: { from: string; to: string }) => void;

/** ヘッダーと分析依頼で共有する期間操作。表示位置に応じてラベルだけ変える。 */
export function PeriodSelector({
  variant,
  period,
  setPeriod,
}: {
  variant: "header" | "analysis";
  period: Period;
  setPeriod: SetPeriod;
}) {
  const [picking, setPicking] = useState(false);
  const buttons = PERIODS.map((p) => (
    <button
      key={p.key}
      type="button"
      className={period.key === p.key ? "active" : undefined}
      aria-pressed={period.key === p.key}
      onClick={() => (p.key === "custom" ? setPicking(true) : setPeriod(p.key))}
    >
      {variant === "analysis" && p.key !== "custom" ? `最新${p.label}` : p.label}
    </button>
  ));

  return (
    <>
      {variant === "header" ? (
        <nav className="period-tabs" aria-label="期間">
          {buttons}
        </nav>
      ) : (
        <fieldset className="field">
          <legend>分析対象期間</legend>
          <div className="segment">{buttons}</div>
          <p className="muted" data-testid="analysis-period">
            {formatDay(period.start)}〜{formatDay(period.end)}
          </p>
          {period.error && (
            <p role="alert" className="alert">
              {period.error}。最新28日で表示しています。
            </p>
          )}
        </fieldset>
      )}
      <Modal open={picking} title="期間を選ぶ" onClose={() => setPicking(false)}>
        <DateRangePicker
          initialFrom={period.start}
          initialTo={period.end}
          onCancel={() => setPicking(false)}
          onApply={(range) => {
            setPeriod("custom", range);
            setPicking(false);
          }}
        />
      </Modal>
    </>
  );
}
