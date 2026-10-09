Option Explicit

' Motor de IA: envia la foto original + las especificaciones y recibe la imagen reformada.
'   - Google Gemini  : POST models/{modelo}:generateContent (JSON con la foto en Base64)
'   - OpenAI         : POST images/edits (multipart/form-data)
' Windows usa WinHTTP (con alternativa MSXML2.XMLHTTP); Mac usa curl (experimental).

Private Const URL_GEMINI As String = "https://generativelanguage.googleapis.com/v1beta/models/"
Private Const URL_OPENAI As String = "https://api.openai.com/v1/"
Private Const APP_REG As String = "GaudiReformas"
Public Const MAX_SEGUNDOS As Long = 300
Public Const MAX_MB_FOTO As Long = 15

' ---------------------------------------------------------------- Ajustes

Public Function MotorActual() As String
    If InStr(1, Valor("CfgMotor"), "OpenAI", vbTextCompare) > 0 Then
        MotorActual = "OpenAI"
    Else
        MotorActual = "Gemini"
    End If
End Function

Public Function ModeloActual(ByVal motor As String) As String
    Dim m As String
    If motor = "OpenAI" Then
        m = Valor("CfgModeloOpenAI")
        If m = "" Then m = "gpt-image-1.5"
    Else
        m = Valor("CfgModeloGemini")
        If m = "" Then m = "gemini-3.1-flash-image"
    End If
    ModeloActual = Replace(m, " ", "")
End Function

Public Function LeerClave(ByVal motor As String) As String
    LeerClave = Trim$(GetSetting(APP_REG, "API", motor, ""))
End Function

Public Sub GuardarClave(ByVal motor As String, ByVal clave As String)
    SaveSetting APP_REG, "API", motor, Trim$(clave)
End Sub

Public Sub BorrarClave(ByVal motor As String)
    On Error Resume Next
    DeleteSetting APP_REG, "API", motor
End Sub

' ---------------------------------------------------------------- Generacion

Public Function GenerarConIA(ByVal motor As String, ByVal clave As String, ByVal modelo As String, _
                             ByVal prompt As String, ByVal rutaFoto As String, _
                             ByRef salida() As Byte, ByRef ext As String, ByRef msg As String) As Boolean
    If motor = "OpenAI" Then
        GenerarConIA = GenerarOpenAI(clave, modelo, prompt, rutaFoto, Valor("CodProporcion"), _
                                     Valor("CodCalidadOpenAI"), salida, ext, msg)
    Else
        GenerarConIA = GenerarGemini(clave, modelo, prompt, rutaFoto, Valor("CodProporcion"), _
                                     Valor("CodResolucion"), salida, ext, msg)
    End If
End Function

Private Function GenerarGemini(ByVal clave As String, ByVal modelo As String, ByVal prompt As String, _
                               ByVal rutaFoto As String, ByVal proporcion As String, ByVal resolucion As String, _
                               ByRef salida() As Byte, ByRef ext As String, ByRef msg As String) As Boolean
    Dim foto() As Byte, datos() As Byte, estado As Long, resp As String, b64 As String, mime As String

    foto = LeerBytes(rutaFoto)
    b64 = Base64Codificar(foto)
    Erase foto
    datos = StrConv(CuerpoGemini(prompt, MimeDeArchivo(rutaFoto), b64, proporcion, resolucion, modelo), vbFromUnicode)
    b64 = ""

    If Not EnviarHttp("POST", URL_GEMINI & modelo & ":generateContent", _
                      Array("Content-Type: application/json", "x-goog-api-key: " & clave), _
                      datos, True, estado, resp, msg) Then Exit Function
    If estado <> 200 Then
        msg = ExplicarError("Gemini", estado, resp)
        Exit Function
    End If

    b64 = UltimaImagenGemini(resp, mime)
    If b64 = "" Then
        msg = "Gemini ha respondido pero sin imagen." & MotivoSinImagen(resp) & vbLf & vbLf & _
              "Prueba a generar de nuevo, cambia alguna opción o simplifica las notas."
        Exit Function
    End If
    salida = Base64Decodificar(b64)
    If InStr(1, mime, "jpeg", vbTextCompare) > 0 Or InStr(1, mime, "jpg", vbTextCompare) > 0 Then
        ext = "jpg"
    Else
        ext = "png"
    End If
    GenerarGemini = True
End Function

