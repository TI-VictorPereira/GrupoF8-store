export function fmt(v: number) {
  return "R$ " + Number(v).toFixed(2).replace(".", ",");
}

export function horaFmt(iso: string) {
  const d = new Date(iso);
  return (
    d.toLocaleDateString("pt-BR") +
    " às " +
    d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })
  );
}

export function hora(iso: string) {
  return new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

export function hojeUTC(iso: string) {
  return iso.slice(0, 10) === new Date().toISOString().slice(0, 10);
}

export function mesmoMes(iso: string) {
  const d = new Date(iso);
  const agora = new Date();
  return d.getUTCMonth() === agora.getUTCMonth() && d.getUTCFullYear() === agora.getUTCFullYear();
}
