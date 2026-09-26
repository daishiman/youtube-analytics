// 設定画面（docs/screens/05-settings.png）の E2E。API は page.route で固定し、画面の振る舞いだけを3サイズで確かめる
import { expect, type Page, test } from "@playwright/test";
import { FOOTER_BADGES } from "../web/components/SiteFooter";

type Role = "owner" | "editor" | "viewer";

const user = { userId: "user-self", email: "self@example.com" };
const tenant = (role: Role) => ({ tenantId: "tenant-a", name: "チャンネル管理A", role });

function settings(role: Role, overrides: Record<string, unknown> = {}) {
  const owner = role === "owner";
  return {
    tenant: { tenantId: "tenant-a", name: "チャンネル管理A" },
    role,
    permissions: { manageSettings: owner, writeContent: role !== "viewer", manageMembers: owner },
    youtube: {
      status: "正常",
      channel: {
        channelId: "UC_seed_a",
        title: "テストチャンネルA",
        thumbnailUrl: null,
        subscriberCount: 12345,
        connectedAt: "2026-09-01T00:00:00.000Z",
      },
      collectionStatus: "チャンネル・動画日次を毎日3:00 JSTに収集",
      lastCollectedAt: "2026-09-24T03:00:00.000Z",
      lastCsvImportAt: "2026-09-20T10:00:00.000Z",
      scopes: ["youtube.readonly", "yt-analytics.readonly"],
      captions: { enabled: false, availability: "preparing", dailyLimit: 4 },
      googleClient: {
        configured: true,
        clientId: "123456789012-seedclient.apps.googleusercontent.com",
        updatedAt: "2026-09-01T00:00:00.000Z",
      },
      pendingDeletionDueAt: null,
    },
    imports: [
      {
        import_id: "imp-1",
        kind: "csv",
        file_name: "studio-2026-08.csv",
        period: "2026-08",
        rows: 31,
        status: "完了",
        error: null,
        has_original: 1,
        created_at: "2026-09-20T10:00:00.000Z",
      },
      {
        import_id: "imp-2",
        kind: "csv",
        file_name: "broken.csv",
        period: null,
        rows: null,
        status: "失敗",
        error: "見出し行に「日付」がありません",
        has_original: 0,
        created_at: "2026-09-19T10:00:00.000Z",
      },
    ],
    tokens: [
      {
        token_id: "tok-1",
        name: "自宅のMac",
        created_at: "2026-09-10T00:00:00.000Z",
        last_used_at: null,
      },
    ],
    tokenLimit: 5,
    usage: [
      {
        key: "youtube_units",
        label: "YouTube API",
        used: null,
        limit: 10000,
        unit: "units",
        level: "unknown",
      },
      {
        key: "d1_writes",
        label: "D1 書込（本日）",
        used: null,
        limit: 100000,
        unit: "行",
        level: "unknown",
      },
      { key: "d1_storage", label: "D1 容量", used: 0.75, limit: 1, unit: "GB", level: "warn" },
      { key: "r2_storage", label: "R2 容量", used: 9.5, limit: 10, unit: "GB", level: "danger" },
      {
        key: "captions",
        label: "字幕取得（本日・チャンネル管理ごと）",
        used: null,
        limit: 4,
        unit: "本",
        level: "unknown",
      },
    ],
    deletion: null,
    ...overrides,
  };
}

async function mockApp(page: Page, role: Role, overrides: Record<string, unknown> = {}) {
  const current = tenant(role);
  await page.route("**/api/me", (route) =>
    route.fulfill({
      json: {
        user,
        tenants: [current],
        currentTenant: current,
        signupClosed: false,
        lastUpdatedAt: "2026-09-24T03:00:00.000Z",
      },
    }),
  );
  await page.route("**/api/settings", (route) =>
    route.fulfill({ json: settings(role, overrides) }),
  );
  await page.route("**/api/tenants/tenant-a/members", (route) =>
    route.fulfill({
      json: {
        members: [
          { user_id: "user-self", email: user.email, role, joined_at: "2026-09-01T00:00:00.000Z" },
        ],
      },
    }),
  );
  await page.route("**/api/tenants/tenant-a/invites", (route) =>
    route.fulfill({ json: { invites: [] } }),
  );
}

