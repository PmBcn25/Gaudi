#!/usr/bin/env bash
# Genera archivos de prueba REALES (nada de muestras descargadas) en tests/fixtures.
# Necesita en la máquina de pruebas: ffmpeg, pandoc, libreoffice (soffice), ghostscript,
# qpdf, heif-enc, zip y python3.
set -euo pipefail
cd "$(dirname "$0")"
F=fixtures
rm -rf "$F" && mkdir -p "$F" && cd "$F"
q() { "$@" >/dev/null 2>&1; }
ff() { ffmpeg -hide_banner -loglevel error -nostdin -y "$@"; }
LO_PROFILE="file://$PWD/.lo-profile"
lo() { soffice -env:UserInstallation="$LO_PROFILE" --headless --norestore "$@" >/dev/null 2>&1; }

echo "· imágenes"
ff -f lavfi -i "testsrc2=size=1920x1080:rate=1" -frames:v 1 -q:v 2 photo.jpg
ff -f lavfi -i "testsrc2=size=800x600:rate=1,format=rgba,geq=r='r(X,Y)':g='g(X,Y)':b='b(X,Y)':a='if(lt(X,400),255,128)'" -frames:v 1 alpha.png
ff -f lavfi -i "testsrc=size=320x240:rate=10:duration=3" -vf "split[a][b];[a]palettegen[p];[b][p]paletteuse" -loop 0 anim.gif
ff -i photo.jpg -frames:v 1 -update 1 photo.png
heif-enc -q 70 -o iphone.heic photo.png >/dev/null
ff -i photo.jpg -frames:v 1 -pix_fmt bgr24 -update 1 image.bmp
ff -i alpha.png -frames:v 1 -update 1 image.tga
ff -i photo.jpg -frames:v 1 -c:v libjxl -update 1 image.jxl
ff -i photo.jpg -frames:v 1 -c:v jpeg2000 -update 1 image.jp2
ff -i photo.jpg -frames:v 1 -c:v libwebp -update 1 image.webp 2>/dev/null || ff -i photo.jpg -frames:v 1 -update 1 image.webp
ff -i photo.jpg -frames:v 1 -pix_fmt rgb24 -compression_algo deflate -update 1 image.tiff
ff -i photo.jpg -frames:v 1 -compression_algo deflate -update 1 ycbcr.tiff
ff -i photo.jpg -frames:v 1 -vf scale=64:64 -update 1 favicon.ico
ff -i photo.jpg -frames:v 1 -vf scale=640:-2 -pix_fmt gbrpf32le -c:v exr -update 1 image.exr 2>/dev/null || true
cat > logo.svg <<'EOF'
<svg xmlns="http://www.w3.org/2000/svg" width="120" height="120" viewBox="0 0 120 120"><rect width="120" height="120" rx="24" fill="#4f46e5"/><circle cx="60" cy="60" r="30" fill="#fff"/></svg>
EOF
# PSD mínimo (RGB 8 bits, sin compresión) escrito a mano.
python3 - <<'EOF'
import struct
w, h = 64, 48
hdr = b'8BPS' + struct.pack('>H6xHIIHH', 1, 3, h, w, 8, 3)
data = b''.join(bytes([(x * 4) % 256 for y in range(h) for x in range(w)]) if c == 0 else bytes([(y * 5) % 256 for y in range(h) for x in range(w)]) if c == 1 else bytes([128] * (w * h)) for c in range(3))
psd = hdr + struct.pack('>I', 0) + struct.pack('>I', 0) + struct.pack('>I', 0) + struct.pack('>H', 0) + data
open('image.psd', 'wb').write(psd)
EOF

