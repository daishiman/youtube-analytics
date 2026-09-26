// ダッシュボード刷新（feat-dashboard-redesign）の E2E。docs/feat-dashboard-redesign/test-design.md の E1〜E8 に対応する
// seed（scripts/seed-local.sql）のテストチャンネルA（動画12本・90日分）を実 API で3サイズ回す。owner@ は他 spec がチャンネル管理を
// 切り替えるので、テナントAだけに所属する editor@（編集者）と viewer@（閲覧者）を使い並列実行での干渉を避ける
import { expect, type Page, test } from "@playwright/test";
import { devLogin } from "./helpers";

async function openDashboard(page: Page, query = "") {
  await page.goto(`/${query}`);
  await expect(page.getByRole("heading", { level: 1, name: "ダッシュボード" })).toBeVisible();
  await expect(page.locator(".dashboard-question")).toContainText("何が効いたか？");
  await expect(page.locator(".kpi-card")).toHaveCount(4);
}

test.describe("ダッシュボード", () => {
  test("E1 画像どおりの区画順で、KPI に出典バッジと前期比が出る", async ({ page }) => {
    await devLogin(page, "editor@example.com");
    await openDashboard(page);
    const order = await page
      .locator(
        ".dashboard-body > .scope-selector, .dashboard-body > .kpi-grid, .dashboard-body > #period-insight, .dashboard-body > #trend, .dashboard-body > .dashboard-grid, .dashboard-body > .details",
      )
      .evaluateAll((els) => els.map((e) => e.id || [...e.classList].find((c) => c !== "card")));
    expect(order).toEqual([
      "scope-selector",
      "kpi-grid",
      "period-insight",
      "trend",
      "dashboard-grid",
      "details",
    ]);
    await expect(page.locator(".kpi-card .source-badge")).toHaveCount(4);
    await expect(page.locator(".kpi-card .kpi-change").first()).toContainText(/[▲▼→]/);
    await expect(page.locator(".period-note")).toContainText("28日間");
    await expect(page.locator(".dashboard-question")).toHaveText("直近28日間、何が効いたか？");
    await expect(page.locator(".header-updated")).toContainText("基本日次の最終成功");
    await expect(page.locator("#period-insight")).toContainText("観測された変化");
    await expect(page.locator("#period-insight")).toContainText("次に見る動画");
    await expect(page.locator("#latest-report")).toContainText("8月の振り返り");
    await expect(page.locator("#active-actions .action-item")).toHaveCount(1);
    // 右カラムのカードは上の選択に連動しないことを、カード単体でも読めるようにする
    await expect(page.locator("#latest-report")).toContainText("期間・動画の選択には連動しません");
    await expect(page.locator("#active-actions")).toContainText("期間・動画の選択には連動しません");
  });

  test("E2 共通ヘッダーの期間を切り替えると再計算され、対象の選択は保たれる", async ({ page }) => {
    await devLogin(page, "editor@example.com");
    await openDashboard(page, "?scope=videos&video_ids=seedvid02,seedvid04");
    await page
      .getByRole("navigation", { name: "期間" })
      .getByRole("button", { name: "7日" })
      .click();
    await expect(page).toHaveURL(/period=7d/);
    await expect(page).toHaveURL(/video_ids=seedvid02%2Cseedvid04|video_ids=seedvid02,seedvid04/);
    await expect(page.locator(".period-note")).toContainText("7日間");
    await expect(page.locator(".dashboard-question")).toHaveText("直近7日間、何が効いたか？");
    await expect(page.locator(".video-table tbody tr")).toHaveCount(2);
  });

  test("期間切替の取得失敗では前の期間の実績を表示しない", async ({ page }) => {
    await devLogin(page, "editor@example.com");
    await openDashboard(page);
    await page.route("**/api/dashboard?period=7d*", (route) =>
      route.fulfill({
        status: 503,
        json: {
          error: { code: "UNAVAILABLE", message: "取得できません", hint: "再試行してください" },
        },
      }),
    );
    await page
      .getByRole("navigation", { name: "期間" })
      .getByRole("button", { name: "7日" })
      .click();
    await expect(page).toHaveURL(/period=7d/);
    await expect(page.getByRole("alert")).toContainText("取得できません");
    await expect(page.locator(".dashboard-body")).toHaveCount(0);
    await expect(page.locator(".kpi-card")).toHaveCount(0);
  });

  test("前期の日次欠測では変化率を保留し今期の動画候補を残す", async ({ page }) => {
    await devLogin(page, "editor@example.com");
    await page.route("**/api/dashboard", async (route) => {
      const response = await route.fetch();
      const body = await response.json();
      body.trend.previous[0] = null;
      await route.fulfill({ response, json: body });
    });
    await openDashboard(page);
    await expect(page.locator("#period-insight")).toContainText("前期の日次データに欠測");
    await expect(page.locator("#period-insight")).toContainText("変化率は保留");
    await expect(page.locator("#period-insight a")).toHaveCount(1);
  });

  test("今期の日次が欠測なら動画候補も保留する", async ({ page }) => {
    await devLogin(page, "editor@example.com");
    await page.route("**/api/dashboard", async (route) => {
      const response = await route.fetch();
      const body = await response.json();
      body.trend.current[0] = null;
      await route.fulfill({ response, json: body });
    });
    await openDashboard(page);
    await expect(page.locator("#period-insight")).toContainText("今期の日次データに欠測");
    await expect(page.locator("#period-insight a")).toHaveCount(0);
  });

  test("全動画の実測視聴回数が0なら欠測と区別する", async ({ page }) => {
    await devLogin(page, "editor@example.com");
    await page.route("**/api/dashboard", async (route) => {
      const response = await route.fetch();
      const body = await response.json();
      body.trend.current = body.trend.current.map((value: number | null) => value ?? 0);
      body.videos = body.videos.map((video: { views: number | null }) => ({ ...video, views: 0 }));
      await route.fulfill({ response, json: body });
    });
    await openDashboard(page);
    await expect(page.locator("#period-insight")).toContainText("視聴回数はすべて0回");
    await expect(page.locator("#period-insight a")).toHaveCount(0);
  });

  test("分析とアクションの情報カード: 最新レポートは AI分析の詳細へつなぎ、アクションの編集は準備中と示す", async ({
    page,
  }) => {
    await devLogin(page, "editor@example.com");
    await openDashboard(page);
    await expect(
      page.locator("#latest-report a[href='/analysis?report=seed-report-2']"),
    ).toBeVisible();
    await expect(page.locator("#active-actions")).toContainText("内容の編集と状態の更新は準備中");
    await expect(page.locator("#active-actions a[href^='/actions']")).toHaveCount(0);
    await expect(page.locator("#active-actions .action-item")).toHaveCount(1);
  });

  test("E3 動画を選ぶ: 既定は直近10本、11本以上も選べる", async ({ page }) => {
    await devLogin(page, "editor@example.com");
    await openDashboard(page);
    await page.getByRole("button", { name: "動画を選ぶ" }).click();
    await expect(page).toHaveURL(/scope=videos/);
    const picker = page.locator(".video-picker");
    await expect(picker.getByRole("checkbox", { checked: true })).toHaveCount(10);
    await picker.getByRole("checkbox", { checked: false }).first().check();
    await picker.getByRole("checkbox", { checked: false }).first().check();
    await picker.getByRole("button", { name: "12本で表示する" }).click();
    await expect(page.locator(".video-table tbody tr")).toHaveCount(12);
    await expect(page.getByText("12本の動画を対象にしています")).toBeVisible();
  });

  test("E4 動画別の実績: 視聴回数順の並べ替えと構成比への切替", async ({ page }) => {
    await devLogin(page, "editor@example.com");
    await openDashboard(page);
    const rows = page.locator(".video-table tbody tr");
    await expect(rows).toHaveCount(10);
    await page.getByLabel("並べ替え").selectOption("views");
    const views = await rows
      .locator('td[data-label="視聴回数"]')
      .evaluateAll((tds) => tds.map((td) => Number((td.textContent ?? "0").replace(/[^\d]/g, ""))));
    expect(views).toEqual([...views].sort((a, b) => b - a));
    await page.locator("#videos").getByRole("button", { name: "構成比" }).click();
    await expect(page.locator("#videos .chart-summary")).toContainText("上位3本");
    await expect(page.locator("#videos")).toContainText("表に表示中の10本の寄与");
    await expect(page.locator("#videos")).toContainText("分母は動画別視聴回数の合計");
    await expect(page.locator("#videos").getByRole("heading", { name: "切り口別" })).toBeVisible();
  });

  test("E11 動画行から期間を保って1本の分析・推移へ移る", async ({ page }) => {
    await devLogin(page, "editor@example.com");
    await openDashboard(page, "?period=7d");
    const firstVideo = page.locator(".video-table tbody tr").first().locator("a.video-cell");
    const title = await firstVideo.locator(".video-title").textContent();
    await firstVideo.click();
    await expect(page).toHaveURL(/period=7d/);
    await expect(page).toHaveURL(/scope=videos/);
    await expect(page.locator(".video-table tbody tr")).toHaveCount(1);
    await expect(page.locator(".scope-summary")).toContainText("1本の動画を対象にしています");
    await page.locator("#trend").getByRole("button", { name: "表" }).click();
    await expect(page.locator("#trend table thead th")).toHaveCount(3);
    await expect(page.locator(".video-table .video-title")).toHaveText(title ?? "");
  });

  test("E5 詳しく見るを開いたときだけファネルを取得する", async ({ page }) => {
    await devLogin(page, "editor@example.com");
    const funnelCalls: string[] = [];
    page.on("request", (r) => {
      if (r.url().includes("/api/dashboard/funnel")) funnelCalls.push(r.url());
    });
    await openDashboard(page);
    expect(funnelCalls).toHaveLength(0);
    await page.locator(".details summary").click();
    await expect(page.getByRole("heading", { name: "週次売上ファネル" })).toBeVisible();
    await expect(page.locator(".funnel-candidate")).toContainText("改善候補");
    await expect(page.locator(".funnel-results")).toContainText("登録者の増減（参考）");
    await expect(page.locator("section[aria-labelledby='funnel-heading']")).toContainText(
      "太平洋時間の日付をそのまま JST の週に入れた参考値",
    );
    await expect(page.getByRole("heading", { name: "データ品質" })).toBeVisible();
    await expect(page.locator(".quality-list")).toContainText(
      "チャンネル・動画日次を毎日3:00 JSTに収集",
    );
    await expect(page.locator(".quality-list")).toContainText("Studio CSVは部分取込");
    expect(funnelCalls.length).toBeGreaterThan(0);
  });

  test("ファネルの取得に失敗しても、その区画だけに知らせてほかの詳細は表示を続ける", async ({
    page,
  }) => {
    await devLogin(page, "editor@example.com");
    await page.route("**/api/dashboard/funnel*", (route) =>
      route.fulfill({
        status: 503,
        json: {
          error: {
            code: "UNAVAILABLE",
            message: "ファネルを取得できません",
            hint: "再試行してください",
          },
        },
      }),
    );
    await openDashboard(page);
    await page.locator(".details summary").click();
    const funnel = page.locator("section[aria-labelledby='funnel-heading']");
    await expect(funnel.getByRole("alert")).toHaveText(
      "ファネルを取得できません（再試行してください）",
    );
    await expect(funnel.locator(".funnel-results")).toHaveCount(0);
    await expect(page.getByRole("heading", { name: "データ品質" })).toBeVisible();
    await expect(page.locator(".quality-list")).toContainText(
      "チャンネル・動画日次を毎日3:00 JSTに収集",
    );
    await expect(page.locator(".kpi-card")).toHaveCount(4);
  });

  test("E12 利用可能なレポート種別を検索し、未取込と区別する", async ({ page }) => {
    await devLogin(page, "editor@example.com");
    await page.route("**/api/data/report-types", (route) =>
      route.fulfill({
        json: {
          status: "available",
          channelId: "UCseedChannelA000000000",
          reportTypes: [
            { id: "channel_basic_a2", name: "基本統計", deprecateTime: null, systemManaged: false },
            {
              id: "channel_reach_basic_a1",
              name: "サムネイル表示",
              deprecateTime: null,
              systemManaged: false,
            },
          ],
        },
      }),
    );
    await openDashboard(page);
    await page.locator(".details summary").click();
    await expect(
      page.getByRole("heading", { name: "利用可能なYouTubeレポート種別" }),
    ).toBeVisible();
    await expect(page.locator(".report-types-list li")).toHaveCount(2);
    await expect(page.locator(".details-block").last()).toContainText(
      "本体を取り込んだことは意味しません",
    );
    await page.getByRole("searchbox", { name: "種類を検索" }).fill("reach");
    await expect(page.locator(".report-types-list li")).toHaveCount(1);
    await expect(page.locator(".report-types-list")).toContainText("channel_reach_basic_a1");
  });

  test("E13 保存済みReporting原本の列名と取得リンクを確認する", async ({ page }) => {
    await devLogin(page, "editor@example.com");
    await page.route("**/api/data/reporting-reports?page=0", (route) =>
      route.fulfill({
        json: {
          reports: [
            {
              reportId: "report-a",
              reportTypeId: "channel_basic_a2",
              reportTypeVersion: "a2",
              startTime: "2026-09-20T08:00:00Z",
              endTime: "2026-09-21T08:00:00Z",
              createTime: "2026-09-23T00:00:00Z",
              header: ["day", "video_id", "new_column"],
              rowCount: 12,
              byteCount: 400,
              storedAt: "2026-09-24T00:00:00Z",
            },
          ],
          total: 1,
          page: 0,
          pageSize: 100,
        },
      }),
    );
    await openDashboard(page);
    await page.locator(".details summary").first().click();
    await expect(page.getByRole("heading", { name: "保存済みの原本" })).toBeVisible();
    await page.getByText("列名を見る（3列）").click();
    await expect(page.locator(".report-raw-columns")).toContainText("new_column");
    await expect(page.getByRole("link", { name: "CSV原本を取得" })).toHaveAttribute(
      "href",
      "/api/data/reporting-reports/report-a/csv",
    );
  });

  test("E14 流入元の原データを列順とページ送りで確認する", async ({ page }) => {
    await devLogin(page, "editor@example.com");
    const firstRows = Array.from({ length: 100 }, (_, index) => [
      "2026-09-20",
      `source-${index}`,
      index,
    ]);
    await page.route("**/api/data/analytics-raw", (route) =>
      route.fulfill({
        json: {
          reports: [
            {
              reportKey: "traffic_daily",
              periodStart: "2026-08-17",
              periodEnd: "2026-09-20",
              fetchedAt: "2026-09-25T00:00:00Z",
              availability: "available",
              columnHeaders: [
                { name: "day", columnType: "DIMENSION", dataType: "STRING" },
                { name: "insightTrafficSourceType", columnType: "DIMENSION", dataType: "STRING" },
                { name: "views", columnType: "METRIC", dataType: "INTEGER" },
              ],
              rows: firstRows,
              rowCount: 101,
              hasMore: true,
              source: "youtube_analytics_api",
            },
          ],
        },
      }),
    );
    await page.route("**/api/data/analytics-raw/traffic_daily/rows?offset=100&limit=100", (route) =>
      route.fulfill({
        json: {
          reportKey: "traffic_daily",
          offset: 100,
          limit: 100,
          rowCount: 101,
          hasMore: false,
          rows: [["2026-09-20", "source-last", 0]],
        },
      }),
    );
    await openDashboard(page);
    await page.locator(".details summary").first().click();
    const panel = page.locator(".analytics-raw");
    await expect(
      panel.getByRole("heading", { name: "流入・端末・地域の分析データ" }),
    ).toBeVisible();
    await expect(panel.locator("th")).toContainText(["day", "insightTrafficSourceType", "views"]);
    await panel.getByRole("button", { name: "次へ" }).click();
    await expect(panel.locator("tbody")).toContainText("source-last");
  });

  test("E6 閲覧者には CSVアップロードとアクションの…メニューが出ない", async ({ page }) => {
    await devLogin(page, "viewer@example.com");
    await openDashboard(page);
    await expect(page.getByRole("link", { name: "CSVをアップロード" })).toHaveCount(0);
    await expect(page.locator("#active-actions .icon-button")).toHaveCount(0);
  });

  test("E7 他テナントや存在しない video_ids は黙って除外される", async ({ page }) => {
    await devLogin(page, "editor@example.com");
    await openDashboard(page, "?scope=videos&video_ids=seedvid01,not-exists,other-tenant-video");
    await expect(page.locator(".video-table tbody tr")).toHaveCount(1);
    await expect(page.getByRole("alert")).toHaveCount(0);
  });

  test("E8 横スクロールが出ず、操作ボタンは44px以上", async ({ page }) => {
    await devLogin(page, "editor@example.com");
    await openDashboard(page);
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(0);
    const box = await page.getByRole("button", { name: "動画を選ぶ" }).boundingBox();
    expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);
  });

  test("E9 スクロール中もナビと共通ヘッダーが見え、本文に重ならない", async ({ page }) => {
    const viewport = page.viewportSize();
    const width = viewport?.width ?? 1440;
    await page.setViewportSize({
      width: width < 600 ? 360 : width < 900 ? 768 : width,
      height: viewport?.height ?? 900,
    });
    await devLogin(page, "editor@example.com");
    await openDashboard(page);
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(100);
    const positions = await page.evaluate(() => {
      const sidebar = document.querySelector(".sidebar")?.getBoundingClientRect();
      const header = document.querySelector(".app-header")?.getBoundingClientRect();
      return {
        width: window.innerWidth,
        sidebarTop: sidebar?.top ?? -1,
        sidebarBottom: sidebar?.bottom ?? -1,
        headerTop: header?.top ?? -1,
        headerBottom: header?.bottom ?? -1,
        overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      };
    });
    expect(positions.sidebarTop).toBeGreaterThanOrEqual(-1);
    expect(positions.sidebarTop).toBeLessThanOrEqual(1);
    if (positions.width < 900) {
      expect(positions.headerTop).toBeGreaterThanOrEqual(positions.sidebarBottom - 1);
      expect(positions.headerTop).toBeLessThanOrEqual(positions.sidebarBottom + 1);
    } else {
      expect(positions.headerTop).toBeGreaterThanOrEqual(-1);
      expect(positions.headerTop).toBeLessThanOrEqual(1);
    }
    expect(positions.overflow).toBeLessThanOrEqual(0);

    await page.locator("#videos").evaluate((element) => element.scrollIntoView());
    const anchor = await page.evaluate(() => ({
      top: document.querySelector("#videos")?.getBoundingClientRect().top ?? -1,
      headerBottom: document.querySelector(".app-header")?.getBoundingClientRect().bottom ?? -1,
    }));
    expect(anchor.top).toBeGreaterThanOrEqual(anchor.headerBottom);
  });

  test("900px未満では下部タブが固定され、最下部までスクロールしてもフッターを隠さない", async ({
    page,
  }) => {
    test.skip((page.viewportSize()?.width ?? 1440) >= 900, "下部タブは900px未満だけ");
    await devLogin(page, "editor@example.com");
    await openDashboard(page);
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    await expect
      .poll(() =>
        page.evaluate(
          () => window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 1,
        ),
      )
      .toBe(true);
    const layout = await page.evaluate(() => {
      const nav = document.querySelector(".sidebar nav.main-nav");
      const footer = document.querySelector(".site-footer");
      return {
        position: nav ? getComputedStyle(nav).position : "",
        navTop: nav?.getBoundingClientRect().top ?? -1,
        navBottom: nav?.getBoundingClientRect().bottom ?? -1,
        viewportBottom: window.innerHeight,
        footerBottom: footer?.getBoundingClientRect().bottom ?? Number.POSITIVE_INFINITY,
      };
    });
    expect(layout.position).toBe("fixed");
    expect(layout.navBottom).toBeLessThanOrEqual(layout.viewportBottom + 1);
    expect(layout.navBottom).toBeGreaterThanOrEqual(layout.viewportBottom - 1);
    expect(layout.footerBottom).toBeLessThanOrEqual(layout.navTop + 1);
  });

  test("E10 無効な動画IDだけなら既定10本へ戻さず選び直せる", async ({ page }) => {
    await devLogin(page, "editor@example.com");
    await openDashboard(page, "?scope=videos&video_ids=not-exists");
    await expect(page.locator(".scope-summary")).toContainText("対象の動画がありません");
    await expect(page.locator(".video-picker")).toBeVisible();
    await expect(page.locator(".video-table tbody tr")).toHaveCount(0);
  });
});