const apiError = (code: string, message: string, hint: string) => ({
  error: { code, message, hint },
});

test("オーナー: メンバー管理を加えた6区画が指定順に並ぶ", async ({ page }) => {
  await mockApp(page, "owner");
  await page.goto("/settings");
  await expect(page.getByRole("heading", { name: "設定", level: 1 })).toBeVisible();
  await expect(page.getByRole("heading", { level: 2 })).toHaveText([
    "YouTube連携",
    "データ取込",
    "Claude Code連携トークン",
    "メンバー（チャンネル管理A）",
    "無料枠の使用状況",
    "データを削除",
  ]);
  await expect(page.getByText("テストチャンネルA")).toBeVisible();
  await expect(page.locator("#youtube dl").filter({ hasText: "収集状況" })).toContainText(
    "チャンネル・動画日次を毎日3:00 JSTに収集",
  );
  await expect(page.getByRole("list", { name: "付与スコープ" })).toContainText("youtube.readonly");
});

test("閲覧者: メンバー区画と書込ボタンが出ない", async ({ page }) => {
  await mockApp(page, "viewer");
  await page.goto("/settings");
  await expect(page.getByRole("heading", { name: "YouTube連携" })).toBeVisible();
  await expect(page.getByRole("heading", { name: /^メンバー/ })).toHaveCount(0);
  for (const name of [
    "再連携",
    "連携解除",
    "新しいトークンを発行",
    "データを削除",
    "自宅のMac を失効",
  ]) {
    await expect(page.getByRole("button", { name })).toHaveCount(0);
  }
  await expect(page.getByRole("tablist", { name: "取込の種類" })).toHaveCount(0);
  await expect(page.getByRole("switch", { name: "字幕を自動取得する" })).toBeDisabled();
});

test("取込履歴は失敗理由を表示する", async ({ page }) => {
  await mockApp(page, "editor");
  await page.goto("/settings");
  const history = page.getByRole("table", { name: "取込履歴" });
  await expect(history).toContainText("broken.csv");
  await expect(history).toContainText("見出し行に「日付」がありません");
});

test("CSV原本の全列をページ送りで確認でき、解析状態を混同しない", async ({ page }) => {
  await mockApp(page, "editor");
  await page.route("**/api/imports/imp-1/preview?*", (route) => {
    const offset = Number(new URL(route.request().url()).searchParams.get("offset"));
    return route.fulfill({
      json: {
        importId: "imp-1",
        fileName: "studio-2026-08.csv",
        status: "完了",
        headers: ["動画のタイトル", "視聴回数", "未定義の新しい列"],
        rows: offset === 0 ? [["A動画", "123", "値A"]] : [["B動画", "456", "値B"]],
        totalRows: 51,
        offset,
        limit: 50,
      },
    });
  });
  await page.goto("/settings");
  await page
    .getByRole("table", { name: "取込履歴" })
    .getByRole("button", { name: "全列を見る" })
    .click();
  const preview = page.getByRole("table", { name: "studio-2026-08.csv のCSV原本" });
  await expect(preview).toContainText("未定義の新しい列");
  await expect(preview).toContainText("値A");
  await page.getByRole("button", { name: "次の50行" }).click();
  await expect(preview).toContainText("値B");
  await expect(
    page.getByText("指標への反映状況は取込履歴の状態を確認してください。"),
  ).toBeVisible();
});

