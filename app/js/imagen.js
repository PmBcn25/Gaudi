// Preparación de la foto: orientación correcta, tamaño máximo y compresión JPEG.

const LADO_MAX = 2048;

export async function prepararFoto(archivo) {
  let bitmap;
  try {
    bitmap = await createImageBitmap(archivo, { imageOrientation: "from-image" });
  } catch {
    throw new Error(
      "No se puede leer esta imagen en este navegador. Si es HEIC (iPhone), guárdala como JPG o súbela desde el propio iPhone."
    );
  }
  const escala = Math.min(1, LADO_MAX / Math.max(bitmap.width, bitmap.height));
  const ancho = Math.round(bitmap.width * escala);
  const alto = Math.round(bitmap.height * escala);
  const lienzo = document.createElement("canvas");
  lienzo.width = ancho;
  lienzo.height = alto;
  const ctx = lienzo.getContext("2d");
  ctx.drawImage(bitmap, 0, 0, ancho, alto);
  bitmap.close?.();
  const blob = await new Promise((ok) => lienzo.toBlob(ok, "image/jpeg", 0.9));
  return { blob, ancho, alto };
}

export async function miniatura(blob, lado = 320) {
  const bitmap = await createImageBitmap(blob);
  const escala = Math.min(1, lado / Math.max(bitmap.width, bitmap.height));
  const lienzo = document.createElement("canvas");
  lienzo.width = Math.round(bitmap.width * escala);
  lienzo.height = Math.round(bitmap.height * escala);
  lienzo.getContext("2d").drawImage(bitmap, 0, 0, lienzo.width, lienzo.height);
  bitmap.close?.();
  return new Promise((ok) => lienzo.toBlob(ok, "image/jpeg", 0.8));
}

// Une antes y después en una sola imagen (para compartir con clientes)
export async function composicion(antes, despues, titulo) {
  const [a, d] = await Promise.all([createImageBitmap(antes), createImageBitmap(despues)]);
  const alto = 1080;
  const anchoA = Math.round((a.width / a.height) * alto);
  const anchoD = Math.round((d.width / d.height) * alto);
  const margen = 24;
  const cabecera = 84;
  const lienzo = document.createElement("canvas");
  lienzo.width = anchoA + anchoD + margen * 3;
  lienzo.height = alto + cabecera + margen;
  const ctx = lienzo.getContext("2d");
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, lienzo.width, lienzo.height);
  ctx.drawImage(a, margen, cabecera, anchoA, alto);
  ctx.drawImage(d, margen * 2 + anchoA, cabecera, anchoD, alto);
  ctx.fillStyle = "#1D4E5A";
  ctx.font = "600 34px system-ui, sans-serif";
  ctx.fillText("ANTES", margen, 56);
  ctx.fillStyle = "#C8553D";
  ctx.fillText("DESPUÉS", margen * 2 + anchoA, 56);
  ctx.fillStyle = "#6b6b6b";
  ctx.font = "400 26px system-ui, sans-serif";
  const t = titulo || "";
  ctx.fillText(t, lienzo.width - margen - ctx.measureText(t).width, 56);
  return new Promise((ok) => lienzo.toBlob(ok, "image/jpeg", 0.9));
}
