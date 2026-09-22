import { useEffect, useState } from "react";

const UMA_HORA = 3_600_000;

function formatar(ms: number): string {
  const total = Math.floor(ms / 1000);
  const horas = Math.floor(total / 3600);
  const minutos = Math.floor((total % 3600) / 60);
  const segundos = total % 60;
  // Acima de uma hora o segundo não diz nada a quem está olhando, e "719:58"
  // não é um tempo que alguém lê.
  if (horas > 0) return `${horas}h ${String(minutos).padStart(2, "0")}min`;
  return `${minutos}:${String(segundos).padStart(2, "0")}`;
}

/**
 * Conta o tempo que falta até um instante.
 *
 * Devolve "expirado" quando passa. Sai da tela do almoço porque o mesmo
 * padrão vale para qualquer coisa com prazo — e um `setInterval` solto dentro
 * de componente é o tipo de coisa que alguém copia sem o clearInterval.
 *
 * O ritmo acompanha o que falta: de segundo em segundo só na última hora,
 * quando o segundo de fato importa para quem está na fila. Antes disso seria
 * um render por segundo durante meio dia, com a tela aberta no celular.
 */
export function useContagem(ate: string | undefined): string {
  const [restante, setRestante] = useState("");

  useEffect(() => {
    if (!ate) return;
    let agendado: ReturnType<typeof setTimeout>;

    const marcar = () => {
      const ms = new Date(ate).getTime() - Date.now();
      if (ms <= 0) {
        setRestante("expirado");
        return;
      }
      setRestante(formatar(ms));
      agendado = setTimeout(marcar, ms > UMA_HORA ? 30_000 : 1000);
    };

    marcar();
    return () => clearTimeout(agendado);
  }, [ate]);

  return restante;
}