test("取込タブの受付形式が揃い、選んだCSVを送信できる", async ({ page }) => {
  await mockApp(page, "editor");
  let uploadCount = 0;
  await page.route("**/api/imports", (route) => {
    uploadCount += 1;
    return route.fulfill({
      status: 201,
      json: { importId: "new-csv", status: "処理待ち", error: null },
    });
  });
  await page.goto("/settings");
  const fileInput = page.locator('input[type="file"]');
  await expect(fileInput).toHaveAttribute("accept", ".csv");
  await expect(
    page.getByText("YouTube Studio のCSV、または事業週次CSV .csv（5MBまで）"),
  ).toBeVisible();
  await fileInput.setInputFiles({
    name: "report.csv",
    mimeType: "text/csv",
    buffer: Buffer.from("a,b\n1,2"),
  });
  await expect(page.getByText("「report.csv」を受け付けました。")).toBeVisible();
  expect(uploadCount).toBe(1);

  await page.getByRole("tab", { name: "字幕(SRT・VTT)" }).click();
  await expect(fileInput).toHaveAttribute("accept", ".srt,.vtt");
  await expect(page.getByText("字幕ファイル .srt / .vtt（1MBまで）")).toBeVisible();
  await page.getByRole("tab", { name: "画像" }).click();
  await expect(fileInput).toHaveAttribute("accept", ".png,.jpg,.jpeg,.webp");
  await expect(
    page.getByText("サムネイルなどの画像 .png / .jpg / .jpeg / .webp（10MBまで）"),
  ).toBeVisible();
});

test("Studio CSV の対応列と未対応列・期間未確定を確認する", async ({ page }) => {
  const imported = {
    ...settings("editor").imports[0],
    mapped_columns: 2,
    unmapped_columns: 1,
    unresolved_rows: 1,
    period_status: "unknown",
  };
  await mockApp(page, "editor", { imports: [imported] });
  await page.route("**/api/imports/imp-1/mapping", (route) =>
    route.fulfill({
      json: {
        importId: "imp-1",
        studioKind: "table",
        mappedColumns: 2,
        unmappedColumns: 1,
        unresolvedRows: 1,
        periodStatus: "unknown",
        columns: [
          {
            ordinal: 0,
            header: "コンテンツ",
            mappingKey: "videoId",
            unit: "video_id",
            status: "mapped",
          },
          { ordinal: 1, header: "視聴回数", mappingKey: "views", unit: "count", status: "mapped" },
          { ordinal: 2, header: "新しい列", mappingKey: null, unit: null, status: "unmapped" },
        ],
      },
    }),
  );
  await page.goto("/settings");
  await expect(page.locator("#imports")).toContainText("既知列を取込");
  await page.getByRole("button", { name: "列の対応" }).click();
  const panel = page.locator("#csv-mapping-heading").locator("..");
  await expect(panel).toContainText("期間が特定できない表");
  await expect(page.getByRole("table", { name: "studio-2026-08.csv の列の対応" })).toContainText(
    "新しい列",
  );
  await expect(page.getByRole("table", { name: "studio-2026-08.csv の列の対応" })).toContainText(
    "未対応",
  );
});

test("CSV の取得元に、連携中チャンネルの Studio 画面へのリンクを出す", async ({ page }) => {
  await mockApp(page, "editor");
  await page.goto("/settings");
  const link = page.getByRole("link", { name: /YouTube Studio のアナリティクス/ });
  await expect(link).toHaveAttribute("target", "_blank");
  await expect(link).toHaveAttribute("rel", "noopener noreferrer");
  const href = new URL((await link.getAttribute("href")) ?? "");
  expect(href.pathname).toBe("/channel/UC_seed_a/analytics/tab-overview/period-default/explore");
  expect(href.searchParams.get("entity_id")).toBe("UC_seed_a");
  // 字幕タブでは CSV の取得元を出さない
  await page.getByRole("tab", { name: "字幕(SRT・VTT)" }).click();
  await expect(link).toHaveCount(0);
});

