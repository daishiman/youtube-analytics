// 受入 A6: main への push で D1 マイグレーションと deploy が完了する（ワークフロー定義の静的検査）
// 実行の成功は GitHub Actions の実行ログで確認する（docs/feat-platform-tenant-auth/acceptance.md）
import { describe, expect, it } from "vitest";
import ci from "../../.github/workflows/ci.yml?raw";
import deploy from "../../.github/workflows/deploy.yml?raw";
import pkg from "../../package.json";
import releaseCheck from "../../scripts/check-release-readiness.mjs?raw";
import releaseCore from "../../scripts/release-readiness-core.mjs?raw";

const runLines = (yml: string) =>
  yml
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.startsWith("- run:") || l.startsWith("run:"))
    .map((l) => l.replace(/^-?\s*run:/, "").trim());

describe("A6 デプロイ用ワークフロー", () => {
  it("deploy は main への push で起動する", () => {
    expect(deploy).toMatch(/on:\s*\n\s+push:\s*\n\s+branches:\s*\[main\]/);
  });

  it("deploy は D1 マイグレーション適用 → Worker デプロイの順で実行する", () => {
    const runs = runLines(deploy);
    const readiness = runs.indexOf("pnpm check:release:deploy");
    const migrate = runs.indexOf("pnpm db:migrate:remote");
    const release = runs.indexOf("pnpm run deploy");
    expect(readiness).toBeGreaterThanOrEqual(0);
    expect(migrate).toBeGreaterThan(readiness);
    expect(migrate).toBeGreaterThanOrEqual(0);
    expect(release).toBeGreaterThan(migrate);
    expect(pkg.scripts["db:migrate:remote"]).toBe("wrangler d1 migrations apply DB --remote");
    expect(pkg.scripts.deploy).toContain("wrangler deploy");
  });

  it("deploy の認証情報は GitHub Secrets から渡し、直書きしない", () => {
    expect(deploy).toContain(`$${"{{"} secrets.CLOUDFLARE_API_TOKEN }}`);
    expect(deploy).toContain(`$${"{{"} secrets.CLOUDFLARE_ACCOUNT_ID }}`);
    expect(deploy).not.toMatch(/CLOUDFLARE_API_TOKEN:\s*[A-Za-z0-9_-]{20,}/);
    expect(deploy).not.toMatch(/^\s*environment:\s*production\s*$/m);
  });

  it("deploy gate はAPI認証後にWorker runtime secret名を取得し、値を出力しない", () => {
    expect(pkg.scripts["check:release:deploy"]).toBe(
      "node scripts/check-release-readiness.mjs --deploy",
    );
    expect(deploy).toContain("pnpm check:release:deploy");
    const apiCredentials = releaseCheck.indexOf('for (const secret of ["CLOUDFLARE_API_TOKEN"');
    const runtimeSecrets = releaseCheck.indexOf(
      'spawnSync("pnpm", ["wrangler", "secret", "list", "--format", "json"]',
    );
    expect(apiCredentials).toBeGreaterThanOrEqual(0);
    expect(runtimeSecrets).toBeGreaterThan(apiCredentials);
    expect(releaseCheck).toContain("if (deployMode)");
    expect(releaseCore).toContain('"GOOGLE_CLIENT_SECRET", "TOKEN_ENC_KEY"');
    expect(releaseCore).not.toMatch(/console\.(log|error)/);
  });

  it("PR では lint・typecheck・test・dry-run を回す", () => {
    expect(ci).toMatch(/on:\s*\n\s+pull_request:/);
    const runs = runLines(ci);
    for (const step of [
      "pnpm lint",
      "pnpm typecheck",
      "pnpm test",
      "pnpm check:repo",
      "pnpm build",
    ]) {
      expect(runs).toContain(step);
    }
    expect(pkg.scripts["check:repo"]).toContain("validate-repository-consistency.py");
    expect(pkg.scripts.build).toContain("wrangler deploy --dry-run");
  });
});
