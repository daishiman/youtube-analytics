// 設定画面「データ取込」区画。CSV / 字幕(SRT・VTT) / 画像 をタブで切り替え、直近20件の履歴を出す
import { useState } from "react";
import { IMPORT_RULES } from "../../../src/domain/import-rules";
import { apiForm, type ImportKind, type ImportRow } from "../../api";
import { formatDateTime } from "../../components/AppShell";
import { type Column, DataTable } from "../../components/DataTable";
import { DropZone } from "../../components/DropZone";
import { SectionCard } from "../../components/SectionCard";
import { type BadgeTone, StatusBadge } from "../../components/StatusBadge";
import { useToast } from "../../components/Toast";
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
    description: "YouTube Studio から書き出した CSV",
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
    render: (r) => (r.rows === null ? "—" : r.rows.toLocaleString("ja-JP")),
  },
  { key: "at", label: "取込日時", render: (r) => formatDateTime(r.created_at) },
  {
    key: "status",
    label: "状態",
    render: (r) => (
      <span className="status-cell">
        <StatusBadge tone={STATUS_TONE[r.status]}>{r.status}</StatusBadge>
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
    <p className="small import-source">
      取得元:{" "}
      <a href={studioAnalyticsUrl(channelId)} target="_blank" rel="noopener noreferrer">
        YouTube Studio のアナリティクス（詳細モード・直近4週間・動画別）
      </a>
      <br />
      <span className="muted">
        開いた画面の右上にある書き出しボタンから「カンマ区切り値（.csv）」を選んで保存し、ここへ取り込みます。チャンネルの持ち主の
        Google アカウントで開いてください。
      </span>
    </p>
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
  const toast = useToast();
  const current = KINDS.find((k) => k.kind === active) ?? KINDS[0];

  async function upload(file: File) {
    setError("");
    setUploading(true);
    try {
      const form = new FormData();
      form.set("kind", active);
      form.set("file", file);
      const result = await apiForm<{ importId: string; status: string; error: string | null }>(
        "/api/imports",
        form,
      );
      if (result.status === "失敗") setError(`取り込めませんでした: ${result.error ?? ""}`);
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
      description="YouTube APIで取れないデータをファイルで取り込みます。"
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
              label={`${current.label}を取り込む`}
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
      {error && (
        <p role="alert" className="alert">
          {error}
        </p>
      )}
      <h3>取込履歴（直近20件）</h3>
      <DataTable
        caption="取込履歴"
        columns={COLUMNS}
        rows={imports}
        rowKey={(r) => r.import_id}
        empty="まだ取り込んだファイルはありません"
      />
    </SectionCard>
  );
}