test("未連携なら CSV の取得元リンクの代わりに案内文を出す", async ({ page }) => {
  const base = settings("owner");
  await mockApp(page, "owner", { youtube: { ...base.youtube, status: "未連携", channel: null } });
  await page.goto("/settings");
  await expect(
    page.getByText("チャンネルを連携すると、そのチャンネルの画面を開くリンク"),
  ).toBeVisible();
  await expect(page.getByRole("link", { name: /YouTube Studio のアナリティクス/ })).toHaveCount(0);
});

test("無料枠は 70% で黄・90% で赤、YouTube のプロジェクト別使用率は推定しない", async ({
  page,
}) => {
  await mockApp(page, "owner");
  await page.goto("/settings");
  await expect(page.locator('[data-usage="d1_storage"]')).toHaveClass(/usage-warn/);
  await expect(page.locator('[data-usage="r2_storage"]')).toHaveClass(/usage-danger/);
  await expect(page.locator('[data-usage="youtube_units"]')).toHaveClass(/usage-unknown/);
  await expect(page.locator('[data-usage="d1_writes"]')).toHaveClass(/usage-unknown/);
  await expect(page.locator('[data-usage="captions"]')).toHaveClass(/usage-unknown/);
  await expect(page.locator("#usage")).toContainText("Google Cloud Console で確認してください");
  await expect(page.getByText("Cloudflare の値は1時間ごとに更新します。")).toBeVisible();
});

test("字幕の自動取得: 運営チャンネル管理以外は準備中で押せない", async ({ page }) => {
  await mockApp(page, "owner");
  await page.goto("/settings");
  await expect(page.getByRole("switch", { name: "字幕を自動取得する" })).toBeDisabled();
  await expect(page.locator("#youtube").getByText("準備中", { exact: true })).toBeVisible();
  await expect(page.locator("#youtube")).toContainText("現在、字幕の収集機能は利用できません");
  await expect(page.locator("#youtube")).toContainText("1日4本");
});

test("字幕の自動取得: 既にONのチャンネル管理は準備中でもOFFにできる", async ({ page }) => {
  const base = settings("owner");
  await mockApp(page, "owner", {
    youtube: {
      ...base.youtube,
      captions: { enabled: true, availability: "preparing", dailyLimit: 4 },
    },
  });
  await page.goto("/settings");
  const toggle = page.getByRole("switch", { name: "字幕を自動取得する" });
  await expect(toggle).toBeChecked();
  await expect(toggle).toBeEnabled();
});

test("字幕の自動取得: 接続情報が未登録でも既存ONはOFFにできる", async ({ page }) => {
  const base = settings("owner");
  await mockApp(page, "owner", {
    youtube: {
      ...base.youtube,
      captions: { enabled: true, availability: "preparing", dailyLimit: 4 },
      googleClient: { configured: false, clientId: null, updatedAt: null },
    },
  });
  await page.goto("/settings");
  await expect(page.getByRole("switch", { name: "字幕を自動取得する" })).toBeEnabled();
});

test("チャンネル選択: 別チャンネル管理で連携済みのチャンネルは 409 を表示する", async ({
  page,
}) => {
  await mockApp(page, "owner", {
    youtube: { ...settings("owner").youtube, status: "未連携", channel: null, scopes: [] },
  });
  await page.route("**/api/youtube/channel-candidates", (route) =>
    route.fulfill({
      json: {
        candidates: [
          {
            channelId: "UC_taken",
            title: "他で連携済みのチャンネル",
            thumbnailUrl: null,
            subscriberCount: 100,
            linkedElsewhere: true,
          },
          {
            channelId: "UC_free",
            title: "自分のチャンネル",
            thumbnailUrl: null,
            subscriberCount: 200,
            linkedElsewhere: false,
          },
        ],
      },
    }),
  );
  await page.route("**/api/youtube/channel", (route) =>
    route.fulfill({
      status: 409,
      json: apiError(
        "CHANNEL_ALREADY_LINKED",
        "このチャンネルは別のチャンネル管理で連携済みです",
        "先に連携している側で連携解除してから、もう一度お試しください",
      ),
    }),
  );
  await page.goto("/settings?select=channel");
  await expect(page).toHaveURL(/\/settings$/);
  const picker = page.getByRole("group", { name: "連携するチャンネルを選んでください" });
  await expect(picker.getByText("別のチャンネル管理で連携済み")).toBeVisible();
  await picker.getByLabel(/他で連携済みのチャンネル/).check();
  await page.getByRole("button", { name: "このチャンネルを連携" }).click();
  await expect(page.getByRole("alert")).toContainText("別のチャンネル管理で連携済みです");
});

