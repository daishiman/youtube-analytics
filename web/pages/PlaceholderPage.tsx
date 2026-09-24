// 後続 feature で中身を作る画面（動画・AI分析・改善アクション）。共通レイアウトとナビだけ先に通す
import { PageHeader } from "../components/PageHeader";
import { SectionCard } from "../components/SectionCard";

export function PlaceholderPage({ title, lead }: { title: string; lead: string }) {
  return (
    <>
      <PageHeader title={title} lead={lead} />
      <SectionCard id="coming-soon" title="準備中">
        <p className="muted">この画面は後続の機能で追加されます。</p>
      </SectionCard>
    </>
  );
}
