#!/usr/bin/env python3
"""Pruebas de las funciones VBA puras (Base64, JSON, UTF-8, nombres de archivo...).

Monta un libro de prueba con los módulos reales de src/vba y los ejecuta en LibreOffice
(modo de compatibilidad VBA) a través de UNO. Comprueba también que los tres módulos compilan.

Uso:  python3 src/tests/probar_vba.py
"""

from __future__ import annotations

import base64
import io
import json
import subprocess
import sys
import tempfile
import time
from pathlib import Path

SRC = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(SRC))

import xlsxwriter  # noqa: E402

from build_app import VBA_DIR, vba_ascii  # noqa: E402
from vbaproject import Module, build_vba_project  # noqa: E402

TEST_VBA = r'''
Option Explicit

Private Function HexDump(ByRef b() As Byte) As String
    Dim i As Long, s As String
    For i = LBound(b) To UBound(b)
        s = s & Right$("0" & Hex$(b(i)), 2)
    Next
    HexDump = s
End Function

Public Function RunAll(ByVal tmp As String) As String
    Dim r As String, b() As Byte, d() As Byte, i As Long, n As Long, s As String, mime As String
    Dim buf() As Byte, extra() As Byte

    ReDim b(0 To 255)
    For i = 0 To 255
        b(i) = i
    Next
    s = B64EncPuro(b)
    r = r & "B64ENC=" & s & vbLf
    d = B64DecPuro(s)
    r = r & "B64DEC=" & HexDump(d) & vbLf

    For n = 1 To 5
        ReDim b(0 To n - 1)
        For i = 0 To n - 1
            b(i) = 97 + i
        Next
        s = B64EncPuro(b)
        d = B64DecPuro(s)
        r = r & "B64N" & n & "=" & s & "|" & HexDump(d) & vbLf
    Next

    r = r & "JSONESC=" & JsonEscapar("Salón ""x"" \ é" & vbLf & "€" & vbTab) & vbLf

    s = "{""error"": {""code"": 400, ""message"": ""Bad \""model\"" \u00e9 line\nnext"", ""status"": ""X""}}"
    r = r & "JSONTXT=" & JsonTexto(s, "message") & vbLf
    r = r & "JSONNUM=" & JsonTexto(s, "code") & "|" & JsonTexto(s, "nada") & vbLf

    s = "{""candidates"":[{""content"":{""parts"":[{""inlineData"":{""mimeType"":""image/png"",""data"":""QUFB""}}," & _
        "{""text"":""ok""},{""inlineData"":{""data"":""Qk\/C"",""mimeType"":""image/jpeg""}}]}}]}"
    r = r & "GEM=" & UltimaImagenGemini(s, mime) & "|" & mime & vbLf
    s = "{""candidates"":[{""content"":{""parts"":[{""text"":""sin imagen""}]},""finishReason"":""NO_IMAGE""}]}"
    mime = ""
    r = r & "GEMNO=" & UltimaImagenGemini(s, mime) & "|" & mime & "|" & JsonTexto(s, "finishReason") & vbLf
    s = "{""created"": 1, ""data"": [{""b64_json"": ""aGVsbG8=""}]}"
    r = r & "OAI=" & JsonCadenaRapida(s, "b64_json") & vbLf

    d = Utf8Bytes("aé€" & ChrW(&HD83D) & ChrW(&HDE00))
    r = r & "UTF8=" & HexDump(d) & vbLf
    r = r & "NOMBRE=" & NombreSeguro("Ejemplo · Salón calle Mallorca / 3º") & "|" & NombreSeguro("···") & vbLf
    r = r & "QS=" & QS("it's") & vbLf
    r = r & "APPLE=" & AppleStr("a\b""c") & vbLf
    r = r & "EXT=" & Extension("C:\fotos\Salón.JPG") & "|" & MimeDeArchivo("x.PNG") & "|" & _
        ExtensionValida("a.heic") & "|" & ExtensionValida("a.gif") & vbLf
    r = r & "NOMBREARCH=" & NombreArchivo("C:\fotos\salon.jpg") & "|" & NombreArchivo("/Users/a/b c.png") & vbLf

    buf = UnirBytes(Array(Utf8Bytes("hola "), Utf8Bytes("mundo ñ")))
    r = r & "ANADIR=" & HexDump(buf) & vbLf

    ReDim b(0 To 9999)
    For i = 0 To 9999
        b(i) = (i * 7 + 3) Mod 256
    Next
    EscribirBytes tmp, b
    d = LeerBytes(tmp)
    r = r & "FICHERO=" & (UBound(d) = 9999) & "|" & (HexDump(d) = HexDump(b)) & "|" & TamanoArchivo(tmp) & "|" & _
        ExisteArchivo(tmp) & "|" & ExisteArchivo(tmp & ".no") & vbLf
    BorrarArchivo tmp
    r = r & "BORRADO=" & ExisteArchivo(tmp) & vbLf

    r = r & "SEG=" & Segundos(Timer) & vbLf
    r = r & "TITULO=" & Titulo() & vbLf
    RunAll = r
End Function

Public Function PruebaGemini(ByVal caso As Long) As String
    If caso = 1 Then
        PruebaGemini = CuerpoGemini("Salón ""moderno"" — ñ" & vbLf & "fin", "image/jpeg", "QUJD", "16:9", "2K", _
                                    "gemini-3.1-flash-image")
    Else
        PruebaGemini = CuerpoGemini("x", "image/png", "QUJD", "auto", "1K", "gemini-2.5-flash-image")
    End If
End Function

Public Function PruebaOpenAI() As Variant
    Dim foto() As Byte, i As Long
    ReDim foto(0 To 255)
    For i = 0 To 255
        foto(i) = i
    Next
    PruebaOpenAI = CuerpoOpenAI("gpt-image-1.5", "Salón ñ", "4:3", "high", "foto.jpg", "image/jpeg", foto, "LIMITE123")
End Function

' Decodifica una respuesta real de Gemini guardada en un fichero y escribe la imagen resultante.
Public Function PruebaRespuesta(ByVal entrada As String, ByVal salida As String) As String
    Dim b() As Byte, resp As String, mime As String, b64 As String, img() As Byte, t0 As Single
    t0 = Timer
    b = LeerBytes(entrada)
    resp = StrConv(b, vbUnicode)
    b64 = UltimaImagenGemini(resp, mime)
    img = B64DecPuro(b64)
    EscribirBytes salida, img
    PruebaRespuesta = mime & "|" & Segundos(t0)
End Function

Public Function CompilaIA() As String
    CompilaIA = MotorActual() & "|" & ModeloActual("Gemini") & "|" & ModeloActual("OpenAI")
End Function

Public Function CompilaGaudi() As String
    IrAInicio
    CompilaGaudi = "ok"
End Function
'''


