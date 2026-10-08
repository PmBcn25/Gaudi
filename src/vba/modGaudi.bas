Option Explicit

' Acciones de los botones de la app (hojas PROYECTO, RESULTADO y AJUSTES).

Private Const F_ORIGINAL As String = "gaudiFotoOriginal"
Private Const F_ANTES As String = "gaudiAntes"
Private Const F_DESPUES As String = "gaudiDespues"

' ================================================================ 1. Foto original

Public Sub CargarFoto()
    Dim ruta As String
    On Error GoTo Fallo
    ruta = ElegirImagen("Selecciona la foto del piso o de la estancia a reformar")
    If ruta = "" Then Exit Sub
    If Not ExtensionValida(ruta) Then
        MsgBox "Formato no admitido. Usa una foto JPG, PNG, WEBP o HEIC.", vbExclamation, Titulo()
        Exit Sub
    End If
    Escribir "FotoRuta", ruta
    Escribir "FotoNombre", NombreArchivo(ruta)
    MostrarImagen Rg("CajaOriginal"), ruta, F_ORIGINAL
    MostrarImagen Rg("CajaAntes"), ruta, F_ANTES
    QuitarImagen Rg("CajaDespues"), F_DESPUES
    Estado "Foto cargada. Elige las reformas y pulsa GENERAR IMAGEN."
    Exit Sub
Fallo:
    MsgBox "No se pudo cargar la foto." & vbLf & Err.Description, vbExclamation, Titulo()
End Sub

Private Function ElegirImagen(ByVal tituloDialogo As String) As String
    Dim f As Variant
    If EsMac() Then
        f = Application.GetOpenFilename()
    Else
        f = Application.GetOpenFilename("Fotos (*.jpg;*.jpeg;*.png;*.webp;*.heic)," & _
            "*.jpg;*.jpeg;*.png;*.webp;*.heic,Todos los archivos (*.*),*.*", 1, tituloDialogo)
    End If
    If VarType(f) = vbBoolean Then
        ElegirImagen = ""
    Else
        ElegirImagen = CStr(f)
    End If
End Function

' Inserta una imagen (incrustada) ajustada y centrada dentro de un rango.
Public Sub MostrarImagen(ByVal caja As Range, ByVal ruta As String, ByVal nombre As String)
    Dim ws As Worksheet, shp As Shape, k As Double, estaba As Boolean
    Set ws = caja.Worksheet
    QuitarImagen caja, nombre
    estaba = Desproteger(ws)
    On Error GoTo Fallo
    Set shp = ws.Shapes.AddPicture(ruta, 0, -1, caja.Left, caja.Top, -1, -1)
    shp.Name = nombre
    shp.LockAspectRatio = -1
    k = caja.Width / shp.Width
    If caja.Height / shp.Height < k Then k = caja.Height / shp.Height
    shp.Width = shp.Width * k
    shp.Left = caja.Left + (caja.Width - shp.Width) / 2
    shp.Top = caja.Top + (caja.Height - shp.Height) / 2
    shp.Placement = xlMove
    Reproteger ws, estaba
    Exit Sub
Fallo:
    Reproteger ws, estaba
    Estado "Vista previa no disponible para ." & Extension(ruta) & " en este equipo (la foto se usará igualmente)."
End Sub

Public Sub QuitarImagen(ByVal caja As Range, ByVal nombre As String)
    Dim ws As Worksheet, estaba As Boolean
    Set ws = caja.Worksheet
    estaba = Desproteger(ws)
    On Error Resume Next
    ws.Shapes(nombre).Delete
    On Error GoTo 0
    Reproteger ws, estaba
End Sub

Private Sub Estado(ByVal texto As String)
    Escribir "EstadoApp", texto
End Sub

' ================================================================ 2. Generar con IA

