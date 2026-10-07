const euros = new Intl.NumberFormat("es-ES", {
  style: "currency",
  currency: "EUR",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
  useGrouping: true,
});

/** 1250 → «12,50 €» (precio final, IVA incluido). */
export function formatoEuros(centimos: number): string {
  return euros.format(centimos / 100);
}

/** «12,50», «12.5», «12 €» → 1250. null si no es un importe válido. */
export function leerEuros(texto: string): number | null {
  const limpio = texto.replace(/[€\s]/g, "").replace(/\.(?=\d{3}(\D|$))/g, "").replace(",", ".");
  if (!/^\d+(\.\d{1,2})?$/.test(limpio)) return null;
  const valor = Math.round(Number(limpio) * 100);
  return Number.isFinite(valor) && valor >= 0 && valor < 10_000_000 ? valor : null;
}

/** 1250 → «12,50» para rellenar un campo de texto. */
export function centimosATexto(centimos: number | null | undefined): string {
  if (centimos === null || centimos === undefined) return "";
  return (centimos / 100).toFixed(2).replace(".", ",");
}

export function slugificar(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/&/g, " y ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60)
    .replace(/-+$/g, "");
}

export const SLUG_VALIDO = /^[a-z0-9](?:[a-z0-9-]{1,58}[a-z0-9])$/;
