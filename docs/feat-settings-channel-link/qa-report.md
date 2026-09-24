# feat-settings-channel-link 品質レポート（SYS-SCL-P10）

最終更新: 2026-09-24。

## 今回の改善後の再検査

`pnpm test` は23ファイル214件成功、`pnpm typecheck`・`pnpm lint`・`pnpm check:repo`・`pnpm build`・`git diff --check` は成功。`E2E_PORT=8794 pnpm e2e` は3サイズで85件成功・既存2件スキップ。`pnpm preview --port 8793` のローカル Workers runtime で `/login` と `/privacy` が200、未ログインの `/api/settings` が401。ローカル Cron の手動起動は `outcome=ok`、専用 Queue が1通を処理した。標準8787は別案件が使用中。公開URLはまだなく、本物の Google 同意・Cloudflare Analytics・公開環境の Queue/Cron・削除実行は未確認。

以下の表と `evidence/feat-settings-channel-link/` は**初回実装時の証跡**であり、今回の再検査件数ではない。

## 1. 品質ゲート

| ゲート | コマンド | 結果 | ログ |
|---|---|---|---|
| 型検査 | `pnpm typecheck` | 成功 | `evidence/feat-settings-channel-link/typecheck.txt` |
| lint | `pnpm lint` | 成功（警告 0） | `lint.txt` |
| 単体と結合テスト | `pnpm test` | 192件 / 21ファイル すべて成功（このタスクで追加: 8ファイル、76件。うち qa-075 で新規1ファイル12件と既存テストへの追加） | `unit-test-run.txt` |
| 画面のビルド | `pnpm build:web` | 成功 | — |
| deploy の dry-run | `pnpm build` | 成功 | — |
| E2E（3サイズ） | `E2E_PORT=8792 pnpm e2e` | 79件成功、2件スキップ（既存の意図的なスキップ） | `e2e-run.txt` |
| 構成チェック | `pnpm check:repo` | 成功（当初5件をすべて解消。3 節） | `check-repo.txt` |

## 2. lint の警告

`web/styles.css` の `noDescendingSpecificity` が5件あったが、解消した（警告 0）。原因は、追加した `.main-nav a`、`.period-tabs a`、`.nav-icon` とその `.active` 系が、詳細度の高い `.sidebar nav a` より後ろにあったこと。詳細度が違うルール同士では順番が結果を変えないので、これらを `.sidebar nav` の前へ移した。移した範囲に、同じ詳細度で同じ要素を指すルールはない。E2E（61件成功）と3サイズの撮り直しで、表示が変わらないことを確かめた。

## 3. check:repo の5件をどう直したか

| # | 内容 | 直し方 |
|---|---|---|
| 1〜3 | `system-spec/frontend.md` に qa-061 の投影文（「現行技術決定: `qa-061`」「React + Vite + React Router」「qa-061はqa-024…を置換する」）がなかった | 追補（qa-062〜qa-074）のための再コンパイルで、コンパイラの外から入れていた「現行技術決定」節が消えていた。利用者の承認（2026-09-24）を得て、次の3段で戻した。(1) 公式 writer（`apply-spec-transition.py`）で `frontend.web` を R4-reopen（理由付き）。(2) 章の To-Be / Delta に「### 現行技術決定: `qa-061`」節を追加。(3) 同じ qa-067・serves_goals・qa_refs で再確定（再確定後のセルは reopen 前と完全一致）。新しい回答は取っていない。この節はコンパイラが残す「管轄外の追補節」なので、コピー上で再コンパイルしても、出力はリポジトリの章と完全に一致した（次の再コンパイルでも消えない） |
| 4〜5 | `eval-log/dev-graph-resync-required-20260922.json` の digest が古い | 追補で仕様の compile と dev-graph の spec import を実際に実行し、その生成記録（`eval-log/dev-graph-spec-import-report-20260924.json`、`.dev-graph/state/graph.json`、`architecture/graph.json`）に同じ digest がある。そのため gate の digest を現在値にして、根拠を `digest_refresh_evidence` に残した。影響する3 feature の task 計画はまだ作り直していないので、`status` は required のまま |

網羅性ゲート（`validate-coverage-matrix.py --require-complete --require-basis --require-foundation`）も成功。

## 3b. 利用者の追加要望: CSV の取得元 URL（2026-09-24）

