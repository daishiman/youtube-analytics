// E2E 共通の操作。seed（scripts/seed-local.sql）の利用者で開発用ログインする
import { expect, type Page } from "@playwright/test";

export const CONSENT = "プライバシーポリシーと利用規約に同意します";

export async function devLogin(page: Page, email: string, invite?: string) {
  await page.goto(invite ? `/login?invite=${invite}` : "/login");
  // 開発用ログインの欄は /api/auth/config の応答後に描かれる。描画前に同意を押すと
  // 画面の組み直しで外れることがあるため、欄が出てから押す
  const input = page.getByLabel("開発用ログインのメールアドレス");
  await expect(input).toBeVisible();
  await page.getByLabel(CONSENT).check();
  await input.fill(email);
  await page.getByRole("button", { name: "開発用ログイン" }).click();
  await expect(page).not.toHaveURL(/\/login/);
}
