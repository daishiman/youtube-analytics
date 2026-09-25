# 週次 AI 分析の自動実行（launchd）

毎週月曜 09:00（JST）に、この Mac で `claude -p "/yt-analyze"` を起動する。依頼ID は渡さないので、依頼はスキルが個人トークンで `POST /api/skill/requests` を呼んで作る（期間はサーバ既定の最新28日）。このスクリプト自体はアプリの API を呼ばない。

| ファイル | 役割 |
|---|---|
| `com.youtube-analytics.weekly-analysis.plist` | LaunchAgent の定義（毎週月曜 09:00、`StartCalendarInterval` Weekday=1 Hour=9 Minute=0） |
| `run-weekly-analysis.sh` | トークンを用意して `claude -p "/yt-analyze"` を起動し、ログと終了コードを残す |

## 前提

- Mac のタイムゾーンが Asia/Tokyo であること（launchd はローカル時刻で動く）。`sudo systemsetup -gettimezone` で確認できる。
- `claude` と `node`（v22 以上）が使えること。plist の `PATH` に入っていない場所にある場合は、plist の `EnvironmentVariables` に `CLAUDE_BIN` を追加する。
- 設定画面で個人トークン（`yta_` で始まる。オーナーか編集者のもの）を発行済みであること。
- 月曜 09:00 に Mac がスリープしていた場合、launchd は起床後に1回だけ実行する。電源が切れていた場合は実行されない。

## 設置

リポジトリ直下で次を実行する。

```bash
# 1. トークンをキーチェーンに登録する（入力を求められたらトークンを貼り付ける。履歴に残さないため -w の値は省く）
security add-generic-password -a "$USER" -s youtube-analytics-skill -w

# 2. ログの置き場を作る
mkdir -p ~/Library/Logs/youtube-analytics

# 3. plist の __REPO_ROOT__ と __HOME__ を置き換えて LaunchAgents に置く（リポジトリ内の plist は書き換えない）
#    cp でそのまま置かない。plutil -lint は置換漏れを検出しないので、最後の grep で 0 を確かめる
sed -e "s#__REPO_ROOT__#$(pwd)#g" -e "s#__HOME__#$HOME#g" \
  ops/launchd/com.youtube-analytics.weekly-analysis.plist \
  > ~/Library/LaunchAgents/com.youtube-analytics.weekly-analysis.plist
plutil -lint ~/Library/LaunchAgents/com.youtube-analytics.weekly-analysis.plist
grep -cE '__(REPO_ROOT|HOME)__' ~/Library/LaunchAgents/com.youtube-analytics.weekly-analysis.plist   # 0 なら置換済み

# 4. 前提がそろっているかを確かめる（claude は起動しない）
bash ops/launchd/run-weekly-analysis.sh --dry-run

# 5. 登録する
launchctl bootstrap "gui/$(id -u)" ~/Library/LaunchAgents/com.youtube-analytics.weekly-analysis.plist
launchctl print "gui/$(id -u)/com.youtube-analytics.weekly-analysis" | head -20
```

アプリの URL が既定（`http://localhost:8791`）と違う場合は、plist の `EnvironmentVariables` に `YTA_BASE_URL` を追加する。トークンは plist に書かない。

すぐに1回試すには `launchctl kickstart -k "gui/$(id -u)/com.youtube-analytics.weekly-analysis"` を使う。AI分析画面で作った依頼を手で処理するには `bash ops/launchd/run-weekly-analysis.sh --request-id A-0001` を使う。

## 解除

```bash
launchctl bootout "gui/$(id -u)/com.youtube-analytics.weekly-analysis"
rm ~/Library/LaunchAgents/com.youtube-analytics.weekly-analysis.plist
# トークンも消す場合
security delete-generic-password -s youtube-analytics-skill
```

## ログの確認