Public Sub GenerarImagen()
    Dim ruta As String, motor As String, clave As String, modelo As String, prompt As String
    Dim salida() As Byte, ext As String, msg As String, destino As String
    Dim t0 As Single, seg As Long, ok As Boolean
    On Error GoTo Fallo

    ruta = Valor("FotoRuta")
    If ruta = "" Then
        MsgBox "Primero carga la foto original con el botón CARGAR FOTO.", vbInformation, Titulo()
        Exit Sub
    End If
    If Not ExisteArchivo(ruta) Then
        MsgBox "No encuentro la foto original:" & vbLf & ruta & vbLf & vbLf & "Vuelve a cargarla con CARGAR FOTO.", _
               vbExclamation, Titulo()
        Exit Sub
    End If
    If TamanoArchivo(ruta) > MAX_MB_FOTO * 1048576 Then
        MsgBox "La foto pesa más de " & MAX_MB_FOTO & " MB. Usa una versión más ligera (por ejemplo, " & _
               "envíatela por WhatsApp o redúcela a 2000-3000 px de ancho).", vbExclamation, Titulo()
        Exit Sub
    End If

    motor = MotorActual()
    clave = LeerClave(motor)
    If clave = "" Then
        If MsgBox("No hay ninguna clave API de " & motor & " guardada en este equipo." & vbLf & vbLf & _
                  "¿Quieres introducirla ahora?" & vbLf & _
                  "(Si no tienes clave, usa el botón COPIAR PROMPT + GEMINI: es gratis y no necesita clave.)", _
                  vbYesNo + vbQuestion, Titulo()) = vbYes Then
            PedirClave motor
            clave = LeerClave(motor)
        End If
        If clave = "" Then Exit Sub
    End If

    modelo = ModeloActual(motor)
    prompt = Valor("PromptIA")
    Estado "Generando imagen con " & motor & " (" & modelo & ")... puede tardar 1-2 minutos."
    Application.Cursor = xlWait
    DoEvents
    t0 = Timer
    ok = GenerarConIA(motor, clave, modelo, prompt, ruta, salida, ext, msg)
    seg = Segundos(t0)
    Application.Cursor = xlDefault
    Application.StatusBar = False

    If Not ok Then
        Estado "No se pudo generar la imagen. " & Left$(Replace(msg, vbLf, " "), 180)
        RegistrarHistorial "", motor & " / " & modelo, seg, "Error"
        MsgBox msg, vbExclamation, Titulo()
        Exit Sub
    End If

    destino = CarpetaSalida() & Application.PathSeparator & NombreSeguro(Valor("ProyNombre")) & "_" & _
              Format$(Now, "yyyymmdd_hhnnss") & "." & ext
    EscribirBytes destino, salida
    MostrarResultado ruta, destino, motor & " · " & modelo
    RegistrarHistorial destino, motor & " / " & modelo, seg, "OK"
    Estado "Imagen generada en " & seg & " s y guardada en: " & destino
    IrAResultado
    Exit Sub

Fallo:
    Application.Cursor = xlDefault
    Application.StatusBar = False
    MsgBox "Error inesperado: " & Err.Description, vbCritical, Titulo()
End Sub

' Mismo proceso, pensado para el botón de la hoja RESULTADO.
Public Sub GenerarOtraVersion()
    GenerarImagen
End Sub

Private Sub MostrarResultado(ByVal original As String, ByVal render As String, ByVal origenTxt As String)
    If ExisteArchivo(original) Then MostrarImagen Rg("CajaAntes"), original, F_ANTES
    MostrarImagen Rg("CajaDespues"), render, F_DESPUES
    Escribir "ResFecha", Format$(Now, "dd/mm/yyyy hh:nn")
    Escribir "ResMotor", origenTxt
    Escribir "ResResumen", Valor("ResumenES")
    EscribirEnlace "ResArchivo", render, NombreArchivo(render)
End Sub

Private Sub RegistrarHistorial(ByVal archivo As String, ByVal motor As String, ByVal segundos As Long, _
                               ByVal resultado As String)
    Dim ws As Worksheet, cab As Range, fila As Long, c As Long, estaba As Boolean
    Set cab = Rg("HistCabecera")
    Set ws = cab.Worksheet
    c = cab.Column
    estaba = Desproteger(ws)
    fila = ws.Cells(ws.Rows.Count, c).End(xlUp).Row + 1
    If fila <= cab.Row Then fila = cab.Row + 1
    ws.Cells(fila, c).Value = fila - cab.Row
    ws.Cells(fila, c + 1).Value = Format$(Now, "dd/mm/yyyy hh:nn")
    ws.Cells(fila, c + 2).Value = Valor("ProyNombre")
    ws.Cells(fila, c + 3).Value = Valor("ProyEstancia")
    ws.Cells(fila, c + 4).Value = Valor("ProyTipo")
    ws.Cells(fila, c + 5).Value = Valor("ProyEstilo")
    ws.Cells(fila, c + 6).Value = Valor("FmtProporcion")
    ws.Cells(fila, c + 7).Value = motor
    ws.Cells(fila, c + 8).Value = segundos
    ws.Cells(fila, c + 9).Value = resultado
    If archivo <> "" Then
        ws.Hyperlinks.Add Anchor:=ws.Cells(fila, c + 10), Address:=archivo, TextToDisplay:=NombreArchivo(archivo)
    End If
    ws.Cells(fila, c + 11).Value = Replace(Valor("ResumenES"), vbLf, " · ")
    Reproteger ws, estaba
