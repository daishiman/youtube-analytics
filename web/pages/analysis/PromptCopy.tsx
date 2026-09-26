import { useEffect, useRef, useState } from "react";
import { analysisApi } from "../../api";
import { useToast } from "../../components/Toast";

/** 新規依頼・再実行・既存依頼で同じコピーと手動コピーの動作を使う。 */
export function usePromptCopy() {
  const toast = useToast();
  const [manual, setManual] = useState<{
    requestId: string;
    prompt: string;
    created: boolean;
  } | null>(null);

  async function copyPrompt(requestId: string, successMessage: string, created = false) {
    const { prompt } = await analysisApi.getPrompt(requestId);
    try {
      await navigator.clipboard.writeText(prompt);
      setManual(null);
      toast(successMessage);
    } catch {
      setManual({ requestId, prompt, created });
    }
  }

  return { copyPrompt, manual, dismissManual: () => setManual(null) };
}

/** クリップボードが使えないとき、プロンプトを選択状態で見せる。 */
export function ManualCopy({
  requestId,
  prompt,
  created,
  onClose,
}: {
  requestId: string;
  prompt: string;
  created: boolean;
  onClose: () => void;
}) {
  const area = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    area.current?.focus();
    area.current?.select();
  }, []);
  return (
    <section className="manual-copy" aria-label="手動コピー">
      <p role="alert" className="alert">
        依頼 {requestId} {created ? "を作りましたが、" : "のプロンプトを"}
        自動でコピーできませんでした。下の欄を選んでコピーしてください。
      </p>
      <textarea
        ref={area}
        readOnly
        value={prompt}
        rows={6}
        aria-label="Claude Code用プロンプト"
        onFocus={(e) => e.currentTarget.select()}
      />
      <button type="button" className="button" onClick={onClose}>
        閉じる
      </button>
    </section>
  );
}
