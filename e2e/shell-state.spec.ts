import { expect, type Page, test } from "@playwright/test";

const user = { userId: "user-self", email: "self@example.com" };
const tenantA = { tenantId: "tenant-a", name: "ワークスペースA", role: "owner" as const };
const tenantB = { tenantId: "tenant-b", name: "ワークスペースB", role: "owner" as const };
const tenants = [tenantA, tenantB];

const member = (tenant: "a" | "b", email = `${tenant}@example.com`) => ({
  user_id: `user-${tenant}`,
  email,
  role: "viewer" as const,
  joined_at: "2026-09-01T00:00:00.000Z",
});

const invite = (tenant: "a" | "b") => ({
  invite_id: `invite-${tenant}`,
  email: `invite-${tenant}@example.com`,
  role: "viewer" as const,
  expires_at: "2026-09-30T00:00:00.000Z",
  created_at: "2026-09-23T00:00:00.000Z",
});

/** 設定画面の他区画が使う /api/settings の最小形（ここではメンバー区画だけを検証する） */
const settings = {
  tenant: { tenantId: tenantA.tenantId, name: tenantA.name },
  role: "owner",
  permissions: { manageSettings: true, writeContent: true, manageMembers: true },
  youtube: {
    status: "未連携",
    channel: null,
    nextCollection: null,
    lastCollectedAt: null,
    lastCsvImportAt: null,
    scopes: [],
    captions: { enabled: false, availability: "preparing", dailyLimit: 5 },
    googleClient: { configured: false, clientId: null, updatedAt: null },
  },
  imports: [],
  tokens: [],
  tokenLimit: 5,
  usage: [],
  deletion: null,
};

test.beforeEach(async ({ page }) => {
  await page.route("**/api/settings", (route) => route.fulfill({ json: settings }));
});

async function routeMe(page: Page, currentTenant: () => (typeof tenants)[number]) {
  await page.route("**/api/me", (route) =>
    route.fulfill({
      json: { user, tenants, currentTenant: currentTenant(), signupClosed: false },
    }),
  );
}

test.describe("Shell の回復可能な tenant context", () => {
  test("/api/me の初回失敗から画面再読込なしで再試行できる", async ({ page }) => {
    let failing = true;
    await page.route("**/api/me", (route) =>
      failing
        ? route.fulfill({
            status: 503,
            json: {
              error: {
                code: "INTERNAL",
                message: "一時的に失敗しました",
                hint: "再試行してください",
              },
            },
          })
        : route.fulfill({
            json: { user, tenants, currentTenant: tenantA, signupClosed: false },
          }),
    );

    await page.goto("/");
    await expect(page.getByRole("alert")).toContainText("一時的に失敗しました");
    failing = false;
    await page.getByRole("button", { name: "再試行" }).click();
    await expect(page.getByRole("heading", { name: "ワークスペースA" })).toBeVisible();
  });

  test("tenant 切替後に旧 tenant の遅延応答で members/invites を上書きしない", async ({ page }) => {
    let current = tenantA;
    await routeMe(page, () => current);
    await page.route("**/api/session/tenant", async (route) => {
      current = tenantB;
      await route.fulfill({ json: { tenantId: current.tenantId } });
    });
    for (const resource of ["members", "invites"]) {
      await page.route(`**/api/tenants/tenant-a/${resource}`, async (route) => {
        await new Promise((resolve) => setTimeout(resolve, 500));
        const json =
          resource === "members" ? { members: [member("a")] } : { invites: [invite("a")] };
        await route.fulfill({ json }).catch(() => undefined);
      });
    }
    await page.route("**/api/tenants/tenant-b/members", (route) =>
      route.fulfill({ json: { members: [member("b")] } }),
    );
    await page.route("**/api/tenants/tenant-b/invites", (route) =>
      route.fulfill({ json: { invites: [invite("b")] } }),
    );

    await page.goto("/settings");
    await page.getByLabel("ワークスペース切替").selectOption("tenant-b");
    await expect(page.getByRole("heading", { name: "メンバー（ワークスペースB）" })).toBeVisible();
    await expect(page.getByRole("cell", { name: "b@example.com" })).toBeVisible();
    await expect(page.getByText(/invite-b@example\.com/)).toBeVisible();
    await page.waitForTimeout(650);
    await expect(page.getByText("a@example.com")).toHaveCount(0);
    await expect(page.getByText(/invite-a@example\.com/)).toHaveCount(0);
  });

  test("tenant A で発行した招待 URL を tenant B に持ち越さない", async ({ page }) => {
    let current = tenantA;
    await routeMe(page, () => current);
    await page.route("**/api/session/tenant", async (route) => {
      current = tenantB;
      await route.fulfill({ json: { tenantId: current.tenantId } });
    });
    for (const tenant of ["a", "b"] as const) {
      await page.route(`**/api/tenants/tenant-${tenant}/members`, (route) =>
        route.fulfill({ json: { members: [member(tenant)] } }),
      );
      await page.route(`**/api/tenants/tenant-${tenant}/invites`, async (route) => {
        if (route.request().method() === "POST") {
          await route.fulfill({
            status: 201,
            json: {
              url: "https://example.com/invite?token=tenant-a-secret",
              expiresAt: "2026-09-30",
            },
          });
          return;
        }
        await route.fulfill({ json: { invites: [] } });
      });
    }

    await page.goto("/settings");
    await page.getByLabel("招待するメールアドレス").fill("new@example.com");
    await page.getByRole("button", { name: "招待リンクを発行" }).click();
    await expect(page.getByLabel("発行した招待リンク")).toHaveValue(/tenant-a-secret/);
    await page.getByLabel("ワークスペース切替").selectOption("tenant-b");
    await expect(page.getByRole("heading", { name: "メンバー（ワークスペースB）" })).toBeVisible();
    await expect(page.getByLabel("発行した招待リンク")).toHaveCount(0);
  });

  test("自己 role 変更後は me を先に更新し owner UI を残さない", async ({ page }) => {
    let currentRole: "owner" | "viewer" = "owner";
    await page.route("**/api/me", (route) =>
      route.fulfill({
        json: {
          user,
          tenants: [{ ...tenantA, role: currentRole }],
          currentTenant: { ...tenantA, role: currentRole },
          signupClosed: false,
        },
      }),
    );
    await page.route("**/api/tenants/tenant-a/members", (route) =>
      route.fulfill({
        json: {
          members: [
            { ...member("a", user.email), user_id: user.userId, role: currentRole },
            { ...member("b", "other-owner@example.com"), role: "owner" },
          ],
        },
      }),
    );
    await page.route("**/api/tenants/tenant-a/invites", (route) =>
      currentRole === "owner"
        ? route.fulfill({ json: { invites: [] } })
        : route.fulfill({
            status: 403,
            json: { error: { code: "FORBIDDEN", message: "権限がありません", hint: "" } },
          }),
    );
    await page.route("**/api/tenants/tenant-a/members/user-self", async (route) => {
      currentRole = "viewer";
      await route.fulfill({ json: { member: { ...member("a", user.email), role: "viewer" } } });
    });

    await page.goto("/settings");
    await page.getByLabel("self@example.com の役割").selectOption("viewer");
    // 閲覧者になった時点でメンバー区画ごと消える（owner UI を残さない）
    await expect(page.getByRole("heading", { name: "メンバー（ワークスペースA）" })).toHaveCount(0);
    await expect(page.getByRole("heading", { name: "メンバーを招待" })).toHaveCount(0);
    await expect(page.getByLabel("self@example.com の役割")).toHaveCount(0);
    await expect(page.getByRole("alert")).toHaveCount(0);
  });
});
