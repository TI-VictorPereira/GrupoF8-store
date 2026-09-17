import type { ReactNode } from "react";
import { useRouter } from "@tanstack/react-router";

export function ColabFrame({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen flex items-start justify-center pt-20 pb-10 px-4 bg-bg">
      <div className="w-full max-w-[420px] bg-card rounded-[28px] border border-border device-frame overflow-hidden">
        {children}
      </div>
    </div>
  );
}

export function ColabSubHeader({ titulo }: { titulo: string }) {
  const router = useRouter();
  return (
    <div className="px-5 pt-6 pb-3 flex items-center gap-3 border-b border-border">
      <button
        onClick={() => router.navigate({ to: "/" })}
        aria-label="Voltar"
        className="text-muted-foreground font-bold"
      >
        ←
      </button>
      <h2 className="font-bold text-base">{titulo}</h2>
    </div>
  );
}