def libro_prueba(ruta: Path) -> None:
    modulos = [Module("ThisWorkbook", "workbook", ""), Module("Hoja1", "sheet", ""),
               Module("Hoja2", "sheet", "")]
    for nombre in ("modGaudi", "modIA", "modUtil"):
        modulos.append(Module(nombre, "module", vba_ascii((VBA_DIR / f"{nombre}.bas").read_text("utf-8"), nombre)))
    modulos.append(Module("modTest", "module", vba_ascii(TEST_VBA, "modTest")))
    wb = xlsxwriter.Workbook(str(ruta))
    ws = wb.add_worksheet("INICIO")
    ws.set_vba_name("Hoja1")
    ws2 = wb.add_worksheet("AJUSTES")
    ws2.set_vba_name("Hoja2")
    ws2.write("C6", "OpenAI (GPT Image)")
    ws2.write("C7", "")
    ws2.write("C8", "gpt-image-2")
    wb.define_name("CfgMotor", "=AJUSTES!$C$6")
    wb.define_name("CfgModeloGemini", "=AJUSTES!$C$7")
    wb.define_name("CfgModeloOpenAI", "=AJUSTES!$C$8")
    wb.set_vba_name("ThisWorkbook")
    wb.add_vba_project(io.BytesIO(build_vba_project(modulos)), is_stream=True)
    wb.close()