データ取込の CSV タブに「取得元」を出すようにした。表示するのは次の2つ。
- 連携中チャンネルの YouTube Studio「アナリティクス → 詳細モード」を別タブで開くリンク。表示条件は直近4週間・動画別。列は、視聴回数、総再生時間、登録者の増減、推定収益、インプレッション数、インプレッションのクリック率。
- 書き出しの手順。

URL はチャンネル ID から組み立てる（`web/youtube-studio.ts`）ので、どのテナントでも自分のチャンネルの画面が開く。未連携のときはリンクの代わりに案内文を出す。

- テスト: `tests/settings/studio-url.test.ts`（3件）、`e2e/settings.spec.ts` に2件（×3サイズ）。
- 仕様書（system-spec）はまだ更新していない。画面の文言を足しただけで、確定済みの決定とは矛盾しない。次に仕様を追補するときに ui-ux/frontend 章へ書き足す。
- 注意: この画面から書き出した CSV の列構成を取込の解析（feat-csv-media-ingest）が読めるかは、解析側の実装時に確かめる（このタスクで作ったのは、受け付けて R2 に保存するところまで）。

## 3c. 利用者の追加要望: テナントごとの Google Cloud クライアント（qa-075、2026-09-24）

YouTube 連携の OAuth を、テナントごとに持ち込む Google Cloud の OAuth クライアントで行うようにした（利用者の選択: 「テナントごとに必須で持込」）。Google ログインはアプリ共通のクライアントのまま。

| 項目 | 内容 |
|---|---|
| テーブル | `migrations/0004_tenant_google_client.sql`（`tenant_google_clients`: tenant_id が主キー、client_id、client_secret_enc、updated_by、updated_at） |
| API | `PUT /api/youtube/google-client`（登録・変更）、`DELETE /api/youtube/google-client`（削除）。どちらもオーナーのみ（`settings.manage`）。`GET /api/settings` の `youtube.googleClient` に `{configured, clientId, updatedAt}` を返す |
| シークレット | `TOKEN_ENC_KEY` で暗号化して保存する（`v1.` 形式）。API の応答、画面、監査ログには出さない（テストで確認） |
| 未登録のとき | 「YouTubeと連携」「再連携」は 409 `GOOGLE_CLIENT_NOT_CONFIGURED`。Google へ移る前に止めるので、手続きの一時行も作らない |
| クライアント ID の変更 | 旧トークンを Google で失効し、要再連携にする（字幕の自動取得も OFF）。途中の手続き（oauth_pending）も無効にする。シークレットだけの変更なら連携はそのまま |
| 削除 | 旧トークンを失効し、要再連携にする。登録がなければ 404 |
| Google がクライアントを拒否 | トークン交換で `invalid_client` / `unauthorized_client` が返ったら `GOOGLE_CLIENT_REJECTED` で設定画面へ戻す |
| 画面 | 「YouTube連携」区画の先頭に「Google Cloud の接続情報」（登録済み/未登録のバッジ、入力欄、リダイレクト URI のコピー、準備手順）。未登録の間は連携・再連携ボタンと字幕トグルを押せない |
| 監査 | `google_client.set`（detail はクライアント ID だけ）、`google_client.delete` |
| テスト | `tests/settings/google-client.test.ts`（12件）、`e2e/settings.spec.ts` に4件（×3サイズ）。ルート一覧（`tests/platform/routes.ts`）に2本を足した |
| 仕様 | system-spec に qa-075 として記録済み（auth、backend、database、security、ui-ux の各章）。網羅性ゲートは成功 |

## 4. 手動で確認したこと

- 設定画面（オーナー、閲覧者）を3サイズで撮影し、`docs/screens/05-settings.png` と区画の順番、見出し、ボタンの位置を比べた（配色は既存の CSS 変数で、画像の色は採用していない）。
- 色の直書きは `#e69500`（注意枠）と `#fff` だけ（`grep` で確認）。
- 「Google Cloud の接続情報」を 1440 と 390 で撮影した（`google-client-owner-{desktop,mobile}.png`）。seed のテナントAは未登録なので、「未登録」バッジ、入力欄、注意文が出て、再連携ボタンと字幕トグルが押せないことを確かめた。閲覧者には入力欄が出ない。コンソールエラーは 0。
- 「次回収集」の表示が日付計算ではなく「毎日 3:00 JST」の文言になっていることを確かめた（前の実装の表示の誤りを直した）。
