// ログイン画面刷新（feat-login-redesign）の E2E。docs/feat-login-redesign/test-design.md の A1〜A9 に対応する
// seed（scripts/seed-local.sql）の owner@ / partial@ と招待トークンを使う
import { expect, type Page, test } from "@playwright/test";

const CONSENT = "プライバシーポリシーと利用規約に同意します";
const INVITE = "local-invite-editor-0000000000000000000000000";

async function devLogin(page: Page, email: string) {
  await page.goto("/login");
  await page.getByLabel(CONSENT).check();
  await page.getByLabel("開発用ログインのメールアドレス").fill(email);
  await page.getByRole("button", { name: "開発用ログイン" }).click();
  await expect(page).not.toHaveURL(/\/login/);
}

test.describe("ログイン画面", () => {
  test("A1 画像どおりの順序で並び、Googleボタンは Light テーマ", async ({ page }) => {
    await page.goto("/login");
    const card = page.locator(".login-card");
    // 権限一覧は /api/auth/config の応答後に描くので、出そろってから順序を見る
    await expect(card.locator(".scope-list > li")).toHaveCount(3);
    const order = await card
      .locator(
        ".login-logo, h1, .login-lead, .scope-list, .consent, .google-button, .unverified-note",
      )
      .evaluateAll((els) => els.map((e) => e.className || e.tagName));
    expect(order).toEqual([
      "login-logo",
      "H1",
      "login-lead",
      "scope-list",
      "check consent",
      "google-button",
      "unverified-note",
    ]);
    const google = page.getByRole("button", { name: "Googleでログイン" });
    await expect(google).toHaveCSS("background-color", "rgb(255, 255, 255)");
    await expect(google).toHaveCSS("border-top-color", "rgb(116, 119, 117)");
    await expect(google).toHaveCSS("color", "rgb(31, 31, 31)");
    await expect(page.getByText("Channel Insight").first()).toBeVisible();
    await page.emulateMedia({ colorScheme: "dark" });
    await expect(page.locator(".login-page")).toHaveCSS("background-color", "rgb(246, 247, 249)");
    await expect(card).toHaveCSS("background-color", "rgb(255, 255, 255)");
  });

  test("A2 権限一覧はサーバの設定から描く（新規3行・招待はメールだけ）", async ({ page }) => {
    await page.goto("/login");
    const rows = page.getByRole("list", { name: "このアプリが読み取る情報" }).getByRole("listitem");
    await expect(rows).toHaveCount(3);
    await expect(rows.nth(0)).toContainText("YouTubeチャンネル情報の閲覧");
    await expect(rows.nth(0)).toContainText("読み取り専用");
    await expect(rows.nth(1)).toContainText("YouTube Analyticsレポートの閲覧");

    await page.goto(`/login?invite=${INVITE}`);
    await expect(page.getByText("テストチャンネルAのテナントに招待されています")).toBeVisible();
    await expect(rows).toHaveCount(1);
    await expect(rows.first()).toContainText("メールアドレス");
  });

  test("A3 同意前は押せない理由を示し、押しても移動しない", async ({ page }) => {
    await page.goto("/login");
    const google = page.getByRole("button", { name: "Googleでログイン" });
    await expect(google).toHaveAttribute("aria-disabled", "true");
    await expect(google).toHaveAccessibleDescription("同意にチェックすると押せます");
    await google.click({ force: true }); // aria-disabled は Playwright も押せない扱いにするため、実際に押した時の挙動を強制クリックで確かめる
    await expect(page).toHaveURL(/\/login$/);
    await page.getByLabel(CONSENT).check();
    await expect(google).toHaveAttribute("aria-disabled", "false");
    await expect(page.getByText("同意にチェックすると押せます")).toHaveCount(0);
  });

  test("A4 規約が改定されたら再同意を求める", async ({ page }) => {
    await page.goto("/login?error=CONSENT_OUTDATED");
    await expect(page.getByRole("alert")).toHaveText(
      "利用規約またはプライバシーポリシーが更新されました。内容を確認して、もう一度同意してください",
    );
    await expect(page).toHaveURL(/error=CONSENT_OUTDATED/);
  });

  test("A6 知らないエラーコードは中身を出さず汎用の文言にする", async ({ page }) => {
    await page.goto("/login?error=%3Cscript%3Eleak%3C%2Fscript%3E");
    await expect(page.getByRole("alert")).toHaveText(
      "ログインできませんでした。もう一度お試しください",
    );
    await expect(page.getByRole("alert")).toHaveCount(1);
    await expect(page).toHaveURL(/\/login$/);
  });

  test("招待 URL に切り替えると旧設定と同意を即座に破棄する", async ({ page }) => {
    let releaseInvite!: () => void;
    const inviteResponse = new Promise<void>((resolve) => {
      releaseInvite = resolve;
    });
    await page.route("**/api/auth/config?invite=*", async (route) => {
      await inviteResponse;
      await route.continue();
    });
    await page.goto("/login");
    await expect(page.locator(".scope-list > li")).toHaveCount(3);
    await page.getByLabel(CONSENT).check();
    await expect(page.getByRole("button", { name: "Googleでログイン" })).toHaveAttribute(
      "aria-disabled",
      "false",
    );

    const requested = page.waitForRequest("**/api/auth/config?invite=*");
    await page.evaluate((token) => {
      window.history.pushState(null, "", `/login?invite=${token}`);
      window.dispatchEvent(new PopStateEvent("popstate"));
    }, INVITE);
    await requested;
    await expect(page.getByLabel(CONSENT)).not.toBeChecked();
    await expect(page.locator(".scope-list > li")).toHaveCount(0);
    const google = page.getByRole("button", { name: "Googleでログイン" });
    await expect(google).toHaveAttribute("aria-disabled", "true");
    await expect(google).toHaveAccessibleDescription("設定を読み込み中です");
    releaseInvite();
    await expect(page.locator(".scope-list > li")).toHaveCount(1);
    await expect(google).toHaveAccessibleDescription("同意にチェックすると押せます");
  });

  test("設定の取得失敗時は理由を示してログインを無効にする", async ({ page }) => {
    await page.route("**/api/auth/config", (route) => route.fulfill({ status: 503, body: "{}" }));
    await page.goto("/login");
    await expect(page.getByRole("alert")).toContainText("設定を読み込めませんでした");
    await page.getByLabel(CONSENT).check();
    await expect(page.getByRole("button", { name: "Googleでログイン" })).toHaveAttribute(
      "aria-disabled",
      "true",
    );
    await expect(
      page.getByRole("button", { name: "Googleでログイン" }),
    ).toHaveAccessibleDescription("設定を読み込めないため、ページを再読み込みしてください");
  });

  test("A7 信頼表示3つと規約リンク、未検証アプリの案内を出す", async ({ page }) => {
    await page.goto("/login");
    const footer = page.locator("footer.trust-footer");
    for (const text of ["OAuthは読み取り専用", "データは利用者ごとに分離", "無料枠で運用"]) {
      await expect(footer.getByText(text)).toBeVisible();
    }
    await expect(footer.getByRole("link", { name: "プライバシーポリシー" })).toHaveAttribute(
      "href",
      "/privacy",
    );
    await expect(footer.getByRole("link", { name: "利用規約" })).toHaveAttribute("href", "/terms");
    await expect(page.getByText("このアプリはGoogleの検証前です")).toBeVisible();
  });

  test("A8 幅360pxでも横スクロールしない", async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 780 });
    await page.goto("/login");
    await expect(page.getByRole("button", { name: "Googleでログイン" })).toBeVisible();
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(0);
  });

  test("A9 キーボードだけで同意して Google ボタンまで進める", async ({ page }) => {
    await page.goto("/login");
    const checkbox = page.getByLabel(CONSENT);
    await checkbox.focus();
    await page.keyboard.press("Space");
    await expect(checkbox).toBeChecked();
    const google = page.getByRole("button", { name: "Googleでログイン" });
    for (let i = 0; i < 5; i++) {
      await page.keyboard.press("Tab");
      if (await google.evaluate((el) => el === document.activeElement)) break;
    }
    await expect(google).toBeFocused();
    await expect(google).toHaveAttribute("aria-disabled", "false");
  });
});