echo "· audio"
ff -f lavfi -i "sine=frequency=440:duration=12" -f lavfi -i "sine=frequency=660:duration=12" -filter_complex "[0][1]amerge=inputs=2,volume=0.3" -c:a pcm_s16le tone.wav
ff -i tone.wav -c:a libmp3lame -b:a 192k voice.mp3
ff -i tone.wav -c:a flac music.flac
ff -i tone.wav -c:a aac -b:a 128k song.m4a
ff -i tone.wav -c:a libvorbis song.ogg
ff -i tone.wav -c:a libopus song.opus
ff -i tone.wav -ar 8000 -ac 1 -c:a libopencore_amrnb -b:a 12.2k memo.amr 2>/dev/null || true
ff -i tone.wav -c:a pcm_s16be song.aiff

echo "· vídeo"
ff -f lavfi -i "testsrc2=size=1280x720:rate=30" -f lavfi -i "sine=frequency=330" -t 20 -c:v libx264 -preset veryfast -pix_fmt yuv420p -c:a aac -shortest clip.mp4
# Vídeo más largo y pesado para medir el progreso (60 s, 1080p).
ff -f lavfi -i "testsrc2=size=1920x1080:rate=30" -f lavfi -i "sine=frequency=220" -t 60 -c:v libx264 -preset ultrafast -crf 18 -pix_fmt yuv420p -c:a aac -shortest long1080.mp4
ff -f lavfi -i "testsrc2=size=640x360:rate=25" -t 6 -c:v libx264 -preset veryfast -pix_fmt yuv420p silent.mp4
ff -i clip.mp4 -t 8 -c:v libx264 -preset veryfast -c:a aac -f mov clip.mov
# WebM "grabado en el navegador": escrito a una tubería, sin duración en la cabecera, y de tasa variable.
ff -f lavfi -i "testsrc2=size=1280x720:rate=30" -f lavfi -i "sine=frequency=500" -t 10 \
  -vf "select='if(lt(t\,3)\,1\,not(mod(n\,6)))'" -fps_mode vfr -c:v libvpx-vp9 -deadline realtime -cpu-used 8 -c:a libopus -f webm pipe:1 > screen.webm
ff -i clip.mp4 -t 6 -c:v mpeg4 -c:a libmp3lame clip.avi
ff -i clip.mp4 -t 6 -c:v mpeg2video -c:a mp2 -f vob clip.vob
ff -i clip.mp4 -t 6 -c:v libx264 -c:a aac -f mpegts clip.ts

echo "· documentos"
cat > doc.md <<'EOF'
# Informe trimestral

Este documento de prueba tiene **negritas**, *cursivas* y una lista:

- Primero
- Segundo
- Tercero

| Producto | Ventas |
|----------|-------:|
| Alfa     |    120 |
| Beta     |     80 |

## Conclusiones

Texto final con acentos: canción, pingüino, año.
EOF
pandoc doc.md -o report.docx
pandoc doc.md -o report.odt
lo --convert-to doc --outdir . report.docx
lo --convert-to rtf --outdir . report.docx
printf 'Producto;Ventas;Mes\nAlfa;120;Enero\nBeta;80;Febrero\n"Gamma; con punto y coma";45;Marzo\n' > ventas.csv
printf 'nombre,edad,ciudad\nAna,34,Madrid\nLuis,28,Sevilla\nMarta,41,Bilbao\n' > personas.csv
printf 'a\tb\tc\n1\t2\t3\n4\t5\t6\n' > tabla.tsv
lo --convert-to xlsx --outdir . personas.csv
lo --convert-to xls --outdir . personas.csv
cat > slides.md <<'EOF'
% Presentación de prueba

# Primera diapositiva

- Punto uno
- Punto dos

# Segunda diapositiva

Texto de la segunda diapositiva.
EOF
pandoc slides.md -o deck.pptx
lo --convert-to ppt --outdir . deck.pptx
lo --convert-to odp --outdir . deck.pptx

