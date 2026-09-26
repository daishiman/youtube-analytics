// 設定画面「データ取込」区画。CSV / 字幕(SRT・VTT) / 画像 をタブで切り替え、直近20件の履歴を出す
import { useState } from "react";
import { IMPORT_RULES } from "../../../src/domain/import-rules";
import {
  apiForm,
  type CsvPreviewResponse,
  type ImportKind,
  type ImportRow,
  type StudioImportMapping,
} from "../../api";
import { Alert, Loading } from "../../components/Alert";
import { type Column, DataTable } from "../../components/DataTable";
import { DropZone } from "../../components/DropZone";
import { Pager } from "../../components/Pager";
import { SectionCard } from "../../components/SectionCard";
import { type BadgeTone, StatusBadge } from "../../components/StatusBadge";
import { useToast } from "../../components/Toast";
import { fmtNumber, formatDateTime } from "../../format";
import { useApi } from "../../useApi";
import { studioAnalyticsUrl } from "../../youtube-studio";
import { errorText } from "../shell-context";

interface KindRule {
  kind: ImportKind;
  label: string;
  description: string;
}

const KINDS: [KindRule, ...KindRule[]] = [
  {
    kind: "csv",
    label: "CSV",
    description: "YouTube Studio のCSV、または事業週次CSV",
  },
  {
    kind: "caption",
    label: "字幕(SRT・VTT)",
    description: "字幕ファイル",
  },
  {
    kind: "image",
    label: "画像",
    description: "サムネイルなどの画像",
  },
];

const STATUS_TONE: Record<ImportRow["status"], BadgeTone> = {
  完了: "ok",
  処理待ち: "neutral",
  失敗: "danger",
};

const COLUMNS: Column<ImportRow>[] = [
  { key: "file", label: "ファイル名", render: (r) => r.file_name },
  { key: "period", label: "期間", render: (r) => r.period ?? "—" },
  {
    key: "rows",
    label: "行数",
    render: (r) => fmtNumber(r.rows),
  },
  { key: "at", label: "取込日時", render: (r) => formatDateTime(r.created_at) },
  {
    key: "status",
    label: "状態",
    render: (r) => (
      <span className="status-cell">
        <StatusBadge tone={STATUS_TONE[r.status]}>
          {r.kind === "csv" && r.status === "処理待ち"
            ? "原本保存済み"
            : r.kind === "csv" && r.status === "完了" && typeof r.mapped_columns === "number"
              ? "既知列を取込"
              : r.status}
        </StatusBadge>
        {r.kind === "csv" && r.status === "処理待ち" && (
          <span className="small muted">指標への反映は未対応</span>
        )}
        {r.kind === "csv" && r.status === "完了" && typeof r.mapped_columns === "number" && (
          <span className="small muted">
            未対応 {r.unmapped_columns ?? 0}列・未解決 {r.unresolved_rows ?? 0}行
            {r.period_status === "unknown" && "・期間未確定"}
          </span>
        )}
        {r.error && <span className="small muted">{r.error}</span>}
      </span>
    ),
  },
];

/** CSV の取得元。連携中チャンネルの Studio 詳細モードを開くリンクと、書き出しの手順 */
function CsvSource({ channelId }: { channelId: string | null }) {
  if (!channelId) {
    return (
      <p className="small muted">
        取得元: YouTube Studio
        のアナリティクス。チャンネルを連携すると、そのチャンネルの画面を開くリンクをここに出します。
      </p>
    );
  }
  return (
    <div className="small import-source">
      取得元:{" "}
      <a href={studioAnalyticsUrl(channelId)} target="_blank" rel="noopener noreferrer">
        YouTube Studio のアナリティクス（詳細モード・直近4週間・動画別）
      </a>
      <br />
      <span className="muted">
        開いた画面の右上にある書き出しボタンから「カンマ区切り値（.csv）」を選んで保存し、ここへ取り込みます。チャンネルの持ち主の
        Google アカウントで開いてください。
      </span>
      <p className="muted">
        Studioの表データ・グラフデータ・合計は1ファイルずつ取り込めます。視聴回数とエンゲージ
        ビューが別のCSVに分かれていても、同じ動画・日付の値を保持します。表データのCSV本文には集計期間がないため、期間未確定として保存します。グラフデータにない動画は0件として補いません。
      </p>
      <p className="muted">
        事業週次CSVは <code>business-funnel-weekly.csv</code> を使用し、
        <code>
          week_start,channel_id,route_label,route_visits,inquiries,closed_deals,revenue_jpy
        </code>
        の列で取り込むと週次ファネルへ反映します。route_labelは省略できます。
      </p>
    </div>
  );
}

