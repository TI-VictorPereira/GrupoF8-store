import { useEffect, useState } from "react";

/**
 * Conta o tempo que falta até um instante, de segundo em segundo.
 *
 * Devolve "expirado" quando passa. Sai da tela do almoço porque o mesmo
 * padrão vale para qualquer coisa com prazo curto — e um `setInterval` solto
 * dentro de componente é o tipo de coisa que alguém copia sem o clearInterval.
 */
export function useContagem(ate: string | undefined): string {
  const [restante, setRestante] = useState("");

  useEffect(() => {
    if (!ate) return;
    const marcar = () => {
      const ms = new Date(ate).getTime() - Date.now();
      if (ms <= 0) return setRestante("expirado");
      const minutos = Math.floor(ms / 60000);
      const segundos = Math.floor((ms % 60000) / 1000);
      setRestante(`${minutos}:${String(segundos).padStart(2, "0")}`);
    };
    marcar();
    const id = setInterval(marcar, 1000);
    return () => clearInterval(id);
  }, [ate]);

  return restante;
}
