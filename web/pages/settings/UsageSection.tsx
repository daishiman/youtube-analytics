// 設定画面「無料枠の使用状況」区画。Cloudflare の使用量はアカウント全体
import type { UsageItem } from "../../api";
import { SectionCard } from "../../components/SectionCard";
import { UsageBar } from "../../components/UsageBar";

export function UsageSection({ usage }: { usage: UsageItem[] }) {
  return (
    <SectionCard
      id="usage"
      title="無料枠の使用状況"
      description="Cloudflare の使用量はサービス全体の合計です。取得できる項目は70%以上で注意、90%以上で警告の色になります。"
    >
      <div className="usage-list">
        {usage.map((item) => (
          <UsageBar key={item.key} item={item} />
        ))}
      </div>
      <p className="small muted">
        YouTube API の割当は各ワークスペースの Google Cloud
        プロジェクトごとです。正確な使用量と上限は Google Cloud Console で確認してください。D1
        書込と字幕取得は計測機能の実装後に表示します。
      </p>
      <p className="small muted">Cloudflare の値は1時間ごとに更新します。</p>
    </SectionCard>
  );
}
