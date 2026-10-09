Option Explicit

' Utilidades generales: rangos con nombre, ficheros, Base64, JSON y UTF-8.
' Todo el codigo funciona sin referencias externas (enlace tardio) en Windows y Mac.

Public Function Titulo() As String
    Titulo = "Gaudí · Visualizador de reformas"
End Function

Public Function EsMac() As Boolean
    EsMac = (InStr(1, Application.OperatingSystem, "Mac", vbTextCompare) > 0)
End Function

' ---------------------------------------------------------------- Rangos

Public Function Rg(ByVal nombre As String) As Range
    Set Rg = ThisWorkbook.Names(nombre).RefersToRange
End Function

Public Function Valor(ByVal nombre As String) As String
    Dim v As Variant
    v = Rg(nombre).Cells(1, 1).Value
    If IsError(v) Then
        Valor = ""
    Else
        Valor = Trim$(CStr(v))
    End If
End Function

Public Function Desproteger(ByVal ws As Worksheet) As Boolean
    Desproteger = ws.ProtectContents
    If Desproteger Then ws.Unprotect
End Function

Public Sub Reproteger(ByVal ws As Worksheet, ByVal estaba As Boolean)
    If estaba Then ws.Protect DrawingObjects:=False, Contents:=True, Scenarios:=True
End Sub

Public Sub Escribir(ByVal nombre As String, ByVal v As Variant)
    Dim r As Range, estaba As Boolean
    Set r = Rg(nombre).Cells(1, 1)
    estaba = Desproteger(r.Worksheet)
    r.Value = v
    Reproteger r.Worksheet, estaba
End Sub

Public Sub EscribirEnlace(ByVal nombre As String, ByVal ruta As String, ByVal texto As String)
    Dim r As Range, estaba As Boolean
    Set r = Rg(nombre).Cells(1, 1)
    estaba = Desproteger(r.Worksheet)
    r.Hyperlinks.Delete
    r.Value = texto
    If ruta <> "" Then r.Worksheet.Hyperlinks.Add Anchor:=r, Address:=ruta, TextToDisplay:=texto
    Reproteger r.Worksheet, estaba
End Sub

' ---------------------------------------------------------------- Ficheros
' Las funciones que devuelven bytes usan Variant (contiene un Byte()) para ser compatibles
' tambien con el modo VBA de LibreOffice, donde se ejecutan las pruebas automaticas.

