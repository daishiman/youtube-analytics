import type { ReportDetail } from "../../../api";
import { type Column, DataTable } from "../../../components/DataTable";

type Emotion = ReportDetail["emotions"][number];

const COLUMNS: Column<Emotion>[] = [
  { key: "commentId", label: "コメントID", render: (e) => e.commentId },
  { key: "emotion", label: "感情", render: (e) => e.emotion },
  { key: "intent", label: "意図", render: (e) => e.intent ?? "—" },
];

export function EmotionTab({ detail }: { detail: ReportDetail }) {
  if (!detail.emotions.length)
    return <p className="muted">この版にコメント感情の記録はありません</p>;
  const counts = new Map<string, number>();
  for (const e of detail.emotions) counts.set(e.emotion, (counts.get(e.emotion) ?? 0) + 1);
  return (
    <div className="stack">
      <ul>
        {[...counts].map(([emotion, n]) => (
          <li key={emotion}>
            {emotion}: {n}件
          </li>
        ))}
      </ul>
      <DataTable
        caption="コメントごとの感情"
        columns={COLUMNS}
        rows={detail.emotions}
        rowKey={(e) => e.commentId}
        empty=""
      />
    </div>
  );
}