test.describe("A5 YouTube 連携が未完了のときの案内", () => {
  test("未連携のオーナーにも初回連携の案内を出す", async ({ page }) => {
    await devLogin(page, "e2e-none@example.com");
    await expect(page.getByText("YouTube がまだ連携されていません")).toBeVisible();
    await expect(page.getByText("YouTube の読み取り連携がまだありません。")).toBeVisible();
    await expect(page.getByRole("link", { name: "連携する" })).toHaveAttribute(
      "href",
      "/api/auth/youtube/connect",
    );
  });
  test("オーナーには「再連携」を出す", async ({ page }) => {
    await devLogin(page, "partial@example.com");
    await expect(page.getByText("YouTube 連携が未完了です")).toBeVisible();
    await expect(page.getByText("YouTube の読み取り連携を完了できていません。")).toBeVisible();
    await expect(page.getByRole("link", { name: "再連携" })).toHaveAttribute(
      "href",
      "/api/auth/youtube/connect",
    );
  });

  test("一部許可の閲覧者にはオーナーへの依頼だけを出す", async ({ page }) => {
    await devLogin(page, "owner@example.com");
    const select = page.getByLabel("テナント切替");
    await select.selectOption({ label: "テストチャンネルA（オーナー）" });
    await expect(page.getByText("あなたの役割: オーナー")).toBeVisible();
    await select.selectOption({ label: "別チャンネルB（閲覧者）" });
    await expect(page.getByText("YouTube 連携が未完了です")).toBeVisible();
    await expect(page.getByText("オーナーに YouTube の再連携を依頼してください")).toBeVisible();
    await expect(page.getByRole("link", { name: "再連携" })).toHaveCount(0);
    await select.selectOption({ label: "テストチャンネルA（オーナー）" });
  });

  test("連携済みなら案内を出さない", async ({ page }) => {
    await page.route("**/api/me", async (route) => {
      const response = await route.fetch();
      const data = await response.json();
      if (data.currentTenant) data.currentTenant.youtubeLinkStatus = "linked";
      await route.fulfill({ response, json: data });
    });
    await devLogin(page, "owner@example.com");
    await expect(page.getByText("あなたの役割: オーナー")).toBeVisible();
    await expect(page.locator(".link-banner")).toHaveCount(0);
  });
});
