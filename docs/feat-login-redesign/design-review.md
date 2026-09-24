# 設計レビュー: feat-login-redesign

対象は `requirements.md` と `architecture.md`。判定は「適合」「是正して適合」のどちらか。

| # | 観点 | 判定 | 根拠 | 是正の内容 |
|---|---|---|---|---|
| R1 | 招待でのログインで YouTube のスコープを要求しないか | 適合 | `SCOPE_SETS.invite` は `openid email` だけ。config の mode=invite も同じ組から描画する。test-design の T2・T3 で確認する | — |
| R2 | 表示する権限と、実際に要求するスコープのずれ | 適合 | 行（label）とスコープを同じ `SCOPE_SETS` に置き、画面は config から描画するので、手書きの一覧がない | — |
| R3 | 最小権限 | 適合 | 読み取り用の 2 スコープと email だけ。書き込み系のスコープはない | — |
| R4 | 部分許可のあと処理が止まらないか | 適合 | ログインとテナント作成は続行し、状態を partial にする。再要求は「再連携」を押したときだけ（Google の granular consent の方針どおり） | — |
| R5 | 同意の証跡 | 適合 | ログインが成功するたびに、同意の版と日時を consent_records に追記する。更新や削除はしない（アカウント削除のときを除く） | — |
| R6 | 規約の版の改ざん | 適合 | `/login` で現行版と照合し、Cookie に署名付きで持ち運び、callback ではその値だけを使う | — |
| R7 | CSP の緩さ | 是正して適合 | 規約ページのインライン `<style>` のために `'unsafe-inline'` が必要だった | `public/legal.css` に移し、`style-src 'self'` だけにする |
| R8 | クリックジャッキング | 適合 | `frame-ancestors 'none'`（X-Frame-Options DENY も残す） | — |
| R9 | エラー内容の漏えい | 適合 | Google の `error_description` は使わない。画面は既知のコードの文言だけを出し、未知のコードは汎用の文言にする | — |
| R10 | 再連携を別アカウントで行う取り違え | 是正して適合 | そのままでは、別の Google アカウントのトークンがテナントに付いてしまう | flow に userId と tenantId を持たせ、callback で一致を確認する |
| R11 | refresh token の保存 | 適合 | AES-256-GCM で暗号化し、IV は毎回ランダム。平文をログに出さない | — |
| R12 | 試行回数の制限 | 適合（持たない） | qa-071 で取りやめた。Google 側の保護と state / PKCE で十分とした | — |
| R13 | Google ブランド規定 | 適合 | Light テーマに固定、標準の 4 色の G、文言は「Googleでログイン」。マゼンタはチェックとフォーカスリングだけに使う | — |
| R14 | アクセシビリティ | 適合 | ボタンは `aria-disabled` と `aria-describedby` で押せない理由を読み上げる。タップ領域は 44px 以上、フォーカスリングはマゼンタ、エラーは `role=alert` で 1 つだけ出す | — |
| R15 | 費用 | 適合 | 新しい有料サービスは使わない（D1 のテーブル追加だけ）。利用者の手順も増えない | — |
| R16 | 画像と共通デザインの優先順位 | 適合 | PNG は並び・文言を確認する資料。画像の棒グラフ型ロゴ、青緑のボタン、薄いグラフ背景は qa-063/qa-067 の現行決定と異なる | 製品名はテキストのみ、背景は無装飾、Google ボタンは規定の Light テーマにする |
| R17 | 共通部品の適用先 | 適合 | `TrustFooter` は React 製ログイン画面用。静的な規約 2 ページは `public/legal.css` を共有する | 規約ページが `TrustFooter` を import するという記述を削除 |
