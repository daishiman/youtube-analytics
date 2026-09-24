# feat-settings-channel-link テスト設計（SYS-SCL-P04）

## 1. 層の分け方

| 層 | 場所 | 実行 | 役割 |
|---|---|---|---|
| API の結合テスト | `tests/settings/*.test.ts` | `pnpm test`（Vitest、Workers プール、ローカル D1） | 権限、越境、409/403、監査、キャッシュ |
| 画面の E2E | `e2e/settings.spec.ts` | `pnpm e2e`（Playwright、3サイズ） | 区画の順、出し分け、ダイアログ、共通 Header/Footer |
| 既存の E2E | `e2e/smoke.spec.ts`、`e2e/shell-state.spec.ts` | 同上 | 新しい AppShell（アカウントメニュー、メインナビ）に追従させた |

Google と Cloudflare の外部呼び出しは `tests/settings/helpers.ts` で差し替える。E2E の設定画面は `page.route` で API を固定し、画面の振る舞いだけを確かめる。

## 2. 受入項目とテストの対応

| AC | 単体（件数） | E2E |
|---|---|---|
| AC1 | settings.test.ts（5区画の設定API、メンバー独立API、役割ごとの permissions） | 6区画の順、閲覧者の出し分け |
| AC2 | youtube-link.test.ts（同意 URL、候補から選択、409、候補外 400、NO_CHANNEL、state 検証） | チャンネル選択で 409 |
| AC3 | youtube-link.test.ts、channel-cleanup.test.ts、channel-cleanup-flow.test.ts、queue-handler.test.ts（解除予約→Queue実行→旧D1/R2消去→done_at→新連携。失敗再試行、孤立原本、二重通知、旧世代の後着地と移行前予約を含む） | 連携解除はテナント名の入力で確定、削除待ちは新連携不可 |
| AC4 | captions.test.ts（準備中、運営テナント、FORCE_SSL_VERIFIED、ON と OFF、スコープが外された場合） | 準備中で押せない |
| AC5 | tokens.test.ts（名前の検証、5本の上限、ハッシュ保存、他人のトークンは 404） | 平文は1回だけ、6本目は 409 |
| AC6 | usage.test.ts（しきい値、1時間キャッシュ、取得失敗時は古い値、計測範囲） | 黄、赤、未取得の注記 |
| AC7 | imports.test.ts（世代・取込台帳、削除予約中の拒否、保存先、失敗理由、最新20件、越境なし） | 失敗理由の表示、取込タブの受付形式 |
| AC8 | — | /login、/privacy、/terms のフッター文言とリンク、ログイン後の5画面 |
| AC9 | settings.test.ts（全書込 × 別 Origin で 403、拒否は監査に残らない）、各テストで監査1件 | — |
| AC10 | — | 全テストを mobile 390×844、tablet 820×1180、desktop 1440×900 で実行 |

## 3. 実行方法

```bash
pnpm test                    # API 結合テスト
pnpm e2e                     # 8791 で起動中の pnpm dev を再利用する（CI では自前で起動）
E2E_PORT=8792 pnpm e2e       # 8791 が別の作業ツリーで使われているとき
```

`E2E_PORT` は、このタスクで `playwright.config.ts` に追加した（既定は 8791 で、従来どおり動く）。
