# feat-skill-analysis-reports 設計レビュー（SYS-SAR-P03）

最終更新: 2026-09-25。実装と `tests/skill-analysis/` を突き合わせて判定した。

## 1. 脅威と対策

| # | 脅威 | 対策 | 判定 |
|---|---|---|---|
| R1 | 他テナントのトークンで export する | 依頼を tenantId 固定のリポジトリで引く。見つからなければ 404 | 合格（「他テナントのトークンでは依頼を export できない（404）」） |
| R2 | 失効済み・未知のトークンを使う | SHA-256 で照合し（PlatformRepository.authenticateSkillToken）、revoked_at IS NULL の行だけを受ける。該当しなければ 401 | 合格（「無い・形式違い・失効済み・未知のトークンは 401」） |
| R3 | メンバーから外れた人や、削除済みテナントのトークン | tenant_members と tenants（deleted_at IS NULL）を JOIN する | 合格（「メンバーから外れた人のトークンは使えない」） |
| R4 | 二重送信で版が増える | UNIQUE (tenant_id, idempotency_key)。同じキーは既存版を返す。UNIQUE 違反で競合したら勝者の版を返す | 合格（受入6） |
| R5 | 過去の版を書き換える | BEFORE UPDATE トリガで RAISE ABORT。usecase に UPDATE 文が無い | 合格（受入7） |
| R6 | 因果を断定する文を混ぜる | CAUSAL_PATTERNS と check-report.mjs の E21・E08 | 判定保留（生成物への走査証跡は未採取） |
| R7 | セッション cookie で /api/skill/* を呼ぶ | isSkillApi で経路を分け、skillAuth は Bearer だけを受ける | 合格 |
| R8 | Bearer で画面 API を呼ぶ | 画面 API はセッション専用 | 合格 |
| R9 | 大きすぎる本文・偽った画像 | 本文は REPORT_BODY_MAX_BYTES まで。画像は MEDIA_MAX_BYTES までで、マジックバイトを検査する（値は architecture.md の2・3節） | 合格 |
| R10 | 操作の記録漏れ | audit_log に analysis.request / analysis.fail / analysis.report を残す | 合格（「owner・editor は作成でき、待機中・A-連番・監査ログが付く」ほか） |
| R11 | ログにトークンの平文が出る | client.mjs はトークンをログに出さない。DB にはハッシュだけを保存する | 合格（コードで確認） |
| R12 | 仕様に無い経路がある | ルートは routes.ts に登録した6本だけ（routes-coverage テストで照合） | 注記あり（下記） |

## 2. 残るリスクと注記

- POST /api/skill/requests のルートが `src/http/skill-routes.ts` にある（usecase は AIA の `analysis-screen.ts`）。SAR の P05・P09・P10 の「SAR の src/ に作らない」とは食い違う。同じワークツリーで AIA と相乗りしているため。出荷単位を分ける場合は、ルートの登録を AIA 側へ移す必要がある。→ 2026-09-25: usecase を集約単位で3分割し、createSkillRequest は `src/usecases/analysis-requests.ts` に置いた。ルートは認証方式で分けたので、Bearer の POST /api/skill/requests が `skill-routes.ts` にあるのは現在の設計どおりである（qa-report.md 3節の1）。
- recentReports は AIA の 0014 report_archives を参照する。SAR だけを先に出荷する場合、0014 が無いと失敗する可能性がある。
- export の入力は境界テーブル `analysis_export_rows` と `analysis_export_targets` から読む。依存する feature が未実装のうちは rows が空になり、レポートは判定保留になる見込み。
- 他テナントへの応答は 404。受入の「403 または 404」には収まる。