test("トークン: 6本目は 409、発行時の平文は1回だけ表示する", async ({ page }) => {
  await mockApp(page, "editor");
  let issued = 0;
  await page.route("**/api/skill-tokens", (route) => {
    if (route.request().method() !== "POST") return route.fallback();
    issued += 1;
    return issued === 1
      ? route.fulfill({
          status: 201,
          json: {
            tokenId: "tok-2",
            name: "会社のPC",
            token: "yta_plain_secret_once",
            createdAt: "2026-09-24T00:00:00.000Z",
          },
        })
      : route.fulfill({
          status: 409,
          json: apiError(
            "TOKEN_LIMIT",
            "トークンは1人5本まで発行できます",
            "使っていないトークンを失効してから、もう一度発行してください",
          ),
        });
  });
  await page.goto("/settings");
  const name = page.getByLabel("トークンの名前");
  await name.fill("会社のPC");
  await page.getByRole("button", { name: "新しいトークンを発行" }).click();
  await expect(page.getByLabel("発行したトークン")).toHaveValue("yta_plain_secret_once");

  await name.fill("6本目");
  await page.getByRole("button", { name: "新しいトークンを発行" }).click();
  await expect(page.locator("#tokens").getByRole("alert")).toContainText("1人5本まで");

  await page.reload();
  await expect(page.getByLabel("発行したトークン")).toHaveCount(0);
});

const NO_CLIENT = { configured: false, clientId: null, updatedAt: null };

test("Google Cloud 未登録: 登録欄とリダイレクト URI を出し、連携ボタンは押せない", async ({
  page,
}) => {
  const base = settings("owner");
  await mockApp(page, "owner", {
    youtube: { ...base.youtube, status: "未連携", channel: null, googleClient: NO_CLIENT },
  });
  let sent: unknown = null;
  await page.route("**/api/youtube/google-client", (route) => {
    sent = route.request().postDataJSON();
    return route.fulfill({
      json: { configured: true, clientId: "123-abc.apps.googleusercontent.com", updatedAt: null },
    });
  });
  await page.goto("/settings");
  const section = page.locator("#youtube");
  await expect(section.getByText("未登録")).toBeVisible();
  await expect(section.getByRole("button", { name: "YouTubeと連携" })).toBeDisabled();
  const origin = new URL(page.url()).origin;
  await expect(section.getByLabel("承認済みのリダイレクト URI")).toHaveValue(
    `${origin}/api/oauth/callback`,
  );
  // 準備手順は未登録のとき最初から開き、Console への直リンクと同じ URI を出す
  const guide = section.locator("details.guide");
  await expect(guide).toHaveAttribute("open", "");
  await expect(guide.locator("ol.guide-steps > li")).toHaveCount(8);
  await expect(guide.getByRole("link", { name: /プロジェクトの作成画面を開く/ })).toHaveAttribute(
    "href",
    "https://console.cloud.google.com/projectcreate",
  );
  await expect(guide.getByRole("link", { name: /YouTube Data API v3/ })).toHaveAttribute(
    "target",
    "_blank",
  );
  await expect(guide.locator(".guide-copy code")).toHaveText(`${origin}/api/oauth/callback`);
  const submit = section.getByRole("button", { name: "登録", exact: true });
  await expect(submit).toBeDisabled();
  await section.getByLabel("クライアントID").fill("123-abc.apps.googleusercontent.com");
  await section.getByLabel("クライアントシークレット").fill("GOCSPX-e2e-secret");
  await expect(section.getByLabel("クライアントシークレット")).toHaveAttribute("type", "password");
  await submit.click();
  await expect(page.getByText("Google Cloud の接続情報を登録しました。")).toBeVisible();
  expect(sent).toEqual({
    clientId: "123-abc.apps.googleusercontent.com",
    clientSecret: "GOCSPX-e2e-secret",
  });
});

