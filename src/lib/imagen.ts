/**
 * Reduce una foto del móvil a JPEG de como mucho `lado` px. Así la subida es rápida en 4G,
 * se aceptan formatos como HEIC (si el navegador los abre) y la IA recibe un tamaño adecuado.
 */
export async function prepararFoto(archivo: File, lado = 2000, calidad = 0.85): Promise<Blob> {
  const bitmap = await createImageBitmap(archivo).catch(() => null);
  if (!bitmap) throw new Error(`No podemos abrir «${archivo.name}». Prueba con una foto JPG o PNG.`);
  const escala = Math.min(1, lado / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * escala);
  canvas.height = Math.round(bitmap.height * escala);
  const ctx = canvas.getContext("2d")!;
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  const blob = await new Promise<Blob | null>((ok) => canvas.toBlob(ok, "image/jpeg", calidad));
  if (!blob) throw new Error("No hemos podido preparar la foto.");
  return blob;
}

/** Logo cuadrado de 512 px en PNG (conserva transparencia). */
export async function prepararLogo(archivo: File): Promise<Blob> {
  const bitmap = await createImageBitmap(archivo).catch(() => null);
  if (!bitmap) throw new Error("No podemos abrir esa imagen. Prueba con un PNG o JPG.");
  const lado = 512;
  const canvas = document.createElement("canvas");
  canvas.width = lado;
  canvas.height = lado;
  const ctx = canvas.getContext("2d")!;
  const escala = Math.min(lado / bitmap.width, lado / bitmap.height);
  const w = bitmap.width * escala;
  const h = bitmap.height * escala;
  ctx.drawImage(bitmap, (lado - w) / 2, (lado - h) / 2, w, h);
  bitmap.close();
  const blob = await new Promise<Blob | null>((ok) => canvas.toBlob(ok, "image/png"));
  if (!blob) throw new Error("No hemos podido preparar el logo.");
  return blob;
}
