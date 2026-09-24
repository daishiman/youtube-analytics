import { createContext, type ReactNode, useCallback, useContext, useRef, useState } from "react";

type ToastFn = (message: string) => void;

const ToastContext = createContext<ToastFn>(() => undefined);

/** 操作結果の短い通知（4秒で消える）。role=status で読み上げる */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [message, setMessage] = useState("");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const show = useCallback<ToastFn>((text) => {
    setMessage(text);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setMessage(""), 4000);
  }, []);

  return (
    <ToastContext.Provider value={show}>
      {children}
      <div className="toast-area" role="status" aria-live="polite">
        {message && <p className="toast">{message}</p>}
      </div>
    </ToastContext.Provider>
  );
}

export const useToast = () => useContext(ToastContext);
