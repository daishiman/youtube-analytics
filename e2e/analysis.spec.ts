// AI分析画面（docs/screens/03-ai-analysis.png）の E2E（3サイズ）。実 API と scripts/seed-local.sql を使う。
// 版番号はチャンネルごとの連番なので、サイズごとに独立したテナント（analysis-<project>@example.com）で流す
import { expect, type Page, test } from "@playwright/test";
import FIXTURE from "../tests/fixtures/skill-analysis-report.json" with { type: "json" };

async function devLogin(page: Page, email: string) {
  await page.goto("/login");
  await page.getByLabel("プライバシーポリシーと利用規約に同意します").check();
  await page.getByLabel("開発用ログインのメールアドレス").fill(email);
  await page.getByRole("button", { name: "開発用ログイン" }).click();
  await expect(page.getByText(/あなたの役割: /)).toBeVisible();
}

/** 初回分析の history_review（参照した版なし） */
const FIRST_ANALYSIS = {
  first_analysis: true,
  versions_used: [],
  previous_hypotheses: [],
  action_effects: [],
  changes: null,
};

/**
 * 取り込む結果 JSON。正本 fixture（/yt-analyze の実出力の見本）を複製し、題名・版・history_review だけを
 * 差し替える（tests/skill-analysis/helpers.ts の sampleReport と同じ）。依頼IDは選択中の依頼に任せる。
 * v2 は fixture の history_review のまま（v1 を参照し、候補は前回と同じ・下流の差あり）
 */
function report(version: number, extra: Record<string, unknown> = {}) {
  return {
    ...structuredClone(FIXTURE),
    request_id: undefined,
    version,
    title: `E2E週次分析 v${version}`,
    history_review: version === 1 ? FIRST_ANALYSIS : structuredClone(FIXTURE.history_review),
    psych_findings: [
      {
        layer: "感情",
        claim: "視聴者は結論の速さを期待している",
        evidence: [{ comment_id: "c1", quote: "早く結論が知りたい" }],
        counter_hypothesis: "単に動画が長いだけ",
        confidence: 0.6,
      },
    ],
    comment_emotions: [{ comment_id: "c1", emotion: "期待", intent: "質問" }],
    report_html: `<!doctype html><html><body><h1>E2E v${version}</h1></body></html>`,
    ...extra,
  };
}

const toast = (page: Page) => page.getByRole("status");

test("閲覧者は一覧・詳細を見られるが、書込ボタンは出ない", async ({ page }) => {
  await devLogin(page, "viewer@example.com");
  await page.goto("/analysis");
  await expect(page.getByRole("heading", { name: "AI分析", level: 1 })).toBeVisible();
  await expect(page.getByText("閲覧者は依頼を作れません")).toBeVisible();
  for (const name of [
    "Claude Code用プロンプトをコピー",
    "結果を取り込む",
    "キャンセル",
    "再実行",
  ]) {
    await expect(page.getByRole("button", { name })).toHaveCount(0);
  }
  // seed の5状態がそろって見える
  const requests = page.locator("#analysis-status");
  for (const id of ["A-0001", "A-0002", "A-0003", "A-0004", "A-0005"]) {
    await expect(requests.getByRole("button", { name: id })).toBeVisible();
  }
  await expect(requests.getByText("YouTube API の1日の上限に達しました")).toBeVisible();
  // スキルから作られた依頼（A-0002）には「自動」バッジが付く
  await expect(
    requests.getByRole("row", { name: /A-0002/ }).getByText("自動", { exact: true }),
  ).toBeVisible();

  await page.getByRole("button", { name: "8月の振り返り" }).click();
  await expect(page.getByRole("heading", { name: /8月の振り返り/ })).toBeVisible();
  // 要約の先頭に「前回からの変化」があり、参照した直近版（v1）・候補の変化・下流の差を示す
  const changes = page.getByRole("region", { name: "前回からの変化" });
  await expect(changes.getByRole("heading", { name: "前回からの変化" })).toBeVisible();
  await expect(changes).toContainText("参照した直近版: v1");
  await expect(changes).toContainText(
    "改善候補（v1 と比較）: 前回から変化（流入・クリック率 → 維持・加重平均視聴率）",
  );
  await expect(changes).toContainText("下流の差: 問い合わせ +4件・成約 +2件・売上 +480,000円");
  await expect(page.getByRole("button", { name: "改善アクションに登録" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "アーカイブ", exact: true })).toHaveCount(0);
  await expect(page.getByRole("checkbox", { name: "v1 を比較に使う" })).toBeVisible();
});