End Sub

' ================================================================ 3. Modo asistido (sin clave API)

Public Sub CopiarPromptGemini()
    CopiarPromptYAbrir "https://gemini.google.com/app", "Gemini"
End Sub

Public Sub CopiarPromptChatGPT()
    CopiarPromptYAbrir "https://chatgpt.com/", "ChatGPT"
End Sub

Private Sub CopiarPromptYAbrir(ByVal url As String, ByVal servicio As String)
    Dim copiado As Boolean, aviso As String
    copiado = CopiarAlPortapapeles(Valor("PromptIA"))
    If copiado Then
        aviso = "Prompt copiado al portapapeles."
    Else
        aviso = "Copia el prompt a mano: selecciona la celda PROMPT de la sección 7 y pulsa Ctrl+C."
        Rg("PromptIA").Worksheet.Activate
        Rg("PromptIA").Select
    End If
    On Error Resume Next
    ThisWorkbook.FollowHyperlink url
    On Error GoTo 0
    MsgBox aviso & vbLf & vbLf & _
           "En " & servicio & ":" & vbLf & _
           "  1) Adjunta la foto original (botón +)." & vbLf & _
           "  2) Pega el prompt (Ctrl+V) y envía." & vbLf & _
           "  3) Descarga la imagen generada." & vbLf & vbLf & _
           "Después pulsa IMPORTAR RESULTADO para verla aquí junto a la original y guardarla en el historial.", _
           vbInformation, Titulo()
End Sub

Private Function CopiarAlPortapapeles(ByVal texto As String) As Boolean
    On Error GoTo Alternativa
    If EsMac() Then
        MacScript "set the clipboard to " & AppleStr(texto)
        CopiarAlPortapapeles = True
        Exit Function
    End If
    With CreateObject("new:{1C3B4210-F441-11CE-B9EA-00AA006B1A69}")
        .SetText texto
        .PutInClipboard
    End With
    CopiarAlPortapapeles = True
    Exit Function
Alternativa:
    Resume Alternativa2
Alternativa2:
    On Error GoTo Fallo
    CreateObject("htmlfile").parentWindow.clipboardData.setData "Text", texto
    CopiarAlPortapapeles = True
    Exit Function
Fallo:
    CopiarAlPortapapeles = False
End Function

Public Sub ImportarResultado()
    Dim f As String, destino As String, original As String
    On Error GoTo Fallo
    f = ElegirImagen("Selecciona la imagen reformada que has descargado de Gemini o ChatGPT")
    If f = "" Then Exit Sub
    If Not ExtensionValida(f) Then
        MsgBox "Formato no admitido. Usa JPG, PNG o WEBP.", vbExclamation, Titulo()
        Exit Sub
    End If
    destino = CarpetaSalida() & Application.PathSeparator & NombreSeguro(Valor("ProyNombre")) & "_importada_" & _
              Format$(Now, "yyyymmdd_hhnnss") & "." & Extension(f)
    On Error Resume Next
    FileCopy f, destino
    If Err.Number <> 0 Then destino = f
    On Error GoTo Fallo
    original = Valor("FotoRuta")
    MostrarResultado original, destino, "Importada (Gemini / ChatGPT web)"
    RegistrarHistorial destino, "Web (modo asistido)", 0, "Importada"
    Estado "Resultado importado y guardado en: " & destino
    IrAResultado
    Exit Sub
Fallo:
    MsgBox "No se pudo importar la imagen." & vbLf & Err.Description, vbExclamation, Titulo()
End Sub

' ================================================================ 4. Proyecto y carpeta

Public Sub NuevoProyecto()
    If MsgBox("¿Empezar un proyecto nuevo?" & vbLf & vbLf & _
              "Se quitan la foto y el resultado de la pantalla. Las imágenes guardadas y el HISTORIAL se conservan.", _
              vbYesNo + vbQuestion, Titulo()) <> vbYes Then Exit Sub
    Escribir "FotoRuta", ""
    Escribir "FotoNombre", "(ninguna: pulsa CARGAR FOTO)"
    Escribir "ProyNombre", "Nuevo proyecto"
    QuitarImagen Rg("CajaOriginal"), F_ORIGINAL
    QuitarImagen Rg("CajaAntes"), F_ANTES
    QuitarImagen Rg("CajaDespues"), F_DESPUES
    Escribir "ResFecha", ""
    Escribir "ResMotor", ""
    Escribir "ResResumen", ""
    EscribirEnlace "ResArchivo", "", ""
    Estado "Proyecto nuevo. Escribe el nombre y carga una foto."
    IrAProyecto