Private Function GenerarOpenAI(ByVal clave As String, ByVal modelo As String, ByVal prompt As String, _
                               ByVal rutaFoto As String, ByVal proporcion As String, ByVal calidad As String, _
                               ByRef salida() As Byte, ByRef ext As String, ByRef msg As String) As Boolean
    Dim cuerpo() As Byte, limite As String, foto() As Byte
    Dim estado As Long, resp As String, b64 As String

    Select Case Extension(rutaFoto)
        Case "heic", "heif"
            msg = "OpenAI no admite fotos HEIC. Guarda la foto como JPG o PNG, o usa el motor Gemini en AJUSTES."
            Exit Function
    End Select

    limite = "----GaudiFormBoundary" & Format$(Now, "yyyymmddhhnnss")
    foto = LeerBytes(rutaFoto)
    cuerpo = CuerpoOpenAI(modelo, prompt, proporcion, calidad, "foto." & Extension(rutaFoto), _
                          MimeDeArchivo(rutaFoto), foto, limite)
    Erase foto

    If Not EnviarHttp("POST", URL_OPENAI & "images/edits", _
                      Array("Content-Type: multipart/form-data; boundary=" & limite, "Authorization: Bearer " & clave), _
                      cuerpo, True, estado, resp, msg) Then Exit Function
    If estado <> 200 Then
        msg = ExplicarError("OpenAI", estado, resp)
        Exit Function
    End If

    b64 = JsonCadenaRapida(resp, "b64_json")
    If b64 = "" Then
        msg = "OpenAI ha respondido pero sin imagen." & vbLf & Left$(resp, 300)
        Exit Function
    End If
    salida = Base64Decodificar(b64)
    ext = "png"
    GenerarOpenAI = True
End Function