test("Google Cloud 登録済み: クライアントIDだけ出し、シークレットは表示しない", async ({
  page,
}) => {
  await mockApp(page, "owner");
  await page.goto("/settings");
  const section = page.locator("#youtube");
  await expect(section.locator(".google-client-head .badge")).toHaveText("✓登録済み");
  await expect(
    section.getByText("123456789012-seedclient.apps.googleusercontent.com"),
  ).toBeVisible();
  await expect(section.getByText("登録済み（表示しません）")).toBeVisible();
  await expect(section.getByLabel("クライアントシークレット")).toHaveCount(0);
  await section.getByRole("button", { name: "変更" }).click();
  await expect(section.getByLabel("クライアントID")).toHaveValue(
    "123456789012-seedclient.apps.googleusercontent.com",
  );
  await expect(section.getByLabel("クライアントシークレット")).toHaveValue("");
  await expect(section.getByText("今の連携は「要再連携」になります")).toBeVisible();
});

test("事前設定済みのチャンネル管理: 接続情報の入力・変更を求めず YouTube の許可へ進める", async ({
  page,
}) => {
  const base = settings("owner");
  await mockApp(page, "owner", {
    youtube: {
      ...base.youtube,
      status: "未連携",
      channel: null,
      googleClient: {
        source: "managed",
        configured: true,
        clientId: null,
        updatedAt: null,
      },
    },
  });
  await page.goto("/settings");
  const section = page.locator("#youtube");
  await expect(section.locator(".google-client-head .badge")).toHaveText("✓事前設定済み");
  await expect(
    section.getByText("接続情報は事前に設定されています", { exact: false }),
  ).toBeVisible();
  await expect(
    section.getByText("分析するチャンネルへの読み取り許可", { exact: false }),
  ).toBeVisible();
  await expect(section.getByRole("button", { name: "YouTubeと連携" })).toBeEnabled();
  await expect(section.getByLabel("クライアントID")).toHaveCount(0);
  await expect(section.getByLabel("クライアントシークレット")).toHaveCount(0);
  await expect(section.getByRole("button", { name: "変更" })).toHaveCount(0);
  await expect(section.getByRole("button", { name: "削除" })).toHaveCount(0);
  await expect(section.locator("details.guide")).toHaveCount(0);
});

test("事前設定の接続情報が未反映なら、登録フォームを出さずに利用できない状態を示す", async ({
  page,
}) => {
  const base = settings("owner");
  await mockApp(page, "owner", {
    youtube: {
      ...base.youtube,
      status: "未連携",
      channel: null,
      googleClient: { ...NO_CLIENT, source: "managed" },
    },
  });
  await page.goto("/settings");
  const section = page.locator("#youtube");
  await expect(section.locator(".google-client-head .badge")).toHaveText("!設定確認が必要");
  await expect(
    section.getByRole("alert").filter({ hasText: "事前設定された接続情報を現在利用できません。" }),
  ).toBeVisible();
  await expect(section.getByRole("button", { name: "YouTubeと連携" })).toBeDisabled();
  await expect(section.getByLabel("クライアントID")).toHaveCount(0);
  await expect(section.locator("details.guide")).toHaveCount(0);
});