echo "· PDF"
cat > pages.ps <<'EOF'
%!PS
/Helvetica findfont 36 scalefont setfont
1 1 6 { /n exch def 72 700 moveto (Pagina ) show n 10 string cvs show 72 640 moveto (Texto de prueba de Convertia) show showpage } for
EOF
gs -q -dSAFER -dBATCH -dNOPAUSE -sDEVICE=pdfwrite -sOutputFile=pages.pdf pages.ps
# PDF con fotos grandes (para comprimir): 8 páginas con una imagen cada una.
for i in 1 2 3 4; do ff -f lavfi -i "testsrc2=size=2400x1600:rate=1,noise=alls=40:allf=t" -frames:v 1 -q:v 2 "big$i.jpg"; done
lo --convert-to pdf --outdir . big1.jpg; lo --convert-to pdf --outdir . big2.jpg; lo --convert-to pdf --outdir . big3.jpg; lo --convert-to pdf --outdir . big4.jpg
qpdf --empty --pages big1.pdf big2.pdf big3.pdf big4.pdf big1.pdf big2.pdf big3.pdf big4.pdf -- photos.pdf
rm -f big?.jpg big?.pdf
cp pages.pdf second.pdf
qpdf --encrypt secreto secreto 256 -- pages.pdf locked.pdf

echo "· texto y libros"
cat > readme.md <<'EOF'
# Manual de prueba

Párrafo con [un enlace](https://example.com) y `código`.

![Imagen que no existe](no-existe.png)

![Ruta absoluta peligrosa](/etc/passwd)

![Imagen remota](http://example.com/x.png)

<img src="/etc/hostname">

## Sección dos

1. Uno
2. Dos

> Una cita.
EOF
pandoc readme.md -s -o page.html
pandoc readme.md -o book.epub --metadata title="Libro de prueba"
pandoc readme.md -t fb2 -o book.fb2
pandoc readme.md -t mediawiki -o article.wiki
pandoc readme.md -t textile -o notes.textile
printf 'Notas sueltas\n\nPrimera línea de texto.\nSegunda línea.\n' > notes.txt
cat > notebook.ipynb <<'EOF'
{"cells":[{"cell_type":"markdown","metadata":{},"source":["# Cuaderno\n","Texto en **markdown**."]},{"cell_type":"code","execution_count":1,"metadata":{},"outputs":[{"name":"stdout","output_type":"stream","text":["4\n"]}],"source":["print(2+2)"]}],"metadata":{"kernelspec":{"display_name":"Python 3","language":"python","name":"python3"},"language_info":{"name":"python"}},"nbformat":4,"nbformat_minor":5}
EOF
cat > outline.opml <<'EOF'
<?xml version="1.0" encoding="UTF-8"?>
<opml version="2.0"><head><title>Esquema</title></head><body><outline text="Capítulo 1"><outline text="Idea A"/></outline><outline text="Capítulo 2"/></body></opml>
EOF

echo "· subtítulos"
printf '1\n00:00:01,000 --> 00:00:03,500\nHola, ¿qué tal?\n\n2\n00:00:04,000 --> 00:00:06,000\nSubtítulo de prueba.\n' > subs.srt
ff -i subs.srt subs.vtt
ff -i subs.srt subs.ass

echo "· archivos rotos y no soportados"
ff -f lavfi -i "testsrc2=size=640x360:rate=25" -t 5 -c:v libx264 -preset veryfast truncated-src.mp4
head -c 60000 truncated-src.mp4 > truncated.mp4 && rm truncated-src.mp4
head -c 9000 photo.jpg > corrupt.jpg
printf '%%PDF-1.7\nesto no es un pdf de verdad, solo basura\n' > corrupt.pdf
head -c 2000 report.docx > corrupt.docx
echo "hola, no soy una imagen" > fake.png
head -c 5000 /dev/urandom > random.xyz
printf '#EXTM3U\n#EXTINF:3,\n/etc/passwd\n' > playlist.m3u8
printf '\\documentclass{article}\\begin{document}\\input{/etc/passwd}\\end{document}\n' > evil.tex
rm -rf .lo-profile pages.ps
ls -la | awk 'NR>3{printf "%10s  %s\n", $5, $9}'