' Cuerpo JSON de la peticion a Gemini (solo ASCII: el texto va escapado como \uXXXX).
Public Function CuerpoGemini(ByVal prompt As String, ByVal mime As String, ByRef b64 As String, _
                             ByVal proporcion As String, ByVal resolucion As String, ByVal modelo As String) As String
    Dim cfg As String, img As String
    cfg = """responseModalities"":[""TEXT"",""IMAGE""]"
    If proporcion <> "" And proporcion <> "auto" Then img = """aspectRatio"":""" & proporcion & """"
    If resolucion <> "" And InStr(1, modelo, "2.5", vbTextCompare) = 0 Then
        If img <> "" Then img = img & ","
        img = img & """imageSize"":""" & resolucion & """"
    End If
    If img <> "" Then cfg = cfg & ",""imageConfig"":{" & img & "}"
    CuerpoGemini = "{""contents"":[{""role"":""user"",""parts"":[" & _
                   "{""text"":""" & JsonEscapar(prompt) & """}," & _
                   "{""inline_data"":{""mime_type"":""" & mime & """,""data"":""" & b64 & """}}" & _
                   "]}],""generationConfig"":{" & cfg & "}}"
End Function

' Cuerpo multipart/form-data de la peticion a OpenAI (images/edits). Devuelve un Byte().
Public Function CuerpoOpenAI(ByVal modelo As String, ByVal prompt As String, ByVal proporcion As String, _
                             ByVal calidad As String, ByVal nombreFoto As String, ByVal mime As String, _
                             ByRef foto() As Byte, ByVal limite As String) As Variant
    Dim campos As String, partes(0 To 2) As Variant
    campos = CampoTexto(limite, "model", modelo) & CampoTexto(limite, "prompt", prompt) & _
             CampoTexto(limite, "size", TamanoOpenAI(proporcion))
    If calidad <> "" Then campos = campos & CampoTexto(limite, "quality", calidad)
    If modelo = "gpt-image-1" Or Left$(modelo, 13) = "gpt-image-1.5" Then
        campos = campos & CampoTexto(limite, "input_fidelity", "high")
    End If
    campos = campos & CampoTexto(limite, "n", "1") & _
             "--" & limite & vbCrLf & _
             "Content-Disposition: form-data; name=""image[]""; filename=""" & nombreFoto & """" & vbCrLf & _
             "Content-Type: " & mime & vbCrLf & vbCrLf
    partes(0) = Utf8Bytes(campos)
    partes(1) = foto
    partes(2) = Utf8Bytes(vbCrLf & "--" & limite & "--" & vbCrLf)
    CuerpoOpenAI = UnirBytes(partes)
End Function

Private Function CampoTexto(ByVal limite As String, ByVal nombre As String, ByVal contenido As String) As String
    CampoTexto = "--" & limite & vbCrLf & _
                 "Content-Disposition: form-data; name=""" & nombre & """" & vbCrLf & vbCrLf & _
                 contenido & vbCrLf
End Function

Private Function TamanoOpenAI(ByVal proporcion As String) As String
    Select Case proporcion
        Case "16:9", "4:3", "3:2", "21:9", "5:4": TamanoOpenAI = "1536x1024"
        Case "1:1": TamanoOpenAI = "1024x1024"
        Case "9:16", "3:4", "2:3", "4:5": TamanoOpenAI = "1024x1536"
        Case Else: TamanoOpenAI = "auto"
    End Select
End Function

' ---------------------------------------------------------------- Prueba de la clave

Public Function ProbarClave(ByVal motor As String, ByVal clave As String, ByVal modelo As String, _
                            ByRef msg As String) As Boolean
    Dim url As String, cab As Variant, estado As Long, resp As String, vacio() As Byte
    If motor = "OpenAI" Then
        url = URL_OPENAI & "models/" & modelo
        cab = Array("Authorization: Bearer " & clave)
    Else
        url = URL_GEMINI & modelo
        cab = Array("x-goog-api-key: " & clave)
    End If
    If Not EnviarHttp("GET", url, cab, vacio, False, estado, resp, msg) Then Exit Function
    If estado = 200 Then
        msg = "Conexión correcta." & vbLf & "La clave de " & motor & " funciona y el modelo """ & modelo & """ está disponible."
        ProbarClave = True
    Else
        msg = ExplicarError(motor, estado, resp)
    End If
End Function

' ---------------------------------------------------------------- Errores

Private Function ExplicarError(ByVal motor As String, ByVal estado As Long, ByRef resp As String) As String
    Dim detalle As String, consejo As String
    detalle = JsonTexto(resp, "message")
    If detalle = "" Then detalle = Left$(resp, 300)
    Select Case estado
        Case 400
            consejo = "Petición rechazada. Revisa el modelo en AJUSTES, prueba otra proporción o usa una foto JPG/PNG."
        Case 401, 403
            consejo = "La clave API no es válida o no tiene permiso para este modelo. Vuelve a guardarla en AJUSTES."
        Case 404
            consejo = "El modelo indicado en AJUSTES no existe o ya no está disponible. Elige otro de la lista."
        Case 413
            consejo = "La foto es demasiado pesada. Usa una versión más ligera (menos de 7 MB)."
        Case 429
            consejo = "Se ha alcanzado el límite de uso o la cuota de la cuenta. Espera unos minutos o revisa la facturación."
        Case Is >= 500
            consejo = "El servicio de IA está saturado o en mantenimiento. Inténtalo de nuevo en unos minutos."
    End Select
    ExplicarError = motor & " ha devuelto el error " & estado & "." & vbLf & consejo & vbLf & vbLf & _
                    "Detalle técnico: " & Left$(detalle, 400)
End Function

Private Function MotivoSinImagen(ByRef resp As String) As String
    Dim r As String, t As String
    t = JsonTexto(resp, "finishReason")
    If t <> "" Then r = r & vbLf & "Motivo: " & t
    t = JsonTexto(resp, "blockReason")
    If t <> "" Then r = r & vbLf & "Bloqueo: " & t
    t = JsonTexto(resp, "text")
    If t <> "" Then r = r & vbLf & "Respuesta del modelo: " & Left$(t, 400)
    MotivoSinImagen = r
End Function

' ---------------------------------------------------------------- HTTP

Public Function EnviarHttp(ByVal metodo As String, ByVal url As String, ByVal cabeceras As Variant, _
                           ByRef cuerpo() As Byte, ByVal conCuerpo As Boolean, _
                           ByRef estado As Long, ByRef resp As String, ByRef msg As String) As Boolean
    Dim t0 As Single, msg1 As String
    If EsMac() Then
        EnviarHttp = HttpMac(metodo, url, cabeceras, cuerpo, conCuerpo, estado, resp, msg)
        Exit Function
    End If
    t0 = Timer
    If HttpWindows(metodo, url, cabeceras, cuerpo, conCuerpo, estado, resp, msg1) Then
        EnviarHttp = True
        Exit Function
    End If
    ' Segundo intento con el componente que respeta el proxy del sistema
    If Segundos(t0) < 60 Then
        If HttpXml(metodo, url, cabeceras, cuerpo, conCuerpo, estado, resp, msg) Then
            EnviarHttp = True
            Exit Function
        End If
    End If
    msg = "No se pudo conectar con el servicio de IA." & vbLf & _
          "Comprueba la conexión a Internet (o el proxy/cortafuegos de tu empresa)." & vbLf & vbLf & _
          "Detalle: " & msg1
End Function

Private Sub PonerCabeceras(ByVal http As Object, ByVal cabeceras As Variant)
    Dim i As Long, p As Long, h As String
    For i = LBound(cabeceras) To UBound(cabeceras)
        h = CStr(cabeceras(i))
        p = InStr(h, ":")
        http.setRequestHeader Left$(h, p - 1), Trim$(Mid$(h, p + 1))
    Next
End Sub

Private Function HttpWindows(ByVal metodo As String, ByVal url As String, ByVal cabeceras As Variant, _
                             ByRef cuerpo() As Byte, ByVal conCuerpo As Boolean, _
                             ByRef estado As Long, ByRef resp As String, ByRef msg As String) As Boolean
    Dim http As Object, t0 As Single
    On Error GoTo Fallo
    Set http = CreateObject("WinHttp.WinHttpRequest.5.1")
    http.Open metodo, url, True
    http.SetTimeouts 30000, 30000, 120000, MAX_SEGUNDOS * 1000&
    PonerCabeceras http, cabeceras
    If conCuerpo Then
        http.Send cuerpo
    Else
        http.Send
    End If
    t0 = Timer
    Do While Not http.WaitForResponse(1)
        DoEvents
        Progreso Segundos(t0)
        If Segundos(t0) > MAX_SEGUNDOS Then
            http.Abort
            msg = "La IA ha tardado más de " & MAX_SEGUNDOS & " segundos en responder."
            Exit Function
        End If
    Loop
    estado = http.Status
    resp = http.ResponseText
    HttpWindows = True
    Exit Function
Fallo:
    msg = Err.Description
End Function

Private Function HttpXml(ByVal metodo As String, ByVal url As String, ByVal cabeceras As Variant, _
                         ByRef cuerpo() As Byte, ByVal conCuerpo As Boolean, _
                         ByRef estado As Long, ByRef resp As String, ByRef msg As String) As Boolean
    Dim http As Object, t0 As Single
    On Error GoTo Fallo
    Set http = CreateObject("MSXML2.XMLHTTP.6.0")
    http.Open metodo, url, True
    PonerCabeceras http, cabeceras
    If conCuerpo Then
        http.Send cuerpo
    Else
        http.Send
    End If
    t0 = Timer
    Do While http.readyState <> 4
        DoEvents
        Progreso Segundos(t0)
        If Segundos(t0) > MAX_SEGUNDOS Then
            http.abort
            msg = "La IA ha tardado más de " & MAX_SEGUNDOS & " segundos en responder."
            Exit Function
        End If
    Loop
    estado = http.Status
    resp = http.responseText
    HttpXml = True
    Exit Function
Fallo:
    msg = Err.Description
End Function

Private Function HttpMac(ByVal metodo As String, ByVal url As String, ByVal cabeceras As Variant, _
                         ByRef cuerpo() As Byte, ByVal conCuerpo As Boolean, _
                         ByRef estado As Long, ByRef resp As String, ByRef msg As String) As Boolean
    Dim tmp As String, fIn As String, fOut As String, cmd As String, r As String, i As Long
    Dim b() As Byte
    On Error GoTo Fallo
    tmp = CarpetaTemporal()
    fIn = tmp & "gaudi_peticion.bin"
    fOut = tmp & "gaudi_respuesta.txt"
    BorrarArchivo fOut
    cmd = "curl -sS -m " & MAX_SEGUNDOS & " -X " & metodo & " " & QS(url)
    For i = LBound(cabeceras) To UBound(cabeceras)
        cmd = cmd & " -H " & QS(CStr(cabeceras(i)))
    Next
    If conCuerpo Then
        EscribirBytes fIn, cuerpo
        cmd = cmd & " --data-binary @" & QS(fIn)
    End If
    cmd = cmd & " -o " & QS(fOut) & " -w " & QS("%{http_code}")
    Progreso 0
    r = MacScript("do shell script " & AppleStr(cmd))
    estado = CLng(Val(r))
    If TamanoArchivo(fOut) > 0 Then
        b = LeerBytes(fOut)
        resp = StrConv(b, vbUnicode)
    End If
    BorrarArchivo fIn
    BorrarArchivo fOut
    If estado = 0 Then
        msg = "No se pudo conectar con el servicio de IA (curl: " & r & ")."
        Exit Function
    End If
    HttpMac = True
    Exit Function
Fallo:
    msg = "En Mac, la generación automática necesita que Excel pueda ejecutar 'curl' (" & Err.Description & ")." & vbLf & _
          "Usa el modo asistido: botón COPIAR PROMPT + GEMINI."
End Function

Private Sub Progreso(ByVal seg As Long)
    Application.StatusBar = "Gaudí · Generando con IA... " & seg & " s  (puede tardar 1-2 minutos, no cierres Excel)"
End Sub
