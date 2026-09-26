# feat-dashboard-redesign 受入判定（SYS-DBR-P07）

最終更新: 2026-09-25。以下の合否と証跡は初回ダッシュボード受入時点の記録。判定環境はローカルの Workers runtime（`pnpm dev`、http://localhost:8791）と Vitest の Workers プール。commit、push、deploy はしていないので、公開環境の列は未実施。後続実装の現況は `data-coverage-audit.md` と `system-spec/ui-ux.md` の最新決定を参照。

## 1. 判定

| # | 受入項目 | ローカル | 公開環境 |
|---|---|---|---|
| AC1 | `docs/screens/02-dashboard.png` と同じ区画順（見出しと対象セレクタ → KPI 4枚 → 日次推移＋右列 → 動画別の実績 → 詳しく見る）。配色は既存のインディゴとマゼンタ | 合格（E2E E1、3サイズのスクリーンショット） | 未実施 |
| AC2 | 期間は共通ヘッダーの 7d/28d/90d/1y/custom。既定 28d、custom は最大365日。不正な値は 400。期間を変えても対象と選択を保つ | 合格 | 未実施 |
| AC3 | 動画選択は直近10本が既定で、本数の上限なし。選んだ動画の合計と、動画ごとの線を出す | 合格 | 未実施 |
| AC4 | 動画別の実績（公開日順・視聴回数順）と構成比（上位5本＋その他、切り口、形式、新旧、上位3本の占有率） | 合格 | 未実施 |
| AC5 | KPI に出典バッジと M1 の開示文。前期比は記号（▲▼）と色の両方で出す | 合格 | 未実施 |
| AC6 | ファネルは「詳しく見る」で開いたときだけ取得し、従来の判定を出す | 合格（E2E E5 で、開くまで要求しないことを確認） | 未実施 |
| AC7 | 空状態5種（未連携、未収集、CSV なし、レポートなし、アクションなし） | 合格（結合テスト。画面では `other-owner@` で未連携を確認） | 未実施 |
| AC8 | 閲覧者には書込の操作を出さない。他テナントや存在しない動画 ID は黙って除外する | 合格 | 未実施 |
| AC9 | `Cache-Control: private`、CSP の `img-src` を緩めない、サムネイルは自サイト経由 | 合格（結合テスト）。画面のサムネイルは代替表示（下の注記） | 未実施 |
| AC10 | 360px で横スクロールなし。3サイズの E2E | 合格（E8、3プロジェクト） | CI で実行予定 |
| AC11 | `video_ids` が101本以上でも 200 | 合格（105本の結合テスト） | 未実施 |
| AC12 | thumbnail 通の subrequest が50件以内、取り直しの順序、30日で削除 | 合格（当時の結合テスト） | 未実施（収集ジョブからの送信は接続済みで、`youtube-collector.test.ts`「最後のページを保存し終えてからサムネイルの取り直しを送り…」で確認。公開環境は未検証） |
| AC13 | 1,100本を超えるテナントは公開日の新しい1,000本まで | 合格（1,101本と1,100本の結合テスト） | 未実施 |

**サムネイルの注記**: seed は画像を入れていない（R2 の原本が要るため）。ローカルの画面では全動画がタイトルの頭文字の代替表示になるのが正常。自サイト配信の経路は `tests/dashboard/thumbnails.test.ts` で確かめた。送信元は後続で `src/usecases/youtube-collector.ts` に接続したが、公開環境での画像取得・表示は未検証。

## 2. 証跡

| 種類 | 場所 |
|---|---|
| 型検査 | `evidence/feat-dashboard-redesign/typecheck.txt` |
| lint | `evidence/feat-dashboard-redesign/lint.txt`（エラー 0、警告 0、info 0） |
| 単体と結合テスト | `evidence/feat-dashboard-redesign/unit-test-run.txt`（50ファイル、447件成功。うち dashboard の5ファイル66件） |
| E2E | `evidence/feat-dashboard-redesign/e2e-run.txt`（3サイズ全体で204件成功。当初失敗した `login.spec.ts` の A5 は描画待ちを入れて直し、`e2e-login-a5-repeat.txt` で60回連続成功）、`e2e-dashboard-parallel.txt`（dashboard だけ24件成功） |
| migration | `evidence/feat-dashboard-redesign/P08-migration-empty-db.txt`（空の D1 に 0001〜0008 を適用） |
| deploy の dry-run | `evidence/feat-dashboard-redesign/build-dry-run.txt` |
| 構成チェック | `evidence/feat-dashboard-redesign/check-repo.txt` |
| 画面 | `docs/feat-dashboard-redesign/screenshots/dashboard-{desktop,tablet,mobile,narrow360}.png`、`dashboard-details-desktop.png`（詳しく見る）、`dashboard-videos-desktop.png`（動画選択） |
| 索引 | `evidence/feat-dashboard-redesign/index.json` |

## 3. 手で確かめる手順（ローカル）

準備は runbook.md の 5 節。すべて `owner@example.com` の開発用ログインから始める。

1. **AC1**: ダッシュボードを開き、上から「見出しと対象セレクタ」→ KPI 4枚（視聴回数、総再生時間、加重平均視聴率 (M1)、登録者の増減）→ 日次推移と右列（最新AI分析、改善アクション）→ 動画別の実績 → 詳しく見る の順に並ぶ。
2. **AC2**: 共通ヘッダーの期間を 7日 → 90日 → 1年 と切り替えると、URL の `?period=` と KPI・推移の日数が変わる。「任意」を選んで開始日と終了日を入れ「適用」を押す。2025-01-01〜2026-01-02 のように366日以上にすると、画面上部に赤いエラー（入力の誤り）が出る。ページ内には期間タブがない。
3. **AC3**: 対象セレクタで「動画を選ぶ」→ 既定で直近10本にチェックが入っている。12本すべてを選ぶと、KPI が合計に変わり、推移に動画ごとの線が出る。期間を切り替えても選択は残る。
4. **AC4**: 動画別の実績で並べ替えを「公開日の新しい順」「視聴回数の多い順」で切り替え、「表」「構成比」を切り替える。構成比に上位5本＋その他、切り口（未分類を含む）、Shorts と長尺、新旧、上位3本の占有率が出る。行を押すと同じ期間を保ち、ダッシュボードの対象がその動画1本になる（専用動画画面は別 feature）。
5. **AC5**: KPI の各カードに出典バッジ（API、CSV）。M1 のカードに「CSVの取込データから計算した値で、YouTube公式の数値ではありません」の開示文。前期比は ▲・▼・→ の記号と色で出る（seed は毎日同じ値なので → になる指標がある）。
6. **AC6**: 開発者ツールのネットワークを開いたまま「詳しく見る」を開くと、そこで初めて `/api/dashboard/funnel` を要求する。
7. **AC7**: ログアウトして `other-owner@example.com` で入ると、「YouTube チャンネルがまだ連携されていません」と「設定を開く」が出る。
8. **AC8**: `viewer@example.com` で入ると、見出し右の「CSVをアップロード」が出ない。改善アクションの編集メニューは後続 feature の依存で、現在はどの役割にも出ない。URL の `video_ids=` に存在しない ID を足しても、エラーにならず無視される。
9. **AC9**: 開発者ツールで `/api/dashboard` の応答ヘッダーが `Cache-Control: private, no-store`。動画の画像は代替表示（上の注記）。
10. **AC10**: ブラウザの幅を 360、390、820、1440 に変えても横スクロールが出ない。
