import { createContext, useCallback, useContext, useState } from "react";

type Toast = { id: number; message: string; tone: "default" | "success" | "warn" };

type Ctx = {
  toasts: Toast[];
  push: (message: string, tone?: Toast["tone"]) => void;
  dismiss: (id: number) => void;
};

const ToastCtx = createContext<Ctx | null>(null);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const dismiss = useCallback((id: number) => {
    setToasts((t) => t.filter((x) => x.id !== id));
  }, []);

  const push = useCallback(
    (message: string, tone: Toast["tone"] = "default") => {
      const id = Date.now() + Math.random();
      setToasts((t) => [...t, { id, message, tone }]);
      window.setTimeout(() => dismiss(id), 3200);
    },
    [dismiss]
  );

  return (
    <ToastCtx.Provider value={{ toasts, push, dismiss }}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 top-3 z-50 flex flex-col items-center gap-2 px-4">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`animate-toast-in pointer-events-auto flex max-w-sm items-center gap-2.5 rounded-xl px-4 py-3 text-sm font-semibold shadow-cardHover ring-1 ${
              t.tone === "success"
                ? "bg-brand-700 text-white ring-brand-800"
                : t.tone === "warn"
                ? "bg-amber-500 text-white ring-amber-600"
                : "bg-overlay text-white ring-overlay"
            }`}
            onClick={() => dismiss(t.id)}
          >
            <span className="text-base leading-none">
              {t.tone === "success" ? "✓" : t.tone === "warn" ? "⚠" : "•"}
            </span>
            <span>{t.message}</span>
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastCtx);
  if (!ctx) throw new Error("useToast must be used within ToastProvider");
  return ctx;
}