Public Function NombreArchivo(ByVal ruta As String) As String
    Dim p As Long
    p = InStrRev(ruta, "\")
    If InStrRev(ruta, "/") > p Then p = InStrRev(ruta, "/")
    If InStrRev(ruta, ":") > p And EsMac() Then p = InStrRev(ruta, ":")
    NombreArchivo = Mid$(ruta, p + 1)
End Function

Public Function Extension(ByVal ruta As String) As String
    Dim p As Long
    p = InStrRev(ruta, ".")
    If p > 0 Then Extension = LCase$(Mid$(ruta, p + 1))
End Function

Public Function ExtensionValida(ByVal ruta As String) As Boolean
    Select Case Extension(ruta)
        Case "jpg", "jpeg", "png", "webp", "heic", "heif"
            ExtensionValida = True
    End Select
End Function

Public Function MimeDeArchivo(ByVal ruta As String) As String
    Select Case Extension(ruta)
        Case "png": MimeDeArchivo = "image/png"
        Case "webp": MimeDeArchivo = "image/webp"
        Case "heic": MimeDeArchivo = "image/heic"
        Case "heif": MimeDeArchivo = "image/heif"
        Case Else: MimeDeArchivo = "image/jpeg"
    End Select
End Function

Public Function ExisteArchivo(ByVal ruta As String) As Boolean
    On Error Resume Next
    If Len(ruta) = 0 Then Exit Function
    ExisteArchivo = (FileLen(ruta) >= 0)
End Function

Public Function TamanoArchivo(ByVal ruta As String) As Long
    On Error Resume Next
    TamanoArchivo = FileLen(ruta)
End Function

Public Function LeerBytes(ByVal ruta As String) As Variant
    Dim f As Integer, b() As Byte, n As Long
    f = FreeFile
    Open ruta For Binary Access Read As #f
    n = LOF(f)
    If n = 0 Then
        Close #f
        Err.Raise vbObjectError + 513, , "El archivo está vacío: " & ruta
    End If
    ReDim b(0 To n - 1)
    Get #f, 1, b
    Close #f
    LeerBytes = b
End Function

Public Sub EscribirBytes(ByVal ruta As String, ByRef b() As Byte)
    Dim f As Integer
    BorrarArchivo ruta
    f = FreeFile
    Open ruta For Binary Access Write As #f
    Put #f, 1, b
    Close #f
End Sub

Public Sub BorrarArchivo(ByVal ruta As String)
    On Error Resume Next
    If ExisteArchivo(ruta) Then Kill ruta
End Sub

Public Sub CrearCarpeta(ByVal carpeta As String)
    Dim padre As String, p As Long
    On Error Resume Next
    If Len(Dir$(carpeta, vbDirectory)) > 0 Then Exit Sub
    p = InStrRev(carpeta, Application.PathSeparator)
    If p > 1 Then
        padre = Left$(carpeta, p - 1)
        If Len(padre) > 3 Then CrearCarpeta padre
    End If
    MkDir carpeta
End Sub

Public Function CarpetaSalida() As String
    Dim c As String, sep As String
    sep = Application.PathSeparator
    c = Valor("CfgCarpeta")
    If c = "" Then
        If EsMac() Then
            c = Environ("HOME") & "/Gaudi Reformas"
        Else
            On Error Resume Next
            c = CreateObject("Shell.Application").Namespace(39).Self.Path
            On Error GoTo 0
            If c = "" Then c = Environ("USERPROFILE") & "\Pictures"
            c = c & "\Gaudi Reformas"
        End If
    End If
    If Right$(c, 1) = sep Then c = Left$(c, Len(c) - 1)
    CrearCarpeta c
    CarpetaSalida = c
End Function

Public Function CarpetaTemporal() As String
    Dim c As String
    If EsMac() Then
        c = Environ("TMPDIR")
        If c = "" Then c = Environ("HOME")
    Else
        c = Environ("TEMP")
        If c = "" Then c = Environ("USERPROFILE")
    End If
    If Right$(c, 1) <> Application.PathSeparator Then c = c & Application.PathSeparator
    CarpetaTemporal = c
End Function

' Quita acentos y caracteres no validos para usar el texto como nombre de archivo.
Public Function NombreSeguro(ByVal s As String) As String
    Dim i As Long, c As Long, r As String, ch As String
    For i = 1 To Len(s)
        ch = Mid$(s, i, 1)
        c = AscW(ch) And &HFFFF&
        Select Case c
            Case 48 To 57, 65 To 90, 97 To 122, 45, 95: r = r & ch
            Case 32, 46: r = r & "_"
            Case 224 To 229: r = r & "a"
            Case 192 To 197: r = r & "A"
            Case 232 To 235: r = r & "e"
            Case 200 To 203: r = r & "E"
            Case 236 To 239: r = r & "i"
            Case 204 To 207: r = r & "I"
            Case 242 To 246: r = r & "o"
            Case 210 To 214: r = r & "O"
            Case 249 To 252: r = r & "u"
            Case 217 To 220: r = r & "U"
            Case 241: r = r & "n"
            Case 209: r = r & "N"
            Case 231: r = r & "c"
            Case 199: r = r & "C"
        End Select
    Next
    Do While InStr(r, "__") > 0
        r = Replace(r, "__", "_")
    Loop
    If Len(r) > 40 Then r = Left$(r, 40)
    If r = "" Or r = "_" Then r = "Reforma"
    NombreSeguro = r
End Function

' ---------------------------------------------------------------- Tiempo

Public Function Segundos(ByVal t0 As Single) As Long
    Dim s As Single
    s = Timer - t0
    If s < 0 Then s = s + 86400
    Segundos = CLng(s)
End Function

' ---------------------------------------------------------------- Base64

Public Function Base64Codificar(ByRef b() As Byte) As String
    Dim res As String
    If Not EsMac() Then
        If B64EncMsxml(b, res) Then
            Base64Codificar = res
            Exit Function
        End If
    End If
    Base64Codificar = B64EncPuro(b)
End Function

Public Function Base64Decodificar(ByRef s As String) As Variant
    Dim res() As Byte
    If Not EsMac() Then
        If B64DecMsxml(s, res) Then
            Base64Decodificar = res
            Exit Function
        End If
    End If
    Base64Decodificar = B64DecPuro(s)
End Function

Private Function B64EncMsxml(ByRef b() As Byte, ByRef res As String) As Boolean
    Dim doc As Object, nodo As Object
    On Error GoTo Fallo
    Set doc = CreateObject("MSXML2.DOMDocument.6.0")
    Set nodo = doc.createElement("b64")
    nodo.DataType = "bin.base64"
    nodo.nodeTypedValue = b
    res = Replace(Replace(nodo.Text, vbLf, ""), vbCr, "")
    B64EncMsxml = True
    Exit Function
Fallo:
    B64EncMsxml = False
End Function

Private Function B64DecMsxml(ByRef s As String, ByRef res() As Byte) As Boolean
    Dim doc As Object, nodo As Object
    On Error GoTo Fallo
    Set doc = CreateObject("MSXML2.DOMDocument.6.0")
    Set nodo = doc.createElement("b64")
    nodo.DataType = "bin.base64"
    nodo.Text = s
    res = nodo.nodeTypedValue
    B64DecMsxml = True
    Exit Function
Fallo:
    B64DecMsxml = False
End Function

Public Function B64EncPuro(ByRef b() As Byte) As String
    Const ALFABETO As String = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/"
    Dim tabla(0 To 63) As Byte, salida() As Byte
    Dim i As Long, j As Long, lb As Long, ub As Long, n As Long
    Dim b1 As Long, b2 As Long, b3 As Long
    lb = LBound(b)
    ub = UBound(b)
    n = ub - lb + 1
    If n <= 0 Then Exit Function
    For i = 0 To 63
        tabla(i) = Asc(Mid$(ALFABETO, i + 1, 1))
    Next
    ReDim salida(0 To ((n + 2) \ 3) * 4 - 1)
    j = 0
    For i = lb To ub Step 3
        b1 = b(i)
        If i + 1 <= ub Then b2 = b(i + 1) Else b2 = 0
        If i + 2 <= ub Then b3 = b(i + 2) Else b3 = 0
        salida(j) = tabla(b1 \ 4)
        salida(j + 1) = tabla(((b1 And 3) * 16) Or (b2 \ 16))
        If i + 1 <= ub Then
            salida(j + 2) = tabla(((b2 And 15) * 4) Or (b3 \ 64))
        Else
            salida(j + 2) = 61
        End If
        If i + 2 <= ub Then
            salida(j + 3) = tabla(b3 And 63)
        Else
            salida(j + 3) = 61
        End If
        j = j + 4
    Next
    B64EncPuro = StrConv(salida, vbUnicode)
End Function

Public Function B64DecPuro(ByRef s As String) As Variant
    Dim mapa(0 To 255) As Long, pot(0 To 7) As Long
    Dim src() As Byte, buf() As Byte
    Dim i As Long, j As Long, v As Long, acc As Long, bits As Long
    If Len(s) = 0 Then Err.Raise vbObjectError + 514, , "Imagen vacía en la respuesta"
    For i = 0 To 255
        mapa(i) = -1
    Next
    For i = 0 To 25
        mapa(65 + i) = i
        mapa(97 + i) = 26 + i
    Next
    For i = 0 To 9
        mapa(48 + i) = 52 + i
    Next
    mapa(43) = 62: mapa(47) = 63: mapa(45) = 62: mapa(95) = 63
    For i = 0 To 7
        pot(i) = 2 ^ i
    Next
    src = StrConv(s, vbFromUnicode)
    ReDim buf(0 To ((UBound(src) - LBound(src) + 1) \ 4) * 3 + 3)
    j = 0
    For i = LBound(src) To UBound(src)
        v = mapa(src(i))
        If v >= 0 Then
            acc = acc * 64 + v
            bits = bits + 6
            If bits >= 8 Then
                bits = bits - 8
                buf(j) = (acc \ pot(bits)) And 255
                j = j + 1
                acc = acc And (pot(bits) - 1)
            End If
        End If
    Next
    If j = 0 Then Err.Raise vbObjectError + 514, , "Imagen vacía en la respuesta"
    ReDim Preserve buf(0 To j - 1)
    B64DecPuro = buf
End Function

' ---------------------------------------------------------------- JSON

' Escapa un texto para JSON dejando solo caracteres ASCII (el resto como \uXXXX).
Public Function JsonEscapar(ByVal s As String) As String
    Dim i As Long, c As Long, ch As String, partes() As String
    If Len(s) = 0 Then Exit Function
    ReDim partes(1 To Len(s))
    For i = 1 To Len(s)
        ch = Mid$(s, i, 1)
        c = AscW(ch) And &HFFFF&
        Select Case c
            Case 34: partes(i) = "\"""
            Case 92: partes(i) = "\\"
            Case 10: partes(i) = "\n"
            Case 13: partes(i) = "\r"
            Case 9: partes(i) = "\t"
            Case 32 To 126: partes(i) = ch
            Case Else: partes(i) = "\u" & Right$("000" & Hex$(c), 4)
        End Select
    Next
    JsonEscapar = Join(partes, "")
End Function

Private Function HexALong(ByVal h As String) As Long
    Dim i As Long, d As Long, r As Long
    For i = 1 To Len(h)
        d = InStr(1, "0123456789ABCDEF", Mid$(h, i, 1), vbTextCompare) - 1
        If d < 0 Then Exit For
        r = r * 16 + d
    Next
    HexALong = r
End Function

' Devuelve el texto (sin escapes) del primer valor "clave": "..." a partir de la posicion desde.
Public Function JsonTexto(ByRef json As String, ByVal clave As String, Optional ByVal desde As Long = 1) As String
    Dim p As Long, n As Long, ch As String, res As String, e As String
    If desde < 1 Then desde = 1
    p = InStr(desde, json, """" & clave & """")
    If p = 0 Then Exit Function
    p = p + Len(clave) + 2
    n = Len(json)
    Do While p <= n
        ch = Mid$(json, p, 1)
        If ch = ":" Or ch = " " Or ch = vbTab Or ch = vbCr Or ch = vbLf Then
            p = p + 1
        Else
            Exit Do
        End If
    Loop
    If Mid$(json, p, 1) <> """" Then Exit Function
    p = p + 1
    Do While p <= n
        ch = Mid$(json, p, 1)
        If ch = "\" Then
            e = Mid$(json, p + 1, 1)
            Select Case e
                Case "n": res = res & vbLf
                Case "r": res = res & vbCr
                Case "t": res = res & vbTab
                Case "b", "f"
                Case "u"
                    res = res & ChrW(HexALong(Mid$(json, p + 2, 4)))
                    p = p + 4
                Case Else: res = res & e
            End Select
            p = p + 2
        ElseIf ch = """" Then
            Exit Do
        Else
            res = res & ch
            p = p + 1
        End If
        If Len(res) > 4000 Then Exit Do
    Loop
    JsonTexto = res
End Function

' Version rapida para valores enormes sin escapes (imagenes en Base64).
Public Function JsonCadenaRapida(ByRef json As String, ByVal clave As String, Optional ByVal desde As Long = 1) As String
    Dim p As Long, q As Long
    If desde < 1 Then desde = 1
    p = InStr(desde, json, """" & clave & """")
    If p = 0 Then Exit Function
    p = InStr(p + Len(clave) + 2, json, """")
    If p = 0 Then Exit Function
    q = InStr(p + 1, json, """")
    If q = 0 Then Exit Function
    JsonCadenaRapida = Replace(Mid$(json, p + 1, q - p - 1), "\/", "/")
End Function

' Ultima imagen (inlineData) de una respuesta de Gemini. Devuelve el Base64 y el tipo MIME.
Public Function UltimaImagenGemini(ByRef json As String, ByRef mime As String) As String
    Dim p As Long, ultimo As Long, claves As Variant, k As Variant
    claves = Array("inlineData", "inline_data")
    For Each k In claves
        p = InStr(1, json, """" & k & """")
        Do While p > 0
            If p > ultimo Then ultimo = p
            p = InStr(p + 1, json, """" & k & """")
        Loop
    Next
    If ultimo = 0 Then Exit Function
    mime = JsonTexto(json, "mimeType", ultimo)
    If mime = "" Then mime = JsonTexto(json, "mime_type", ultimo)
    UltimaImagenGemini = JsonCadenaRapida(json, "data", ultimo)
End Function

' ---------------------------------------------------------------- UTF-8 y bytes

Public Function Utf8Bytes(ByVal s As String) As Variant
    Dim buf() As Byte, i As Long, n As Long, c As Long, c2 As Long
    ReDim buf(0 To Len(s) * 4 + 3)
    i = 1
    Do While i <= Len(s)
        c = AscW(Mid$(s, i, 1)) And &HFFFF&
        If c >= &HD800& And c <= &HDBFF& And i < Len(s) Then
            c2 = AscW(Mid$(s, i + 1, 1)) And &HFFFF&
            If c2 >= &HDC00& And c2 <= &HDFFF& Then
                c = &H10000 + (c - &HD800&) * &H400& + (c2 - &HDC00&)
                i = i + 1
            End If
        End If
        If c < &H80& Then
            buf(n) = c
            n = n + 1
        ElseIf c < &H800& Then
            buf(n) = &HC0& Or (c \ &H40&)
            buf(n + 1) = &H80& Or (c And &H3F&)
            n = n + 2
        ElseIf c < &H10000 Then
            buf(n) = &HE0& Or (c \ &H1000&)
            buf(n + 1) = &H80& Or ((c \ &H40&) And &H3F&)
            buf(n + 2) = &H80& Or (c And &H3F&)
            n = n + 3
        Else
            buf(n) = &HF0& Or (c \ &H40000)
            buf(n + 1) = &H80& Or ((c \ &H1000&) And &H3F&)
            buf(n + 2) = &H80& Or ((c \ &H40&) And &H3F&)
            buf(n + 3) = &H80& Or (c And &H3F&)
            n = n + 4
        End If
        i = i + 1
    Loop
    If n = 0 Then n = 1
    ReDim Preserve buf(0 To n - 1)
    Utf8Bytes = buf
End Function

' Une varios Byte() (cada uno dentro de un Variant) en uno solo.
Public Function UnirBytes(ByRef partes As Variant) As Variant
    Dim total As Long, i As Long, j As Long, n As Long, t() As Byte, res() As Byte
    For i = LBound(partes) To UBound(partes)
        t = partes(i)
        total = total + UBound(t) - LBound(t) + 1
    Next
    ReDim res(0 To total - 1)
    For i = LBound(partes) To UBound(partes)
        t = partes(i)
        For j = LBound(t) To UBound(t)
            res(n) = t(j)
            n = n + 1
        Next
    Next
    UnirBytes = res
End Function

' ---------------------------------------------------------------- Mac

Public Function QS(ByVal s As String) As String
    QS = "'" & Replace(s, "'", "'\''") & "'"
End Function

Public Function AppleStr(ByVal s As String) As String
    AppleStr = """" & Replace(Replace(s, "\", "\\"), """", "\""") & """"
End Function