End Sub

Public Sub AbrirCarpetaResultados()
    Dim c As String
    On Error GoTo Fallo
    c = CarpetaSalida()
    If EsMac() Then
        MacScript "tell application ""Finder"" to open (POSIX file " & AppleStr(c) & ")"
    Else
        Shell "explorer.exe """ & c & """", vbNormalFocus
    End If
    Exit Sub
Fallo:
    MsgBox "Las imágenes se guardan en:" & vbLf & c, vbInformation, Titulo()
End Sub

' ================================================================ 5. Claves API (AJUSTES)

Public Sub ConfigurarClaveGemini()
    PedirClave "Gemini"
End Sub

Public Sub ConfigurarClaveOpenAI()
    PedirClave "OpenAI"
End Sub

Public Sub PedirClave(ByVal motor As String)
    Dim k As String, url As String
    If motor = "OpenAI" Then
        url = "https://platform.openai.com/api-keys"
    Else
        url = "https://aistudio.google.com/apikey"
    End If
    k = InputBox("Pega tu clave API de " & motor & ":" & vbLf & vbLf & _
                 "Se guarda SOLO en este equipo, no dentro del Excel: puedes compartir el archivo sin compartir tu clave." & _
                 vbLf & vbLf & "¿No tienes clave? Consíguela en:" & vbLf & url, Titulo() & " · Clave " & motor)
    k = Trim$(k)
    If k = "" Then Exit Sub
    GuardarClave motor, k
    ActualizarEstadoClaves
    MsgBox "Clave de " & motor & " guardada en este equipo." & vbLf & _
           "Pulsa PROBAR CONEXIÓN para comprobar que funciona.", vbInformation, Titulo()
End Sub

Public Sub BorrarClaves()
    If MsgBox("¿Borrar de este equipo las claves API de Gemini y OpenAI?", vbYesNo + vbQuestion, Titulo()) <> vbYes Then Exit Sub
    BorrarClave "Gemini"
    BorrarClave "OpenAI"
    ActualizarEstadoClaves
End Sub

Public Sub ActualizarEstadoClaves()
    Escribir "EstadoClaveGemini", DescribirClave("Gemini")
    Escribir "EstadoClaveOpenAI", DescribirClave("OpenAI")
End Sub

Private Function DescribirClave(ByVal motor As String) As String
    Dim k As String
    k = LeerClave(motor)
    If k = "" Then
        DescribirClave = "No configurada en este equipo"
    ElseIf Len(k) > 10 Then
        DescribirClave = "Guardada en este equipo (" & Left$(k, 4) & "..." & Right$(k, 4) & ")"
    Else
        DescribirClave = "Guardada en este equipo"
    End If
End Function

Public Sub ProbarConexion()
    Dim motor As String, clave As String, msg As String, ok As Boolean
    motor = MotorActual()
    clave = LeerClave(motor)
    If clave = "" Then
        MsgBox "Primero guarda tu clave API de " & motor & " (botón GUARDAR CLAVE).", vbInformation, Titulo()
        Exit Sub
    End If
    Application.Cursor = xlWait
    ok = ProbarClave(motor, clave, ModeloActual(motor), msg)
    Application.Cursor = xlDefault
    Application.StatusBar = False
    ActualizarEstadoClaves
    If ok Then
        MsgBox msg, vbInformation, Titulo()
    Else
        MsgBox msg, vbExclamation, Titulo()
    End If
End Sub

' ================================================================ 6. Navegación

Public Sub IrAInicio()
    ThisWorkbook.Worksheets("INICIO").Activate
End Sub

Public Sub IrAProyecto()
    Rg("ProyNombre").Worksheet.Activate
End Sub

Public Sub IrAResultado()
    Rg("CajaDespues").Worksheet.Activate
    ActiveWindow.ScrollRow = 1
    ActiveWindow.ScrollColumn = 1
End Sub

Public Sub IrAAjustes()
    Rg("CfgMotor").Worksheet.Activate
End Sub