| 場所 | 内容 |
|---|---|
| `~/Library/Logs/youtube-analytics/weekly-analysis-<日時>.log` | 1回分の実行ログ（開始・トークンの取得元・claude の出力・終了コード）。90日で自動削除（`YTA_LOG_RETENTION_DAYS` で変更可） |
| `~/Library/Logs/youtube-analytics/last-failure.txt` | 直近の失敗の日時・終了コード・ログのパス。次に成功すると消える |
| `~/Library/Logs/youtube-analytics/launchd.out.log` / `launchd.err.log` | launchd が受けた標準出力・標準エラー（スクリプトが起動できなかった場合の手がかり） |

```bash
ls -t ~/Library/Logs/youtube-analytics/weekly-analysis-*.log | head -1 | xargs cat
cat ~/Library/Logs/youtube-analytics/last-failure.txt
launchctl print "gui/$(id -u)/com.youtube-analytics.weekly-analysis" | grep -E "last exit|state"
```

トークンの値はログに出さない。分析フォルダ（HTML と結果 JSON）は `~/.youtube-analytics/yt-analyze-runs/` に残る（`YTA_WORK_ROOT` で変更可）。

## 終了コードとトラブル時の対応

失敗すると macOS の通知を出す（`YTA_NOTIFY=0` で止められる。外部には送らない）。スキル側で失敗した場合、依頼は AI分析画面で「失敗」になり、理由が表示される。

ランチャ（`run-weekly-analysis.sh`）の終了コードは、この節を正本とする。ランチャ自身が決める終了コードは次のとおり。

| 終了コード | 意味 | 対応 |
|---|---|---|
| 0 | 成功 | AI分析画面で新しい版を確認する |
| 2 | 引数の誤り（ランチャかスキルの引数） | 実行ログの「引数の誤り」の行を見る。`--request-id` は `A-0001` の形で指定する |
| 10 | トークンが無い・形式が違う | 「設置」の手順1でキーチェーンに登録し直す |
| 11 | `claude` が見つからない | `which claude` の結果を plist の `PATH` に足すか、`CLAUDE_BIN` を設定する |
| 12 | 前回の実行が終わっていない | 実行中でなければ `~/Library/Logs/youtube-analytics/weekly-analysis.lock` を削除する |
| 13 | リポジトリかスキルが見つからない | plist の `__REPO_ROOT__` の置換先を確認する |
| 20 | claude の出力からスキルの終了コードを読めない | 実行ログで claude の出力を確認する（権限の確認待ちで止まった場合は `YTA_CLAUDE_ALLOWED_TOOLS` を見直す） |

claude を起動した後は、claude が非0で終わればその終了コードを、claude が正常に終わってスキル（`yt-analyze.mjs`）が失敗すればスキルの終了コードをそのまま返す。どちらかは実行ログの「claude が終了コード」か「/yt-analyze が終了コード」の行で分かる。スキルの終了コードの意味は `.claude/skills/yt-analyze/SKILL.md` が正本で、週次実行での対応は次のとおり。

| 終了コード | スキルでの意味 | 対応 |
|---|---|---|
| 1 | その他の失敗（report-design-system の検査不合格など） | 実行ログの「失敗しました」の行を見て直す |
| 3 | アプリに接続できない | アプリが起動しているか、`YTA_BASE_URL` が正しいかを確認する |
| 4 | 401・403（トークン失効、または閲覧者のトークン） | 設定画面でオーナーか編集者のトークンを発行し直し、キーチェーンを更新する（`security add-generic-password -U ...`） |
| 5 | 404（依頼が見つからない。他テナントの request_id を含む） | `--request-id` で渡した依頼ID と、トークンのテナントが合っているかを確かめる |
| 6 | 409（依頼が取消済み） | 次の週次実行を待つか、新しい依頼を作る |

HTTP の状態とエラーコードごとの切り分けと、送信に失敗した依頼の再実行（版が重複して増えない理由）は `docs/feat-skill-analysis-reports/runbook.md` の4節・6節を見る。
