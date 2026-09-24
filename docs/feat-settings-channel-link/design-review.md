# feat-settings-channel-link 設計レビュー（SYS-SCL-P03）

OAuth の追加権限、テナント越境の防止、個人トークンの管理について、脅威ごとに対策と判定を記録する。根拠章は security と auth（qa-076、qa-081、qa-083、qa-085、qa-086）。

## 脅威 × 対策 × 判定

| # | 脅威 | 対策（実装箇所） | 判定 |
|---|---|---|---|
| T1 | 別テナントが同じチャンネルを連携し、他人のデータを読む | `channels.channel_id UNIQUE`（DB）と `CHANNEL_ALREADY_LINKED`（usecase）で二重に拒否する。候補にも「連携済み」の印を出す | 対策済み（単体・E2E） |
| T2 | 再連携で、こっそり別チャンネルへ差し替える | 再連携は現在の `channel_id` と一致するときだけ成功させる（`CHANNEL_MISMATCH`）。不一致のときは新しい許可をすぐ revoke する | 対策済み（単体） |
| T3 | OAuth の state を盗まれる、使い回される | state は乱数。`oauth_pending` はユーザーとテナントに結び付け、有効期間は10分。PKCE の verifier は暗号化して保存する。別人の state と期限切れは拒否する | 対策済み（単体） |
| T4 | refresh token が DB から漏れる | AES-GCM（HKDF で `TOKEN_ENC_KEY` から鍵を導く）で暗号化して保存する。平文はログにも出さない | 対策済み |
| T5 | 必要以上の権限（force-ssl）を常に持つ | 既定は読み取り専用2スコープだけ。字幕 ON のときだけ incremental authorization で force-ssl を足し、OFF では Google の許可を revoke して読み取り専用で再連携する | 対策済み（単体） |
| T6 | Google の審査前に force-ssl を一般公開してしまう | 機能フラグ: `OPERATOR_TENANT_ID` のオーナーだけ、または `FORCE_SSL_VERIFIED=1` のときだけ操作できる。それ以外は 403 `FEATURE_NOT_READY` とし、画面は「準備中」 | 対策済み（単体・E2E） |
| T7 | CSRF で連携の解除や削除を実行させられる | 全書込に Origin / Sec-Fetch-Site を検査し、SameSite=Lax の Cookie と二重にする。解除と削除は、テナント名の入力でも確認する | 対策済み（単体: 全書込ルート × 別 Origin） |
| T8 | 個人トークンの平文が漏れる、無制限に作られる | DB にはハッシュだけを保存し、平文は発行の応答で1回だけ返す。1人5本まで、発行は10回/時まで、名前は必須（40文字まで） | 対策済み（単体・E2E） |
| T9 | 閲覧者や編集者が権限外の操作をする | usecase の入口で `requirePermission` を検査し、画面ではボタンを出さない。サーバでも 403 を返す | 対策済み（単体・E2E） |
| T10 | 使用量の表示からほかのテナントの規模が分かる | 全体の合計値だけを返し、tenant_id やテナント別の内訳を含めない | 対策済み（単体） |
| T11 | 取込ファイル名によるパスの横断、巨大ファイル | 名前に含まれるパス区切りと制御文字は `_` に置き換える。種類ごとに拡張子と上限（CSV 5MB、字幕 1MB、画像 10MB）を検査し、R2 には `tenant_id/` の配下だけに置く | 対策済み（単体） |
| T12 | 操作の追跡ができない | 連携、再連携、解除、字幕 ON/OFF、トークンの発行と失効、削除を `audit_log` に1件ずつ残す。拒否された書込は残さない | 対策済み（単体） |

## 残るリスク

- force-ssl の Google OAuth 検証は未申請のため、公開前に申請が必要（runbook 4 節）。
- `CF_ANALYTICS_TOKEN` が未設定の環境では、Cloudflare の3項目が「取得できません」と表示される。仕様どおりで、機能は壊れない。
