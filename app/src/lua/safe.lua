-- Filtro de seguridad para Pandoc (sustituye a --sandbox, que falla en Pandoc 3.1.x).
-- Solo deja pasar imágenes que estén dentro del propio documento (mediabag) o que sean
-- rutas relativas sencillas que existan en la carpeta de trabajo (que está vacía).
-- Todo lo demás (rutas absolutas, "..", esquemas http:/file:/data:, archivos que no
-- existen) se sustituye por su texto alternativo. Así el escritor PPTX tampoco aborta
-- por imágenes que faltan.

local function exists(p)
  local f = io.open(p, "rb")
  if f then f:close() return true end
  return false
end

local function safe_src(src)
  if src == nil or src == "" then return false end
  if pandoc.mediabag.lookup(src) ~= nil then return true end
  if src:match("^%a[%w+.-]*:") then return false end        -- http:, file:, data:, C:…
  if src:sub(1, 1) == "/" or src:sub(1, 1) == "\\" then return false end
  if src:find("%.%.") then return false end
  if src:find("[%z\1-\31]") then return false end
  return exists(src)
end

local function alt_text(img)
  local txt = pandoc.utils.stringify(img.caption or img.title or "")
  if txt == "" then txt = img.title or "" end
  if txt == "" then return {} end
  return pandoc.Emph(pandoc.Str("[" .. txt .. "]"))
end

function Image(img)
  if safe_src(img.src) then return nil end
  return alt_text(img)
end

-- Bloques en bruto (HTML/LaTeX) que pueden hacer que un escritor lea archivos o
-- descargue recursos: fuera.
local risky = { "src%s*=", "href%s*=", "url%s*%(", "@import", "\\input", "\\include", "<link", "<object", "<embed", "<iframe", "<script" }
local function raw(el)
  local t = el.text:lower()
  for _, pat in ipairs(risky) do
    if t:find(pat) then return {} end
  end
  return nil
end
RawInline = raw
RawBlock = raw
