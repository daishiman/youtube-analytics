import { type FormEvent, useState } from "react";
import { TENANT_LABEL } from "../../src/domain/labels";
import { api } from "../api";
import { errorText } from "../pages/shell-context";

export function CreateTenantForm({ onCreated }: { onCreated: () => Promise<void> }) {
  const [name, setName] = useState("");
  const [error, setError] = useState("");

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError("");
    try {
      await api("/api/tenants", { method: "POST", body: { name } });
      setName("");
      await onCreated();
    } catch (err) {
      setError(errorText(err));
    }
  }

  return (
    <form className="row" onSubmit={submit}>
      <input
        required
        maxLength={60}
        value={name}
        onChange={(event) => setName(event.target.value)}
        placeholder={`${TENANT_LABEL}名（1〜60文字）`}
        aria-label={`新しい${TENANT_LABEL}名`}
      />
      <button type="submit" className="button primary">
        {TENANT_LABEL}を作成
      </button>
      {error && (
        <p role="alert" className="alert">
          {error}
        </p>
      )}
    </form>
  );
}
