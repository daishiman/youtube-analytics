# feat-skill-analysis-reports 品質確認（SYS-SAR-P09）

最終更新: 2026-09-25。ゲートはすべて手元で実行し直した（共有の dev サーバ 8793 を使い、終わったあと `pnpm db:seed:local` で初期状態に戻した）。

## 1. ゲート

| ゲート | コマンド | 結果 | 証跡 |
|---|---|---|---|
| 単体と結合 | `pnpm test` | 成功（35ファイル・375件。うち tests/skill-analysis は3ファイル） | `evidence/feat-skill-analysis-reports/unit-test-run.txt` |
| 画面 E2E | `pnpm test:e2e`（3サイズ） | 成功（138件） | `e2e-playwright.txt` |
| スキルの通し実行 | `yt-analyze.mjs`（実 dev サーバ）と `run-yt-analyze-fixture.mjs` | 成功（A-0011 v3 を HTTP 201 で保存・exit 0。スタブ 403/404 は exit 4/5。404 モードは 2026-09-25 に「未提供」分岐とともに廃止し、現在のスタブは 201・403 だけ） | `e2e-run.txt` |
| 再現性 | `verify-analysis-reproducibility.mjs` | 成功（3件とも完全一致） | `reproducibility.txt` |
| 非因果 | `check-no-causal-language.mjs` | 成功（10ファイルで0件） | `no-causal-language.txt` |
| lint | `pnpm lint` | 成功（154ファイル） | `lint.txt` |
| 型検査 | `pnpm typecheck` | 成功 | `typecheck.txt` |
| 依存の脆弱性 | `pnpm audit --audit-level=high` | 未実施（外部のレジストリへ問い合わせるため、この作業では実行していない） | — |
| 無改変 | `node scripts/skill-analysis/check-rds-unmodified.mjs` | 成功（取込元と一致） | `rds-unmodified.txt` |
| 空の DB へのマイグレーション | `node scripts/check-migrations.mjs` | 成功（空 DB へ全15件、0007 までの DB へ差分8件） | `migrations-empty-db.txt` |
| launchd | `plutil -lint`・`bash -n` | 成功 | `plutil-lint.txt` |

## 2. セキュリティの確認

| 観点 | 確認内容 | 判定 |
|---|---|---|
| トークンの平文 | DB は SHA-256 だけを保存している。`lib/client.mjs` はトークンをログや出力に書かない。`posted-result.json` にもトークンを含めない | 問題なし |
| 経路の分離 | isSkillApi が `/api/skill/` を authGate と csrfGuard から外し、skillAuth が Bearer だけを受ける。セッションでスキル API を、Bearer で画面 API を呼べないことはテスト済み | 問題なし |
| 仕様に無い経路 | スキルのルートは6本。`tests/platform/routes.ts` に登録してある | 注記あり（3節の1） |
| テナント境界 | AnalysisRepository は tenantId を固定している。SQL は必ず tenant_id で絞る | 問題なし |
| 入力の上限 | 本文（REPORT_BODY_MAX_BYTES）、report_html（REPORT_HTML_MAX_BYTES）、画像（MEDIA_MAX_BYTES）、文字起こし（TRANSCRIPT_MAX_SEGMENTS）、補足指示（INSTRUCTION_MAX）。値は architecture.md の2・3節 | 問題なし |
| レート制限 | 依頼の作成は1ユーザーあたり10件/分。11件目は 429 | 問題なし |

## 3. 指摘

1. POST /api/skill/requests のルートが SAR の `src/http/skill-routes.ts` にある。usecase は AIA の `src/usecases/analysis-screen.ts` にある。SAR の P05・P09・P10 は「エンドポイント本体は SAR の src/ に作らない」としており、食い違っている。AIA と同じワークツリーで作業しているため。未解決。→ 解消（2026-09-25）: usecase を集約単位で3分割し、createSkillRequest は依頼の集約 `src/usecases/analysis-requests.ts` に置いた。ルートは認証方式で分け、Bearer のルートは `skill-routes.ts` に集めた。AIA と同時に出荷する前提（指摘2）は変わらない。
2. `recentReports` は AIA の 0014 report_archives を参照している。アーカイブの除外は AIA の範囲。SAR だけを出荷すると成り立たない。未解決（AIA と同時に出荷する前提）。
3. report-design-system と yt-analyze は git の未追跡ファイルである。取込元の無い環境で check-rds-unmodified を動かすと、比べられずに0で終わる可能性があった。→ 解決: 取込元が見つからなければ exit 3 で止め、`--allow-unverifiable` を明示したときだけ有無の確認に落とすようにした。
4. テストは計画した9ファイルでなく、3ファイルにまとめてある。受入1の vitest（e2e-yt-analyze.test.ts）は無い。vitest の workers pool は子プロセスを起動できないため、スキルの通し実行は CLI の実行記録（`e2e-run.txt`）で確かめる。
5. 実 dev サーバでは書き出しが0行になり（境界テーブルが未作成）、report-design-system の検査で止まっていた。→ 解決: 空データでも「判定保留」の版を作るよう pipeline.mjs・render.mjs を直し、`tests/fixtures/skill-analysis-empty/` を足した（acceptance.md 1節）。
6. 軽微: 詳細画面の「前回からの変化」で、施策効果が `action_id: …` のようなキー表記のまま出る（plain() の整形）。表示の改善は AIA の範囲なので、ここでは記録だけする。
