// ①依頼: 期間・補足指示・「Claude Code用プロンプトをコピー」（この画面で唯一の主ボタン）と、右に使用するデータ
import { useCallback, useState } from "react";
import { countChars, INSTRUCTION_MAX } from "../../../src/domain/analysis";
import { type AnalysisRequest, analysisApi, type DataSummary } from "../../api";
import { Modal } from "../../components/Modal";
import { PeriodSelector } from "../../components/PeriodSelector";
import { SectionCard } from "../../components/SectionCard";
import { formatDay, usePeriod } from "../../period";
import { errorText } from "../shell-context";
import { useLoad } from "./hooks";
import { ManualCopy, usePromptCopy } from "./PromptCopy";

export function RequestPanel({
  canWrite,
  onCreated,
}: {
  canWrite: boolean;
  onCreated: (request: AnalysisRequest) => void;
}) {
  const { period, setPeriod } = usePeriod();
  const { copyPrompt: copyRequestPrompt, manual, dismissManual } = usePromptCopy();
  const [instruction, setInstruction] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  // 上限はサーバと同じく countChars（サロゲートペアを1文字）で数える。maxLength は UTF-16 単位なので使わない
  const tooLong = countChars(instruction) > INSTRUCTION_MAX;

  async function copyPrompt() {
    if (busy || tooLong) return;
    setBusy(true);
    setError("");
    try {
      const request = await analysisApi.createRequest({
        period_start: period.start,
        period_end: period.end,
        instruction: instruction.trim(),
      });
      onCreated(request);
      await copyRequestPrompt(
        request.requestId,
        `依頼 ${request.requestId} を作り、プロンプトをコピーしました。Claude Code に貼り付けてください。`,
        true,
      );
      setInstruction("");
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <SectionCard id="analysis-request" title="① 依頼">
      <div className="analysis-request-grid">
        <div className="stack">
          <PeriodSelector variant="analysis" period={period} setPeriod={setPeriod} />
          <label className="field">
            <span>補足指示（任意）</span>
            <textarea
              value={instruction}
              rows={3}
              placeholder="例: 先週サムネイルを変えた動画の反応を重点的に見てください"
              aria-describedby={tooLong ? "instruction-error" : undefined}
              aria-invalid={tooLong ? true : undefined}
              onChange={(e) => setInstruction(e.target.value)}
              disabled={!canWrite}
            />
            <span className="muted counter" aria-live="polite">
              {countChars(instruction)}/{INSTRUCTION_MAX}
            </span>
          </label>
          {tooLong && (
            <p id="instruction-error" role="alert" className="alert">
              補足指示は{INSTRUCTION_MAX}文字以内にしてください
            </p>
          )}
          {canWrite ? (
            <button
              type="button"
              className="button primary"
              onClick={() => void copyPrompt()}
              disabled={busy || tooLong || period.error !== null}
            >
              {busy ? "準備しています…" : "Claude Code用プロンプトをコピー"}
            </button>
          ) : (
            <p className="muted">閲覧者は依頼を作れません。一覧・詳細・比較だけを見られます。</p>
          )}
          {error && (
            <p role="alert" className="alert">
              {error}
            </p>
          )}
          {manual && <ManualCopy {...manual} onClose={dismissManual} />}
          <p className="muted note">
            データは自動送信されません。コピーしたプロンプトをClaude
            Codeに貼り付けて実行してください。
          </p>
        </div>
        <DataSummaryCard from={period.start} to={period.end} />
      </div>
    </SectionCard>
  );
}

/** 日別指標とコメントは対象期間の件数。動画・字幕・場面画像・CSV取込は期間で絞らない全期間の件数 */
const COUNT_ROWS: { key: keyof DataSummary["counts"]; label: string; unit: string }[] = [
  { key: "dailyMetrics", label: "日別指標", unit: "行" },
  { key: "videos", label: "動画（全期間）", unit: "本" },
  { key: "transcripts", label: "字幕（全期間）", unit: "本" },
  { key: "sceneImages", label: "場面画像（全期間）", unit: "枚" },
  { key: "comments", label: "コメント", unit: "件" },
];

const countText = (n: number | null | undefined, unit: string) =>
  n === null || n === undefined ? "未取得" : `${n.toLocaleString("ja-JP")}${unit}`;

function DataSummaryCard({ from, to }: { from: string; to: string }) {
  const fetchSummary = useCallback(
    (signal: AbortSignal) => analysisApi.getDataSummary(from, to, signal),
    [from, to],
  );
  const { data, error } = useLoad(fetchSummary);
  const [open, setOpen] = useState(false);

  return (
    <section className="data-summary" aria-labelledby="data-summary-heading">
      <h3 id="data-summary-heading">使用するデータ</h3>
      {error && (
        <p role="alert" className="alert">
          {error}
        </p>
      )}
      <dl className="kv">
        <div className="kv-row">
          <dt>対象期間</dt>
          <dd>
            {formatDay(from)}〜{formatDay(to)}
          </dd>
        </div>
        {COUNT_ROWS.map((r) => (
          <div key={r.key} className="kv-row">
            <dt>{r.label}</dt>
            <dd>{data ? countText(data.counts[r.key], r.unit) : "…"}</dd>
          </div>
        ))}
        <div className="kv-row">
          <dt>CSV取込（全期間）</dt>
          <dd>{data ? countText(data.csvImports?.total, "件") : "…"}</dd>
        </div>
      </dl>
      <button type="button" className="button" onClick={() => setOpen(true)} disabled={!data}>
        使用データを確認
      </button>
      <Modal
        open={open}
        title="使用データの内訳"
        onClose={() => setOpen(false)}
        closeLabel="閉じる"
      >
        {data && <DataSummaryDetail data={data} />}
      </Modal>
    </section>
  );
}

function DataSummaryDetail({ data }: { data: DataSummary }) {
  return (
    <div className="stack">
      <p>
        チャンネル: {data.channel ? data.channel.title : "未連携"}（{formatDay(data.period.start)}〜
        {formatDay(data.period.end)}）
      </p>
      <h3>CSV取込の内訳（全期間）</h3>
      <Breakdown groups={data.csvImports?.byKind} unit="件" empty="CSV 取込はありません" />
      <h3>エクスポート行の内訳</h3>
      <Breakdown
        groups={data.exportRows?.bySource}
        unit="行"
        empty="この期間のエクスポート行はありません"
      />
    </div>
  );
}

/** 内訳の一覧。表が無い（null）は「未取得」、0件は empty */
function Breakdown({
  groups,
  unit,
  empty,
}: {
  groups: { key: string; n: number }[] | undefined;
  unit: string;
  empty: string;
}) {
  if (groups === undefined) return <p className="muted">未取得</p>;
  if (groups.length === 0) return <p className="muted">{empty}</p>;
  return (
    <ul>
      {groups.map((k) => (
        <li key={k.key}>
          {k.key}: {countText(k.n, unit)}
        </li>
      ))}
    </ul>
  );
}
