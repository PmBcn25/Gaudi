#!/usr/bin/env python3
"""Monta index.html (la página del artifact) a partir de estilo.css y cuerpo.html.
La tipografía Inter va embebida en estilo.css como data URI (sin recursos de terceros)."""
import pathlib
d = pathlib.Path(__file__).parent
css = (d / 'estilo.css').read_text()
body = (d / 'cuerpo.html').read_text()
(d / 'index.html').write_text(f'<title>Convertia</title>\n<style>\n{css}\n</style>\n{body}')
print('index.html:', (d / 'index.html').stat().st_size, 'bytes')
