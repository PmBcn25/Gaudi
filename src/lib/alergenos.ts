// Los 14 alérgenos de declaración obligatoria (Reglamento UE 1169/2011).
export const ALERGENOS = [
  { id: "gluten", nombre: "Gluten", corto: "GL", color: "#b7791f" },
  { id: "crustaceos", nombre: "Crustáceos", corto: "CR", color: "#2b6cb0" },
  { id: "huevos", nombre: "Huevos", corto: "HU", color: "#d69e2e" },
  { id: "pescado", nombre: "Pescado", corto: "PE", color: "#3182ce" },
  { id: "cacahuetes", nombre: "Cacahuetes", corto: "CA", color: "#975a16" },
  { id: "soja", nombre: "Soja", corto: "SO", color: "#38a169" },
  { id: "lacteos", nombre: "Lácteos", corto: "LA", color: "#4a5568" },
  { id: "frutos_de_cascara", nombre: "Frutos de cáscara", corto: "FC", color: "#9c4221" },
  { id: "apio", nombre: "Apio", corto: "AP", color: "#2f855a" },
  { id: "mostaza", nombre: "Mostaza", corto: "MO", color: "#b7791f" },
  { id: "sesamo", nombre: "Sésamo", corto: "SE", color: "#744210" },
  { id: "sulfitos", nombre: "Sulfitos", corto: "SU", color: "#702459" },
  { id: "altramuces", nombre: "Altramuces", corto: "AL", color: "#c05621" },
  { id: "moluscos", nombre: "Moluscos", corto: "ML", color: "#2c5282" },
] as const;

export type AlergenoId = (typeof ALERGENOS)[number]["id"];

export const ALERGENO_POR_ID: Record<AlergenoId, (typeof ALERGENOS)[number]> = Object.fromEntries(
  ALERGENOS.map((a) => [a.id, a]),
) as never;