export function ImportSection({
  imports,
  channelId,
  canWrite,
  onChanged,
}: {
  imports: ImportRow[];
  /** 連携中チャンネルの ID。未連携は null（CSV の取得元リンクに使う） */
  channelId: string | null;
  canWrite: boolean;
  onChanged: () => Promise<void>;
}) {
  const [active, setActive] = useState<ImportKind>("csv");
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const [selectedCsv, setSelectedCsv] = useState<ImportRow | null>(null);
  const [previewOffset, setPreviewOffset] = useState(0);
  const [selectedMapping, setSelectedMapping] = useState<ImportRow | null>(null);
  const toast = useToast();
  const current = KINDS.find((k) => k.kind === active) ?? KINDS[0];
  const {
    data: preview,
    error: previewError,
    loading: previewLoading,
  } = useApi<CsvPreviewResponse>(
    selectedCsv
      ? `/api/imports/${encodeURIComponent(selectedCsv.import_id)}/preview?offset=${previewOffset}&limit=50`
      : null,
  );
  const { data: mapping, error: mappingError } = useApi<StudioImportMapping>(
    selectedMapping
      ? `/api/imports/${encodeURIComponent(selectedMapping.import_id)}/mapping`
      : null,
  );

  async function upload(file: File) {
    setError("");
    setUploading(true);
    try {
      const form = new FormData();
      form.set("kind", active);
      form.set("file", file);
      const result = await apiForm<{
        importId: string;
        status: string;
        error: string | null;
        rows?: number;
        mapped_columns?: number;
        unmapped_columns?: number;
        period_status?: "unknown" | "daily";
      }>("/api/imports", form);
      if (result.status === "失敗") setError(`取り込めませんでした: ${result.error ?? ""}`);
      else if (result.status === "完了" && typeof result.mapped_columns === "number")
        toast(
          `「${file.name}」の${result.rows ?? 0}行を確認しました。未対応列は原本で確認できます。`,
        );
      else if (result.status === "完了")
        toast(`「${file.name}」の${result.rows ?? 0}週を反映しました。`);
      else toast(`「${file.name}」を受け付けました。`);
      await onChanged();
    } catch (err) {
      setError(errorText(err));
    } finally {
      setUploading(false);
    }
  }

  return (
    <SectionCard
      id="imports"
      title="データ取込"
      description="ファイルを受け付け、解析状況を確認します。"
    >
      {canWrite && (
        <>
          <div className="tabs" role="tablist" aria-label="取込の種類">
            {KINDS.map((k) => (
              <button
                key={k.kind}
                type="button"
                role="tab"
                id={`import-tab-${k.kind}`}
                aria-selected={k.kind === active}
                aria-controls="import-panel"
                className={k.kind === active ? "tab active" : "tab"}
                onClick={() => setActive(k.kind)}
              >
                {k.label}
              </button>
            ))}
          </div>
          <div id="import-panel" role="tabpanel" aria-labelledby={`import-tab-${active}`}>
            <DropZone
              key={current.kind}
              label={`${current.label}を${current.kind === "csv" ? "アップロード" : "取り込む"}`}
              accept={IMPORT_RULES[current.kind].exts.join(",")}
              hint={`${current.description} ${IMPORT_RULES[current.kind].exts.join(" / ")}（${Math.round(IMPORT_RULES[current.kind].maxBytes / 1024 / 1024)}MBまで）`}
              disabled={uploading}
              onFile={(file) => void upload(file)}
            />
            {current.kind === "csv" && <CsvSource channelId={channelId} />}
            {uploading && (
              <p className="muted" role="status">
                アップロードしています…
              </p>
            )}
          </div>
        </>
      )}
      <Alert>{error}</Alert>
      <h3>取込履歴（直近20件）</h3>
      <DataTable
        caption="取込履歴"
        columns={[
          ...COLUMNS,
          {
            key: "preview",
            label: "原本",
            render: (row) =>
              row.kind === "csv" && row.status !== "失敗" && row.has_original === 1 ? (
                <span className="row">
                  <button
                    className="button"
                    type="button"
                    onClick={() => {
                      setPreviewOffset(0);
                      setSelectedCsv(row);
                    }}
                  >
                    全列を見る
                  </button>
                  {typeof row.mapped_columns === "number" && (
                    <button
                      className="button"
                      type="button"
                      onClick={() => setSelectedMapping(row)}
                    >
                      列の対応
                    </button>
                  )}
                </span>
              ) : (
                "—"
              ),
          },
        ]}
        rows={imports}
        rowKey={(r) => r.import_id}
        empty="まだ取り込んだファイルはありません"
      />
      {selectedMapping && (
        <section className="csv-preview" aria-labelledby="csv-mapping-heading">
          <div className="row csv-preview-heading">
            <div>
              <h3 id="csv-mapping-heading">{selectedMapping.file_name} の列の対応</h3>
              <p className="small muted">
                対応済み {mapping?.mappedColumns ?? selectedMapping.mapped_columns ?? 0}列・未対応{" "}
                {mapping?.unmappedColumns ?? selectedMapping.unmapped_columns ?? 0}列。
                {mapping?.periodStatus === "unknown" &&
                  "期間が特定できない表は、期間別KPIへ加算しません。"}
              </p>
            </div>
            <button className="button" type="button" onClick={() => setSelectedMapping(null)}>
              閉じる
            </button>
          </div>
          <Alert>{mappingError}</Alert>
          {!mapping && !mappingError && <Loading />}
          {mapping && (
            <DataTable
              caption={`${selectedMapping.file_name} の列の対応`}
              layout="scroll"
              columns={[
                {
                  key: "header",
                  label: "原本の列",
                  render: (row: StudioImportMapping["columns"][number]) => row.header,
                },
                {
                  key: "mapping",
                  label: "対応する指標",
                  render: (row: StudioImportMapping["columns"][number]) =>
                    row.mappingKey ?? "未対応",
                },
                {
                  key: "unit",
                  label: "単位",
                  render: (row: StudioImportMapping["columns"][number]) => row.unit ?? "—",
                },
              ]}
              rows={mapping.columns}
              rowKey={(row) => String(row.ordinal)}
              empty="列がありません"
            />
          )}
        </section>
      )}
      {selectedCsv && (
        <section className="csv-preview" aria-labelledby="csv-preview-heading">
          <div className="row csv-preview-heading">
            <div>
              <h3 id="csv-preview-heading">{selectedCsv.file_name} の原本</h3>
              <p className="small muted">
                原本の全列を表示します。指標への反映状況は取込履歴の状態を確認してください。
              </p>
            </div>
            <button className="button" type="button" onClick={() => setSelectedCsv(null)}>
              閉じる
            </button>
          </div>
          {previewLoading && <Loading />}
          <Alert>{previewError}</Alert>
          {preview && (
            <>
              <p className="small muted">
                {fmtNumber(preview.totalRows)}行・{preview.headers.length}列 （{preview.offset + 1}
                〜{Math.min(preview.offset + preview.rows.length, preview.totalRows)}行目）
              </p>
              <DataTable
                caption={`${selectedCsv.file_name} のCSV原本`}
                layout="scroll"
                columns={preview.headers.map((header, index) => ({
                  key: `${index}`,
                  label: header || `列${index + 1}`,
                  render: (row: string[]) => row[index] ?? "",
                }))}
                rows={preview.rows}
                rowKey={(_row, index) => `${preview.offset + index}`}
                empty="このCSVにはデータ行がありません"
              />
              <Pager
                className="csv-preview-pages"
                prevText="前の50行"
                nextText="次の50行"
                prevDisabled={preview.offset === 0}
                nextDisabled={preview.offset + preview.rows.length >= preview.totalRows}
                onPrev={() => setPreviewOffset(Math.max(0, preview.offset - preview.limit))}
                onNext={() => setPreviewOffset(preview.offset + preview.limit)}
              />
            </>
          )}
        </section>
      )}
    </SectionCard>
  );
}
