# feat-login-redesign 受入確認（SYS-LRD-P07）

最終更新: 2026-09-24。確認環境は **ローカル**（`pnpm dev`、http://localhost:8791、開発用ログイン、seed 済み D1）。preview 環境と実 Google アカウントでの確認は、main への merge とデプロイの後に行う（§3）。

判定: ○ = 合格、△ = ローカルでは合格・preview での確認待ち、— = 未実施。

## 1. 受入項目ごとの結果

| # | 受入項目 | 判定 | 自動テスト | 手動確認・証跡 |
|---|---|---|---|---|
| 1 | 画像どおりの並び・文言、Google ボタンは白地・枠 #747775・標準 G ロゴ | ○ | E2E A1（3 サイズ）、smoke 見出し | `evidence/feat-login-redesign/login-948-production-like.png` を同じ 948×1659、同意済み・開発用フォームなしで撮影して比較（§2）。旧 desktop/tablet/mobile は開発状態の証跡 |
| 2 | 権限一覧は `/api/auth/config` だけから描き、要求 scope と一致（新規3行・招待1行） | ○ | `config-and-scopes.test.ts` 5 件、E2E A2 | `login-invite-desktop.png`（招待はメールアドレス1行と「テストチャンネルAのテナントに招待されています」） |
| 3 | 同意まで押せず理由文。ログインで現行版の consent_records を1行追記 | ○ | `consent.test.ts` A3 3 件、E2E A3 | 画面で未チェック時に「同意にチェックすると押せます」、チェック後に消えることを確認 |
| 4 | 古い版の同意は CONSENT_OUTDATED で再同意を求める | ○ | `consent.test.ts` A4 2 件、E2E A4 | `login-consent-outdated.png` |
| 5 | 権限または refresh token が不足してもログインでき、未完了の連携から回復できる（ボタンはオーナーだけ） | △ | `callback-scopes.test.ts` A5・初回 token 不在・再連携・複数所属、E2E A5 と `none` の案内 | `dashboard-partial-owner.png`。実 Google の部分許可画面は preview で確認する |
| 6 | オーナー以外の connect は 403 | ○ | `youtube-connect.test.ts` 5 件 | — |
| 7 | CSP と frame-ancestors 'none' などが付き、他サイトの iframe に出ない | ○ | `security-headers.test.ts` 3 件、`health.test.ts` | `evidence/feat-login-redesign/P09-headers.txt`（`curl -I` の実応答） |
| 8 | 未知コードと error_description が画面にも URL にも出ない | ○ | `callback-scopes.test.ts` A8、E2E A6 | `/login?error=<script>…` で汎用文言だけを出し、未知コードを URL から除去することを確認 |
| 9 | 360px で横スクロールなし、キーボードだけで操作（3 サイズ） | ○ | E2E A8・A9（3 プロジェクト） | `login-narrow360.png` |
| 10 | main への push で D1 migration と deploy が完了 | — | `storage.test.ts`（migration 0003 の制約） | 未 push のため未確認。`evidence/feat-login-redesign/P08-migration.txt` はローカルで空 DB・既存 DB の両方に適用できた記録。P13 で Actions ログを確認する |

再検証結果: `pnpm test` 124/124、`pnpm e2e` 69/69（skip 0）。ログは `evidence/feat-login-redesign/P06-test-run.txt` と `P06-e2e-run.txt`（2026-09-24 の最終レビューで再取得）。

## 2. 画像との見た目比較（項目 1）

`docs/screens/01-login.png` と同じ 948×1659 の `evidence/feat-login-redesign/login-948-production-like.png` を比較した。後者は同意済み・開発用フォームなし。旧 `screenshots/login-desktop.png` は未同意・開発用フォーム表示の状態なので、画像一致の判定には使わない。

| 要素 | 画像 | 実装 | 判定 |
|---|---|---|---|
| 並び | ロゴ → 見出し → 説明 → 権限一覧 → 同意 → Google ボタン → 未検証の案内 → 信頼表示 | 同じ | ○ |
| 見出し | 「YouTubeの実績から、次の一手を。」 | 同じ（狭い幅では読点の後で改行） | ○ |
| 権限一覧 | 3 行、それぞれ「読み取り専用」 | 同じ（`/api/auth/config` から描画） | ○ |
| カードの位置・大きさ | x≈162, y≈253, w≈626, h≈847（948×1659） | x=162, y=248, w=624, h=847 | ○ |
| Google ボタン | 青緑の塗り | **白地・枠 #747775・文字 #1f1f1f** | 意図的な差（下記） |
| 信頼表示 | 3 つ | 同じ（OAuthは読み取り専用 / データは利用者ごとに分離 / 無料枠で運用） | ○ |
| ロゴ | 緑の棒グラフ印と製品名 | 製品名のテキストだけ | 意図的な差（qa-063） |
| 背景の装飾 | 薄青の折れ線と面 | 無装飾のライト背景 | 意図的な差（qa-063） |

**Google ボタンの色が画像と違う理由**: Google Sign-In のブランド規定では、ボタンは Light・Dark・Neutral の3テーマから選び、独自色で塗ってはいけない。確定仕様（qa-067）で Light テーマに固定したので、受入項目 1 の「白地・枠 #747775・標準 G ロゴ」がこれに当たる。

開発用ログインの欄はローカル（`DEV_LOGIN=1`）だけに出る。比較用の画像では `/api/auth/config` の開発フラグを無効にしている。

## 3. preview 環境で残っている確認

main へ merge してデプロイした後、`docs/feat-login-redesign/runbook.md` §4 の手順で次を確認し、この表に追記する。

| 確認 | 期待 | 結果 |
|---|---|---|
| 実 Google アカウントで新規ログイン（両方許可） | ダッシュボード。バナーなし。`youtube_link_status=linked` | — |
| 実 Google アカウントで新規ログイン（YouTube の片方を外す） | ログインは完了し、オーナーに再連携バナー。`partial` | — |
| バナーの「再連携」から両方許可 | バナーが消え `linked` | — |
| 実 Google アカウントで招待から参加 | Google の同意画面にメールアドレスだけが出る | — |
| `LEGAL_VERSIONS` を上げてデプロイ → ログイン | 前回の版では CONSENT_OUTDATED。同意し直すと `source=reconsent` の行 | — |
| preview の `curl -I /login` | `P09-headers.txt` と同じヘッダ | — |
