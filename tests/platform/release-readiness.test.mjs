import { describe, expect, it } from "vitest";
import {
  REQUIRED_WORKER_SECRETS,
  validateWorkerSecretListResult,
} from "../../scripts/release-readiness-core.mjs";

describe("release readiness の Worker Secret 検査", () => {
  it("必要なruntime secret名が揃っていれば値を扱わず合格する", () => {
    const stdout = JSON.stringify(
      REQUIRED_WORKER_SECRETS.map((name) => ({ name, type: "secret_text" })),
    );
    expect(validateWorkerSecretListResult({ status: 0, stdout })).toEqual([]);
  });

  it("CLI失敗と不正JSONをfail-closedにする", () => {
    expect(validateWorkerSecretListResult({ status: 1, stdout: "" })).toEqual([
      "Cloudflare Worker Secret一覧を取得できませんでした",
    ]);
    expect(validateWorkerSecretListResult({ status: 0, stdout: "not-json" })).toEqual([
      "Cloudflare Worker Secret一覧が不正なJSONです",
    ]);
  });

  it("不足するruntime secret名だけを報告する", () => {
    const errors = validateWorkerSecretListResult({
      status: 0,
      stdout: JSON.stringify([{ name: "GOOGLE_CLIENT_SECRET", type: "secret_text" }]),
    });
    expect(errors).toEqual(["TOKEN_ENC_KEY: Cloudflare Worker runtime secret が未登録です"]);
  });
});
