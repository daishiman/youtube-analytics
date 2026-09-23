import { type FormEvent, useState } from "react";
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
        placeholder="テナント名（1〜60文字）"
        aria-label="新しいテナント名"
      />
      <button type="submit" className="button primary">
        テナントを作成
      </button>
      {error && (
        <p role="alert" className="alert">
          {error}
        </p>
      )}
    </form>
  );
}
