#!/usr/bin/env python3
"""Exporta las opciones de src/listas.py a app/js/opciones.js (misma fuente para Excel y app web).

Uso:  python3 src/exportar_opciones_web.py
"""

import json
from pathlib import Path

import listas as L

DESTINO = Path(__file__).resolve().parent.parent / "app" / "js" / "opciones.js"


def pares(filas):
    return [{"es": es, "en": en} for es, en in filas]


def main() -> None:
    datos = {
        "estancia": pares(L.ESTANCIA),
        "tipo": pares(L.TIPO),
        "estilo": pares(L.ESTILO),
        "intensidad": pares(L.INTENSIDAD),
        "suelo": pares(L.SUELO),
        "paredes": pares(L.PAREDES),
        "color": pares(L.COLOR),
        "techo": pares(L.TECHO),
        "carpinteria": pares(L.CARPINTERIA),
        "cocina": pares(L.COCINA),
        "encimera": pares(L.ENCIMERA),
        "bano": pares(L.BANO),
        "iluminacion": pares(L.ILUMINACION),
        "mobiliario": pares(L.MOBILIARIO),
        "proporcion": [{"es": es, "codigo": c, "en": en} for es, c, en in L.PROPORCION],
        "calidad": [{"es": es, "gemini": g, "openai": o} for es, g, o in L.CALIDAD],
        "estiloImagen": pares(L.ESTILO_IMAGEN),
        "luz": pares(L.LUZ),
    }
    texto = ("// Generado por src/exportar_opciones_web.py a partir de src/listas.py. No editar a mano.\n"
             "// en = fragmento en ingles para el prompt; \"-\" = no se menciona.\n"
             f"export const OPCIONES = {json.dumps(datos, ensure_ascii=False, indent=2)};\n")
    DESTINO.parent.mkdir(parents=True, exist_ok=True)
    DESTINO.write_text(texto, encoding="utf-8")
    print(f"OK  {DESTINO}")


if __name__ == "__main__":
    main()