test("Google Cloud 未登録のまま連携中: 再連携と字幕は押せず、案内を出す", async ({ page }) => {
  const base = settings("owner");
  await mockApp(page, "owner", { youtube: { ...base.youtube, googleClient: NO_CLIENT } });
  await page.goto("/settings");
  const section = page.locator("#youtube");
  await expect(section.getByRole("button", { name: "再連携" })).toBeDisabled();
  await expect(section.getByRole("switch", { name: "字幕を自動取得する" })).toBeDisabled();
  await expect(section.getByText("再連携と字幕の設定ができません")).toBeVisible();
});

test("Google Cloud の接続情報: 閲覧者には登録欄・変更ボタンを出さない", async ({ page }) => {
  const base = settings("viewer");
  await mockApp(page, "viewer", { youtube: { ...base.youtube, googleClient: NO_CLIENT } });
  await page.goto("/settings");
  const section = page.locator("#youtube");
  await expect(section.getByText("接続情報はチャンネル管理のオーナーが登録します。")).toBeVisible();
  await expect(section.getByLabel("クライアントID")).toHaveCount(0);
  await expect(section.getByRole("button", { name: "変更" })).toHaveCount(0);
});

test("連携解除はチャンネル管理名の入力で確定する", async ({ page }) => {
  await mockApp(page, "owner");
  await page.goto("/settings");
  await page.getByRole("button", { name: "連携解除" }).click();
  const dialog = page.getByRole("dialog", { name: "YouTube連携を解除" });
  const confirm = dialog.getByRole("button", { name: "連携解除" });
  await expect(confirm).toBeDisabled();
  await dialog.getByLabel("確認のための名前").fill("チャンネル管理A");
  await expect(confirm).toBeEnabled();
  await dialog.getByRole("button", { name: "キャンセル" }).click();
  await expect(dialog).toHaveCount(0);
});

test("旧チャンネルの削除待ちは期限を示し、新しい連携を始められない", async ({ page }) => {
  const base = settings("owner");
  await mockApp(page, "owner", {
    youtube: {
      ...base.youtube,
      status: "未連携",
      channel: null,
      pendingDeletionDueAt: "2026-10-01T03:00:00.000Z",
    },
  });
  await page.goto("/settings");
  const section = page.locator("#youtube");
  await expect(section.getByText("旧チャンネルのデータ削除を依頼済み")).toBeVisible();
  await expect(section.getByText("削除完了までは新しいチャンネルを連携できません。")).toBeVisible();
  await expect(section.getByText(/削除期限:/)).toBeVisible();
  await expect(section.getByRole("button", { name: "YouTubeと連携" })).toHaveCount(0);
});

for (const path of ["/login", "/privacy", "/terms"]) {
  test(`${path}: 共通フッターが同じ文言で出る`, async ({ page }) => {
    await page.goto(path);
    const badges = page.getByRole("list", { name: "このサービスの約束" }).getByRole("listitem");
    await expect(badges).toHaveText([...FOOTER_BADGES]);
    const links = page.getByRole("navigation", { name: "規約" });
    await expect(links.getByRole("link", { name: "プライバシーポリシー" })).toHaveAttribute(
      "href",
      "/privacy",
    );
    await expect(links.getByRole("link", { name: "利用規約" })).toHaveAttribute("href", "/terms");
  });
}

test("ログイン後の全画面に同じヘッダー・フッターが出る", async ({ page }) => {
  await mockApp(page, "owner");
  for (const path of ["/", "/videos", "/analysis", "/actions", "/settings"]) {
    await page.goto(path);
    await expect(page.getByRole("button", { name: "アカウントメニュー" })).toBeVisible();
    await expect(page.getByRole("navigation", { name: "メイン" })).toBeVisible();
    await expect(page.getByRole("list", { name: "このサービスの約束" })).toBeVisible();
  }
});
