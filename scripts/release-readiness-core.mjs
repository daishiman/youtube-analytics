export const REQUIRED_WORKER_SECRETS = ["GOOGLE_CLIENT_SECRET", "TOKEN_ENC_KEY"];

export function validateWorkerSecretListResult(result) {
  if (result.error || result.status !== 0) {
    return ["Cloudflare Worker Secret一覧を取得できませんでした"];
  }

  let entries;
  try {
    entries = JSON.parse(String(result.stdout ?? ""));
  } catch {
    return ["Cloudflare Worker Secret一覧が不正なJSONです"];
  }
  if (!Array.isArray(entries)) {
    return ["Cloudflare Worker Secret一覧が不正なJSONです"];
  }

  const names = new Set(
    entries.flatMap((entry) =>
      entry && typeof entry === "object" && typeof entry.name === "string" ? [entry.name] : [],
    ),
  );
  return REQUIRED_WORKER_SECRETS.filter((name) => !names.has(name)).map(
    (name) => `${name}: Cloudflare Worker runtime secret が未登録です`,
  );
}
