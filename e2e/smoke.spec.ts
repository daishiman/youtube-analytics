// 画面の E2E（3サイズ）。開発用ログイン（DEV_LOGIN=1・localhost）と scripts/seed-local.sql のアカウントを使う
import { expect, type Page, test } from "@playwright/test";

async function devLogin(page: Page, email: string, invite?: string) {
  await page.goto(invite ? `/login?invite=${invite}` : "/login");
  await page.getByLabel("プライバシーポリシーと利用規約に同意します").check();
  await page.getByLabel("開発用ログインのメールアドレス").fill(email);
  await page.getByRole("button", { name: "開発用ログイン" }).click();
}

async function logout(page: Page) {
  await page.goto("/");
  await page.getByRole("button", { name: "アカウントメニュー" }).click();
  await page.getByRole("menuitem", { name: "ログアウト" }).click();
  await expect(page).toHaveURL(/\/login$/);
}

const unique = (p: string) =>
  `${p}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}@example.com`;

test("ログイン画面: 同意するまで Google ログインは押せず、規約ページへリンクする", async ({
  page,
}) => {
  await page.goto("/login");
  await expect(
    page.getByRole("heading", { name: "YouTubeの実績から、次の一手を。" }),
  ).toBeVisible();
  const google = page.getByRole("button", { name: "Googleでログイン" });
  await expect(google).toHaveAttribute("aria-disabled", "true");
  await page.getByLabel("プライバシーポリシーと利用規約に同意します").check();
  await expect(google).toHaveAttribute("aria-disabled", "false");
  await page.goto("/privacy");
  await expect(
    page.getByText(
      "オーナーが招待したメンバーには、そのワークスペースのチャンネルのデータが表示されます。",
    ),
  ).toBeVisible();
});

test("未ログインで保護画面を開くとログイン画面へ戻る", async ({ page }) => {
  await page.goto("/settings");
  await expect(page).toHaveURL(/\/login$/);
});

test("閲覧者には書込ボタンが出ない", async ({ page }) => {
  await devLogin(page, "viewer@example.com");
  await expect(page.getByText("あなたの役割: 閲覧者")).toBeVisible();
  await page
    .getByRole("navigation", { name: "メイン" })
    .getByRole("link", { name: "設定" })
    .click();
  await expect(page.getByRole("heading", { name: "YouTube連携" })).toBeVisible();
  // メンバー区画はオーナーだけ。閲覧者は書込ボタン（連携・取込・発行・削除）も出ない
  await expect(page.getByRole("heading", { name: /^メンバー/ })).toHaveCount(0);
  await expect(page.getByRole("cell", { name: "owner@example.com" })).toHaveCount(0);
  for (const name of [
    "YouTubeと連携",
    "再連携",
    "連携解除",
    "新しいトークンを発行",
    "データを削除",
  ]) {
    await expect(page.getByRole("button", { name })).toHaveCount(0);
  }
  await expect(page.getByRole("tablist", { name: "取込の種類" })).toHaveCount(0);
});

test("ワークスペースを切り替えると役割が変わる", async ({ page }) => {
  await devLogin(page, "owner@example.com");
  const select = page.getByLabel("ワークスペース切替");
  await select.selectOption({ label: "テストチャンネルA（オーナー）" });
  await expect(page.getByText("あなたの役割: オーナー")).toBeVisible();
  await select.selectOption({ label: "別チャンネルB（閲覧者）" });
  await expect(page.getByText("あなたの役割: 閲覧者")).toBeVisible();
  await select.selectOption({ label: "テストチャンネルA（オーナー）" });
});

test("初回ログイン → 招待 → 別アカウントは拒否 → 本人は参加", async ({ page }) => {
  // メールアドレスは毎回一意なので、3サイズ並列でも同じ招待を奪い合わない（作ったデータは seed が掃除する）
  const ownerEmail = unique("e2e-owner");
  const invitee = unique("e2e-invitee");

  await devLogin(page, ownerEmail);
  await expect(page.getByText("あなたの役割: オーナー")).toBeVisible();
  await page
    .getByRole("navigation", { name: "メイン" })
    .getByRole("link", { name: "設定" })
    .click();
  await page.getByLabel("招待するメールアドレス").fill(invitee);
  await page.getByLabel("招待する役割").selectOption("editor");
  await page.getByRole("button", { name: "招待リンクを発行" }).click();
  const url = await page.getByLabel("発行した招待リンク").inputValue();
  const token = new URL(url).searchParams.get("token") ?? "";
  expect(token.length).toBeGreaterThanOrEqual(43);
  await expect(page.getByText(`${invitee}（編集者`)).toBeVisible();
  await logout(page);

  await devLogin(page, unique("e2e-stranger"), token);
  await expect(page).toHaveURL(/\/invite\?token=/);
  await expect(page.getByRole("alert")).toContainText(
    "招待されたメールアドレスと異なるアカウントです",
  );
  await page.getByRole("button", { name: "別のアカウントでログインし直す" }).click();

  await devLogin(page, invitee, token);
  await expect(page.getByText("あなたの役割: 編集者")).toBeVisible();
});
