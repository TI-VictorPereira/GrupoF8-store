import React, { createContext, useCallback, useContext, useState } from "react";

type Tom = "ok" | "danger";
interface ToastItem {
  id: number;
  mensagem: string;
  tom: Tom;
}

const ToastContext = createContext<{ mostrar: (mensagem: string, tom?: Tom) => void } | undefined>(
  undefined,
);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [itens, setItens] = useState<ToastItem[]>([]);

  const mostrar = useCallback((mensagem: string, tom: Tom = "ok") => {
    const id = Date.now() + Math.random();
    setItens((atual) => [...atual, { id, mensagem, tom }]);
    setTimeout(() => setItens((atual) => atual.filter((i) => i.id !== id)), 2600);
  }, []);

  return (
    <ToastContext.Provider value={{ mostrar }}>
      {children}
      <div className="fixed bottom-5 right-5 z-[100] flex flex-col gap-2">
        {itens.map((item) => (
          <div
            key={item.id}
            className={
              "px-4 py-3 rounded-lg shadow-lg text-sm font-medium text-card " +
              (item.tom === "danger" ? "bg-danger" : "bg-ink")
            }
          >
            {item.mensagem}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast precisa estar dentro de <ToastProvider>");
  return ctx;
}