def ejecutar(ruta: Path, tmp: Path) -> dict[str, str]:
    import uno
    from com.sun.star.beans import PropertyValue

    perfil = Path(tempfile.mkdtemp(prefix="lo_perfil_"))
    proc = subprocess.Popen(["soffice", f"-env:UserInstallation={perfil.as_uri()}", "--headless", "--invisible",
                             "--norestore", "--accept=pipe,name=gaudi_pruebas;urp;"],
                            stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    try:
        local = uno.getComponentContext()
        resolver = local.ServiceManager.createInstanceWithContext("com.sun.star.bridge.UnoUrlResolver", local)
        ctx = None
        for _ in range(120):
            try:
                ctx = resolver.resolve("uno:pipe,name=gaudi_pruebas;urp;StarOffice.ComponentContext")
                break
            except Exception:
                time.sleep(0.5)
        desktop = ctx.ServiceManager.createInstanceWithContext("com.sun.star.frame.Desktop", ctx)

        def prop(n, v):
            p = PropertyValue()
            p.Name, p.Value = n, v
            return p

        doc = desktop.loadComponentFromURL(uno.systemPathToFileUrl(str(ruta)), "_blank", 0,
                                           (prop("Hidden", True), prop("MacroExecutionMode", 4)))
        sp = doc.getScriptProvider()

        def llamar(nombre, *args):
            s = sp.getScript(f"vnd.sun.star.script:VBAProject.modTest.{nombre}?language=Basic&location=document")
            return s.invoke(args, (), ())[0]

        salida = {"RunAll": llamar("RunAll", str(tmp))}
        salida["Gemini1"] = llamar("PruebaGemini", 1)
        salida["Gemini2"] = llamar("PruebaGemini", 2)
        cuerpo = llamar("PruebaOpenAI")
        salida["OpenAI"] = bytes(cuerpo.value if hasattr(cuerpo, "value") else cuerpo)
        # Respuesta simulada de Gemini con una imagen de ~300 KB (dos partes: la buena es la última)
        imagen = bytes((i * 31 + (i >> 7)) % 256 for i in range(300_000))
        resp = json.dumps({"candidates": [{"content": {"parts": [
            {"text": "Aquí tienes la reforma"},
            {"inlineData": {"mimeType": "image/png", "data": base64.b64encode(b"borrador").decode()}},
            {"inlineData": {"mimeType": "image/jpeg", "data": base64.b64encode(imagen).decode()}},
        ]}, "finishReason": "STOP"}]}, indent=2)
        entrada = tmp.with_name("respuesta.json")
        entrada.write_text(resp)
        destino = tmp.with_name("imagen.jpg")
        salida["Respuesta"] = llamar("PruebaRespuesta", str(entrada), str(destino))
        salida["RespuestaOK"] = destino.read_bytes() == imagen
        for nombre in ("CompilaIA", "CompilaGaudi"):
            try:
                salida[nombre] = str(llamar(nombre))
            except Exception as e:  # noqa: BLE001
                salida[nombre] = "ERROR: " + str(e).splitlines()[0][:300]
        doc.close(True)
        return salida
    finally:
        proc.terminate()
        proc.wait(timeout=30)


def main() -> int:
    with tempfile.TemporaryDirectory() as d:
        ruta = Path(d) / "prueba.xlsm"
        libro_prueba(ruta)
        res = ejecutar(ruta, Path(d) / "fichero.bin")

    valores = dict(linea.split("=", 1) for linea in res["RunAll"].strip().split("\n") if "=" in linea)
    esperado_b64 = base64.b64encode(bytes(range(256))).decode()
    utf8 = "aé€😀".encode("utf-8").hex().upper()
    comprobaciones = {
        "B64ENC": esperado_b64,
        "B64DEC": bytes(range(256)).hex().upper(),
        **{f"B64N{n}": base64.b64encode(b"abcde"[:n]).decode() + "|" + b"abcde"[:n].hex().upper()
           for n in range(1, 6)},
        "JSONESC": 'Sal\\u00F3n \\"x\\" \\\\ \\u00E9\\n\\u20AC\\t',
        "JSONTXT": 'Bad "model" é line\nnext'.split("\n")[0],
        "GEM": "Qk/C|image/jpeg",
        "GEMNO": "||NO_IMAGE",
        "OAI": "aGVsbG8=",
        "UTF8": utf8,
        "NOMBRE": "Ejemplo_Salon_calle_Mallorca_3|Reforma",
        "QS": "'it'\\''s'",
        "APPLE": '"a\\\\b\\"c"',
        "NOMBREARCH": "salon.jpg|b c.png",
        "ANADIR": "hola mundo ñ".encode().hex().upper(),
        "TITULO": "Gaudí · Visualizador de reformas",
    }
    fallos = 0
    for clave, esperado in comprobaciones.items():
        real = valores.get(clave)
        ok = real == esperado
        fallos += not ok
        print(f"{'OK ' if ok else 'FALLO'} {clave}: {real!r}" + ("" if ok else f"  (esperado {esperado!r})"))
    for clave in ("JSONNUM", "EXT", "FICHERO", "BORRADO", "SEG"):
        print(f"--  {clave}: {valores.get(clave)!r}")
    # Peticion a Gemini: JSON valido con la estructura esperada
    g1 = json.loads(res["Gemini1"])
    partes = g1["contents"][0]["parts"]
    gem_ok = (partes[0]["text"] == "Salón \"moderno\" — ñ\nfin"
              and partes[1]["inline_data"] == {"mime_type": "image/jpeg", "data": "QUJD"}
              and g1["generationConfig"] == {"responseModalities": ["TEXT", "IMAGE"],
                                             "imageConfig": {"aspectRatio": "16:9", "imageSize": "2K"}}
              and res["Gemini1"].isascii())
    g2 = json.loads(res["Gemini2"])
    gem_ok &= g2["generationConfig"] == {"responseModalities": ["TEXT", "IMAGE"]}
    fallos += not gem_ok
    print(f"{'OK ' if gem_ok else 'FALLO'} CuerpoGemini: {res['Gemini1'][:90]}...")

    # Peticion a OpenAI: multipart valido
    from email.parser import BytesParser
    from email.policy import HTTP
    msg = BytesParser(policy=HTTP).parsebytes(
        b"Content-Type: multipart/form-data; boundary=LIMITE123\r\n\r\n" + res["OpenAI"])
    campos = {}
    for parte in msg.iter_parts():
        nombre = parte.get_param("name", header="content-disposition")
        campos[nombre] = (parte.get_payload(decode=True), parte.get_filename(), parte.get_content_type())
    oai_ok = (campos["model"][0] == b"gpt-image-1.5" and campos["prompt"][0] == "Salón ñ".encode()
              and campos["size"][0] == b"1536x1024" and campos["quality"][0] == b"high"
              and campos["input_fidelity"][0] == b"high" and campos["n"][0] == b"1"
              and campos["image[]"] == (bytes(range(256)), "foto.jpg", "image/jpeg"))
    fallos += not oai_ok
    print(f"{'OK ' if oai_ok else 'FALLO'} CuerpoOpenAI: campos {sorted(campos)}")

    resp_ok = res["RespuestaOK"] and res["Respuesta"].startswith("image/jpeg|")
    fallos += not resp_ok
    print(f"{'OK ' if resp_ok else 'FALLO'} Respuesta Gemini 300 KB decodificada (mime|segundos): {res['Respuesta']}")
    print("--  CompilaIA:", res["CompilaIA"])
    print("--  CompilaGaudi:", res["CompilaGaudi"])
    return 1 if fallos else 0


if __name__ == "__main__":
    sys.exit(main())
