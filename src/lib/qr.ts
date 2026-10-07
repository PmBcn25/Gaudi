import QRCode from "qrcode";
import { siteUrl } from "./config";

/** Enlace corto permanente al que apunta siempre el QR. */
export function enlaceCorto(qrCode: string): string {
  return `${siteUrl()}/q/${qrCode}`;
}

export function enlaceLegible(slug: string): string {
  return `${siteUrl()}/${slug}`;
}

export async function qrDataUrl(texto: string, tam = 1024): Promise<string> {
  return QRCode.toDataURL(texto, { width: tam, margin: 2, errorCorrectionLevel: "M", color: { dark: "#111111", light: "#ffffff" } });
}

function descargar(href: string, nombre: string) {
  const a = document.createElement("a");
  a.href = href;
  a.download = nombre;
  document.body.appendChild(a);
  a.click();
  a.remove();
}

export async function descargarQrPng(qrCode: string, slug: string) {
  descargar(await qrDataUrl(enlaceCorto(qrCode)), `qr-carta-${slug}.png`);
}

/** PDF A4 listo para imprimir: nombre del local, QR grande y el enlace. */
export async function descargarQrPdf(qrCode: string, slug: string, nombreLocal: string) {
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const ancho = doc.internal.pageSize.getWidth();
  const url = enlaceCorto(qrCode);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(28);
  doc.text(nombreLocal, ancho / 2, 40, { align: "center", maxWidth: ancho - 30 });
  doc.setFont("helvetica", "normal");
  doc.setFontSize(18);
  doc.text("Escanea para ver la carta", ancho / 2, 55, { align: "center" });

  const lado = 120;
  doc.addImage(await qrDataUrl(url, 1200), "PNG", (ancho - lado) / 2, 70, lado, lado);

  doc.setFontSize(13);
  doc.setTextColor(80);
  doc.text(url.replace(/^https?:\/\//, ""), ancho / 2, 205, { align: "center" });
  doc.text("Precios con IVA incluido. Consulta los alérgenos en la carta.", ancho / 2, 215, { align: "center" });

  doc.save(`qr-carta-${slug}.pdf`);
}
