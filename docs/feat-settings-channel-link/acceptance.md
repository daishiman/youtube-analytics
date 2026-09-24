# feat-settings-channel-link 受入判定（SYS-SCL-P11）

最終更新: 2026-09-24。判定環境はローカル Workers runtime（`pnpm run preview --port 8793` と E2E の port 8794）。8787 は別案件が使用中。commit、push、deploy はしていないので、公開環境の列は未実施。

## 1. 判定

| # | 受入項目 | ローカル | 公開環境 |
|---|---|---|---|
| AC1 | 画像の5カードにメンバー管理を加えた6区画を指定順に並べる。閲覧者にはメンバー区画と書込ボタンを出さない | 合格 | 未実施 |
| AC2 | 候補から選んで連携する。別テナントが連携済みなら 409 | 合格（Google は差し替え） | 未実施（本物の Google 同意が必要） |
| AC3 | 再連携は同じチャンネルだけ。変更は、解除 → 旧データ削除完了 → 新連携の順 | 合格（専用Queueで旧履歴・孤立R2原本を消し、完了後に新連携。失敗再試行、二重通知、取込競合、旧世代の後着地を結合テストで確認） | 未実施 |
| AC4 | 字幕の ON/OFF とスコープの追加・revoke、テナントごと1日5本、検証前は「準備中」 | 部分合格（フラグと遷移を検証。取得数の実測処理は日次収集 feature の担当） | 未実施 |
| AC5 | トークンは名前が必須、6本目は 409、平文は1回だけ表示する | 合格 | 未実施 |
| AC6 | 実測できる共通無料枠は 70% で黄、90% で赤。YouTube API・D1書込・字幕取得は未計測の間「未取得」 | 合格（単体テストと3幅E2E。Cloudflare 値は seed キャッシュ） | 未実施（`CF_ANALYTICS_TOKEN` が必要） |
| AC7 | 取込履歴は最新20件で、失敗理由を出す。CSV の取得元（連携中チャンネルの Studio 画面）を出す | 合格 | 未実施 |
| AC8 | 共通 Header/Footer を全画面（ログイン、規約）で共有する | 合格 | 未実施 |
| AC9 | 監査を1件ずつ残し、別 Origin の書込を拒否する | 合格 | 未実施 |
| AC10 | 3サイズの E2E | 全87件中85件成功、既存の2件は意図的にスキップ | CI で実行予定 |
| AC11 | （qa-087）YouTube 連携はテナントの Google Cloud クライアントで行う。未登録なら連携できない。シークレットは暗号化し、返さない | 合格（Google は差し替え） | 未実施（テナントの本物のクライアントが必要） |

## 2. 証跡

| 種類 | 場所 |
|---|---|
| 型検査 | `evidence/feat-settings-channel-link/typecheck.txt` |
| lint | `evidence/feat-settings-channel-link/lint.txt`（エラー 0、警告 0） |
| 単体と結合テスト | 今回の再実行: 23ファイル、214件成功。既存の `evidence/feat-settings-channel-link/unit-test-run.txt` は改善前の192件の記録 |
| E2E | 今回の再実行: 3サイズ、85件成功、2件スキップ。既存の `evidence/feat-settings-channel-link/e2e-run.txt` は改善前の79件の記録 |
| 画面 | `settings-owner-{mobile,tablet,desktop}.png`、`settings-viewer-{mobile,tablet,desktop}.png`、`login-mobile.png`、`privacy-mobile.png`、`google-client-owner-{desktop,mobile}.png` |
| 構成チェック | `evidence/feat-settings-channel-link/check-repo.txt`（成功。直し方は qa-report.md 3 節） |
| 索引 | `evidence/feat-settings-channel-link/index.json` |

## 3. 手で確かめる手順（ローカル）

準備は runbook.md の 6 節。すべて `owner@example.com` の開発用ログインから始める。

1. **AC1**: 設定画面を開き、YouTube連携 → データ取込 → Claude Code連携トークン → メンバー → 無料枠 → データを削除 の順に並ぶことを確かめる。ログアウトして `viewer@example.com` で入ると、メンバー区画と「再連携」「発行」「削除」などのボタンが出ない。
2. **AC3**: 「連携解除」→ テナント名以外を入れると確定できない。正しい名前では解除と削除予約ができ、削除期限が出る。未完了中は新規連携と取込を拒否する。ローカルでは `curl 'http://localhost:8793/cdn-cgi/local/scheduled?format=json'` でCronを手動起動し、専用Queueの処理後に `done_at`、旧 `imports` 履歴、旧世代の R2 原本を確かめてから新規連携する（元に戻すときは seed を流し直す）。
3. **AC4**: 字幕のトグルを ON にすると、Google の同意画面の URL へ移る（ローカルでは Google の画面で止まる）。`.dev.vars` の `OPERATOR_TENANT_ID` を消して再起動すると、トグルが「準備中」になって押せない。
4. **AC5**: 「新しいトークンを発行」→ 名前が空のままでは発行できない。名前を入れて発行すると平文が1回だけ出る。閉じると二度と出ない。合計5本にしてから6本目を発行すると「トークンは1人5本まで発行できます」。
5. **AC6**: 無料枠で、YouTube API・D1書込・字幕取得は「未取得」。YouTube の案内から各 Google Cloud Console で確認できる。seed の Cloudflare キャッシュでは R2 と Workers が赤になる。
6. **AC7**: 取込履歴の `broken.csv` に「見出し行に「日付」がありません」が出る。CSV タブの下に「取得元: YouTube Studio のアナリティクス…」のリンクが出て、押すと別タブで `studio.youtube.com/channel/UCseedChannelA000000000/…` が開く（テスト用チャンネルなので Studio 側では開けないのが正常）。字幕・画像タブでは出ない。
7. **AC8**: /login、/privacy、/terms とログイン後の全画面の下に、同じフッター（3つのバッジ、プライバシーポリシー、利用規約）が出る。
8. **AC10**: ブラウザの幅を 390、820、1440 に変えても、崩れずに操作できる。
