'use strict';
// Errores que se le pueden enseñar al usuario tal cual, en lenguaje claro.
class UserError extends Error {
  constructor(message, code = 'failed') { super(message); this.code = code; this.user = true; }
}

// Traduce la salida de error de las herramientas a una explicación comprensible.
function explain(err, kind) {
  if (err && err.user) return err;
  const s = String((err && err.stderr) || (err && err.message) || '');
  const has = (re) => re.test(s);
  if (has(/password|encrypted|requires a password|Error: Password/i)) {
    return new UserError('El archivo está protegido con contraseña. Quítale la contraseña y vuelve a subirlo.', 'protected');
  }
  if (has(/No space left on device/i)) return new UserError('El servidor se ha quedado sin espacio temporal. Inténtalo de nuevo en unos minutos.', 'server');
  if (has(/Cannot allocate memory|out of memory|std::bad_alloc|heap exhausted/i)) {
    return new UserError('El archivo necesita más memoria de la que podemos dedicarle. Prueba con uno más pequeño.', 'toolarge');
  }
  if (kind === 'media') {
    if (has(/moov atom not found/)) return new UserError('El vídeo está incompleto o dañado (le falta el índice). Suele pasar con descargas o grabaciones cortadas.', 'corrupt');
    if (has(/Invalid data found when processing input|could not find codec parameters|Error while decoding|corrupt|Invalid NAL|EBML header parsing failed|Truncating packet|Packet corrupt|Header missing/i)) {
      return new UserError('El archivo está dañado o incompleto y no se puede leer.', 'corrupt');
    }
    if (has(/Decoder \(codec .*\) not found|Unknown decoder|unsupported codec|No decoder/i)) return new UserError('El archivo usa un códec que no podemos leer.', 'unsupported');
    if (has(/Output file .* does not contain any stream|does not contain any stream/i)) return new UserError('El archivo no contiene ninguna pista que se pueda convertir.', 'unsupported');
  }
  if (kind === 'pdf') {
    if (has(/not a PDF file|can't find PDF header|startxref|xref not found|Unrecoverable error|file is damaged|unable to find trailer|error: .*: (?:invalid|unable)/i)) {
      return new UserError('El PDF está dañado y no se puede leer.', 'corrupt');
    }
  }
  if (kind === 'image') {
    if (has(/unsupported image format|Input file contains unsupported image format/i)) return new UserError('Este tipo de imagen no está soportado.', 'unsupported');
    if (has(/Premature end|truncated|corrupt|Invalid|bad seek|not a known file format|VipsJpeg|vips_|pngload|Error while decoding|Could not decode|No decoder/i)) {
      return new UserError('La imagen está dañada o incompleta y no se puede leer.', 'corrupt');
    }
    if (has(/pixel limit|exceeds pixel limit/i)) return new UserError('La imagen es demasiado grande (más de 268 megapíxeles).', 'toolarge');
  }
  if (kind === 'pandoc') {
    if (has(/Unknown reader|Could not parse|JSON parse error|Error parsing|unexpected/i)) return new UserError('No hemos podido leer el documento: su contenido no es válido para su formato.', 'corrupt');
  }
  if (kind === 'subtitle') return new UserError('El archivo de subtítulos no tiene un formato válido.', 'corrupt');
  return null;
}

module.exports = { UserError, explain };
