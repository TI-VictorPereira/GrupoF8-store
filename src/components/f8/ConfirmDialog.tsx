import React from "react";

interface Props {
  aberto: boolean;
  mensagem: string;
  onCancelar: () => void;
  onConfirmar: () => void;
}

export function ConfirmDialog({ aberto, mensagem, onCancelar, onConfirmar }: Props) {
  if (!aberto) return null;
  return (
    <div
      className="fixed inset-0 bg-ink/50 z-40 flex items-center justify-center p-4"
      onClick={onCancelar}
    >
      <div className="bg-card rounded-2xl w-full max-w-md p-6" onClick={(e) => e.stopPropagation()}>
        <h3 className="font-bold text-lg mb-2">Confirmar ação</h3>
        <p className="text-sm text-muted-foreground mb-5">{mensagem}</p>
        <div className="flex gap-2 justify-end">
          <button
            onClick={onCancelar}
            className="text-sm font-semibold border border-border rounded-lg px-4 py-2.5"
          >
            Cancelar
          </button>
          <button
            onClick={onConfirmar}
            className="text-sm font-bold bg-danger text-card rounded-lg px-4 py-2.5"
          >
            Confirmar
          </button>
        </div>
      </div>
    </div>
  );
}

/** Hook de conveniência: const { pedirConfirmacao, dialog } = useConfirm(); */
export function useConfirm() {
  const [estado, setEstado] = React.useState<{ mensagem: string; fn: () => void } | null>(null);

  const pedirConfirmacao = (mensagem: string, fn: () => void) => setEstado({ mensagem, fn });
  const dialog = (
    <ConfirmDialog
      aberto={!!estado}
      mensagem={estado?.mensagem ?? ""}
      onCancelar={() => setEstado(null)}
      onConfirmar={() => {
        estado?.fn();
        setEstado(null);
      }}
    />
  );

  return { pedirConfirmacao, dialog };
}