test("期間を切り替えると、表示と使用データが追従する", async ({ page }) => {
  await devLogin(page, "owner@example.com");
  await page.goto("/analysis");
  const shown = page.getByTestId("analysis-period");
  const before = await shown.textContent();
  const request = page.locator("#analysis-request");
  await request.getByRole("button", { name: "最新90日" }).click();
  await expect(request.getByRole("button", { name: "最新90日" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect(shown).not.toHaveText(before ?? "");
  await expect(page).toHaveURL(/period=90d/);

  await request.getByRole("button", { name: "任意" }).click();
  const dialog = page.getByRole("dialog", { name: "期間を選ぶ" });
  await dialog.getByLabel("開始日").fill("2026-08-01");
  await dialog.getByLabel("終了日").fill("2026-08-28");
  await dialog.getByRole("button", { name: "この期間にする" }).click();
  await expect(shown).toHaveText("2026年8月1日〜2026年8月28日");
  await expect(
    page.locator(".data-summary").getByText("2026年8月1日〜2026年8月28日"),
  ).toBeVisible();
});

test("補足指示は絵文字を1文字と数え、上限を超えると依頼を作らせない", async ({
  page,
}, testInfo) => {
  // owner@example.com は smoke がテナントを切り替えるので、サイズごとの専用アカウントを使う（送信しないので状態は変えない）
  await devLogin(page, `analysis-${testInfo.project.name}@example.com`);
  await page.goto("/analysis");
  const input = page.getByLabel("補足指示（任意）");
  const submit = page.getByRole("button", { name: "Claude Code用プロンプトをコピー" });
  // 😀 は UTF-16 では2単位だが、サーバの countChars と同じく1文字と数える
  await input.fill("😀".repeat(1000));
  await expect(page.getByText("1000/1000")).toBeVisible();
  await expect(submit).toBeEnabled();
  await input.fill("😀".repeat(1001));
  await expect(page.getByText("1001/1000")).toBeVisible();
  await expect(input).toHaveAttribute("aria-invalid", "true");
  await expect(page.getByRole("alert")).toHaveText("補足指示は1000文字以内にしてください");
  await expect(submit).toBeDisabled();
});

test("依頼 → コピー → 取込 → 登録 → 2版比較 → アーカイブ → 取消・再実行", async ({
  page,
  context,
}, testInfo) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await devLogin(page, `analysis-${testInfo.project.name}@example.com`);
  await page.goto("/analysis");
  await expect(page.getByText("まだレポートはありません")).toBeVisible();

  // ① 依頼とプロンプトのコピー
  await page.getByLabel("補足指示（任意）").fill("E2E の依頼です");
  await expect(page.getByText("9/1000")).toBeVisible();
  await page.getByRole("button", { name: "Claude Code用プロンプトをコピー" }).click();
  await expect(toast(page)).toContainText("依頼 A-0001 を作り、プロンプトをコピーしました");
  const copied = await page.evaluate(() => navigator.clipboard.readText());
  expect(copied).toContain("A-0001");

  // ② 実行状況に待機中で並び、選ぶと取込先になる
  const requests = page.locator("#analysis-status");
  await expect(requests.getByText("待機中").first()).toBeVisible();
  await requests.getByRole("button", { name: "A-0001" }).click();
  await expect(page).toHaveURL(/request=A-0001/);
  await expect(page.getByText("取込先: 選択中の依頼 A-0001")).toBeVisible();
  await expect(page.getByRole("complementary", { name: "選択中の依頼" })).toContainText(
    "E2E の依頼です",
  );

  // ③ 壊れた JSON は行番号付きで止める
  const json = page.getByLabel("結果JSON");
  await json.fill(JSON.stringify({ ...report(1), request_id: "A-9999" }));
  await page.getByRole("button", { name: "結果を取り込む" }).click();
  await expect(page.locator("#import-error")).toContainText(
    "JSONの依頼ID（A-9999）と選択中の依頼 A-0001 が異なります",
  );
  await json.fill('{\n  "version": 1,\n  "title": \n}');
  await page.getByRole("button", { name: "結果を取り込む" }).click();
  await expect(page.locator("#import-error")).toContainText("JSONの形式が正しくありません");
  await expect(page.locator("#import-error")).toContainText("行目");

  // 正しい JSON を取り込むと依頼が完了し、レポートが開く
  await json.fill(JSON.stringify(report(1), null, 2));
  await page.getByRole("button", { name: "結果を取り込む" }).click();
  await expect(toast(page)).toContainText("依頼 A-0001 の結果を取り込みました（v1）");
  await expect(page.getByRole("heading", { name: /E2E週次分析 v1/ })).toBeVisible();
  await expect(requests.getByText("完了").first()).toBeVisible();
  await expect(page.getByText("初回分析").first()).toBeVisible();

  // 選んだアクションを改善アクションへ登録（主対象は最初からチェック済み）
  const checklist = page.locator("section[aria-labelledby=actions-heading]");
  await expect(checklist.getByRole("checkbox")).toBeChecked();
  await checklist.getByRole("button", { name: "改善アクションに登録" }).click();
  await expect(toast(page)).toContainText("登録");
  await expect(checklist.getByText("登録済み")).toBeVisible();
  await expect(checklist.getByRole("checkbox")).toHaveCount(0);

  // 依頼を選ばずに取り込むと、完了済みの依頼が1件作られる（v2）
  await requests.getByRole("button", { name: "A-0001" }).click();
  await expect(page.getByText(/取込先: 選択中の依頼 A-0001 は完了のため/)).toBeVisible();
  await json.fill(JSON.stringify({ ...report(2), request_id: "A-0001" }));
  await page.getByRole("button", { name: "結果を取り込む" }).click();
  await expect(page.locator("#import-error")).toContainText(
    "JSONに依頼ID（A-0001）が含まれています",
  );
  await json.fill(JSON.stringify(report(2)));
  await page.getByRole("button", { name: "結果を取り込む" }).click();
  await expect(toast(page)).toContainText("完了にしました（v2）");
  await expect(page.getByRole("heading", { name: /E2E週次分析 v2/ })).toBeVisible();
  await expect(page.locator("dd", { hasText: /^取込（依頼/ })).toBeVisible();
  // 取り込んだ history_review の「前回からの変化」（候補は前回と同じ・下流の差・前回仮説の当否）
  const changes = page.getByRole("region", { name: "前回からの変化" });
  await expect(changes).toContainText("改善候補（v1 と比較）: 前回と同じ（流入・クリック率）");
  await expect(changes).toContainText("下流の差: 問い合わせ +2件・成約 +0件・売上 +20,000円");
  await expect(changes).toContainText("保留 → 採用");

  // 2つの版を比較
  await page.getByRole("checkbox", { name: "v1 を比較に使う" }).check();
  await page.getByRole("checkbox", { name: "v2 を比較に使う" }).check();
  await page.getByRole("button", { name: "2つの版を比較" }).click();
  const diff = page.getByRole("dialog", { name: "2つの版を比較" });
  await expect(diff.getByRole("row", { name: /レポート名/ })).toContainText("変化");
  await diff.getByRole("button", { name: "閉じる" }).click();

  // アーカイブすると一覧から消え、「アーカイブを表示」で戻る。元に戻せる
  await page.getByRole("button", { name: "アーカイブ", exact: true }).click();
  await expect(page.getByRole("button", { name: "元に戻す" })).toBeVisible();
  const list = page.locator(".report-list");
  await expect(list.getByRole("button", { name: "E2E週次分析 v2" })).toHaveCount(0);
  await page.getByLabel("アーカイブを表示").check();
  await expect(list.getByRole("button", { name: "E2E週次分析 v2" })).toBeVisible();
  await page.getByRole("button", { name: "元に戻す" }).click();
  await expect(page.getByRole("button", { name: "アーカイブ", exact: true })).toBeVisible();

  // 待機中の依頼は取り消せ、取消は再実行で新しい依頼になる
  await page.getByRole("button", { name: "Claude Code用プロンプトをコピー" }).click();
  await expect(toast(page)).toContainText("依頼 A-0003");
  const row = requests.getByRole("row", { name: /A-0003/ });
  await row.getByRole("button", { name: "キャンセル" }).click();
  await page
    .getByRole("dialog", { name: "依頼を取り消しますか？" })
    .getByRole("button", { name: "取り消す" })
    .click();
  await expect(row.getByText("取消")).toBeVisible();
  await row.getByRole("button", { name: "再実行" }).click();
  await expect(requests.getByRole("button", { name: "A-0004" })).toBeVisible();
  await expect(toast(page)).toContainText("依頼 A-0004 を作り、プロンプトをコピーしました");
  expect(await page.evaluate(() => navigator.clipboard.readText())).toContain("A-0004");
  await requests
    .getByRole("row", { name: /A-0004/ })
    .getByRole("button", { name: "プロンプトをコピー" })
    .click();
  await expect(toast(page)).toContainText("依頼 A-0004 のプロンプトをコピーしました");

  // クリップボードに書けないときは、依頼を作ったうえで手動コピー欄を選択状態で出す
  await page.evaluate(() => {
    navigator.clipboard.writeText = () => Promise.reject(new Error("denied"));
  });
  await page.getByRole("button", { name: "Claude Code用プロンプトをコピー" }).click();
  const manual = page.getByRole("region", { name: "手動コピー" });
  await expect(manual).toContainText("依頼 A-0005 を作りましたが、自動でコピーできませんでした");
  const prompt = manual.getByLabel("Claude Code用プロンプト");
  await expect(prompt).toBeFocused();
  await expect(prompt).toHaveValue(/A-0005/);
  await manual.getByRole("button", { name: "閉じる" }).click();
  await expect(manual).toHaveCount(0);
});
