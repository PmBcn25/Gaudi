"""Genera un vbaProject.bin (proyecto VBA de Excel) a partir de codigo fuente.

Implementa lo minimo de las especificaciones de Microsoft:
  * [MS-CFB]  Compound File Binary (contenedor OLE, version 3, sectores de 512 bytes)
  * [MS-OVBA] Proyecto VBA: compresion, stream "dir", "PROJECT", "PROJECTwm"

El stream _VBA_PROJECT se escribe con Version = 0xFFFF y sin PerformanceCache,
tal y como exige MS-OVBA 2.3.4.1 "on write": Excel compila el codigo fuente al abrir.
"""

from __future__ import annotations

import random
import struct
import uuid
from dataclasses import dataclass, field

# --------------------------------------------------------------------------
# Compresion MS-OVBA 2.4.1
# --------------------------------------------------------------------------

CHUNK = 4096


def _copy_token_help(difference: int) -> tuple[int, int, int, int]:
    bit_count = max((difference - 1).bit_length(), 4)
    length_mask = 0xFFFF >> bit_count
    offset_mask = (~length_mask) & 0xFFFF
    maximum_length = (0xFFFF >> bit_count) + 3
    return bit_count, length_mask, offset_mask, maximum_length


def _compress_chunk(data: bytes) -> bytes:
    out = bytearray()
    pos = 0
    end = len(data)
    table: dict[bytes, list[int]] = {}
    while pos < end:
        flag_index = len(out)
        out.append(0)
        flags = 0
        for bit in range(8):
            if pos >= end:
                break
            best_len = 0
            best_off = 0
            if pos > 0:
                bit_count, _lm, _om, max_len = _copy_token_help(pos)
                max_len = min(max_len, end - pos)
                key = data[pos:pos + 3]
                if max_len >= 3 and len(key) == 3:
                    for cand in reversed(table.get(key, ())):
                        length = 0
                        while length < max_len and data[cand + length] == data[pos + length]:
                            length += 1
                        if length > best_len:
                            best_len = length
                            best_off = pos - cand
                            if length == max_len:
                                break
            if best_len >= 3:
                bit_count, _lm, _om, _ml = _copy_token_help(pos)
                token = ((best_off - 1) << (16 - bit_count)) | (best_len - 3)
                out += struct.pack("<H", token)
                flags |= 1 << bit
                step = best_len
            else:
                out.append(data[pos])
                step = 1
            for p in range(pos, pos + step):
                k = data[p:p + 3]
                if len(k) == 3:
                    table.setdefault(k, []).append(p)
            pos += step
        out[flag_index] = flags
    return bytes(out)


def compress(data: bytes) -> bytes:
    out = bytearray(b"\x01")
    for start in range(0, len(data), CHUNK):
        chunk = data[start:start + CHUNK]
        body = _compress_chunk(chunk)
        if len(body) + 2 > CHUNK + 2:
            if len(chunk) != CHUNK:
                raise ValueError("Bloque final incompresible: no soportado")
            header = (CHUNK + 2 - 3) | (0b011 << 12)  # bloque sin comprimir
            out += struct.pack("<H", header) + chunk
        else:
            header = (len(body) + 2 - 3) | (0b011 << 12) | 0x8000
            out += struct.pack("<H", header) + body
    return bytes(out)


def decompress(data: bytes) -> bytes:
    if data[0] != 1:
        raise ValueError("Firma de contenedor comprimido invalida")
    out = bytearray()
    pos = 1
    while pos < len(data):
        header = struct.unpack_from("<H", data, pos)[0]
        size = (header & 0x0FFF) + 3
        if (header >> 12) & 0b111 != 0b011:
            raise ValueError("Firma de bloque invalida")
        compressed = header & 0x8000
        chunk_end = pos + size
        pos += 2
        dstart = len(out)
        if not compressed:
            out += data[pos:pos + CHUNK]
            pos += CHUNK
            continue
        while pos < chunk_end:
            flags = data[pos]
            pos += 1
            for bit in range(8):
                if pos >= chunk_end:
                    break
                if flags & (1 << bit):
                    token = struct.unpack_from("<H", data, pos)[0]
                    pos += 2
                    bit_count, length_mask, offset_mask, _ = _copy_token_help(len(out) - dstart)
                    length = (token & length_mask) + 3
                    offset = ((token & offset_mask) >> (16 - bit_count)) + 1
                    src = len(out) - offset
                    for i in range(length):
                        out.append(out[src + i])
                else:
                    out.append(data[pos])
                    pos += 1
    return bytes(out)


# --------------------------------------------------------------------------
# Contenedor Compound File Binary [MS-CFB] (version 3)
# --------------------------------------------------------------------------

SECTOR = 512
MINI_SECTOR = 64
MINI_CUTOFF = 4096
FREESECT = 0xFFFFFFFF
ENDOFCHAIN = 0xFFFFFFFE
FATSECT = 0xFFFFFFFD
NOSTREAM = 0xFFFFFFFF


@dataclass
class _Node:
    name: str
    kind: int  # 1 storage, 2 stream, 5 root
    data: bytes = b""
    children: list["_Node"] = field(default_factory=list)
    did: int = 0
    left: int = NOSTREAM
    right: int = NOSTREAM
    child: int = NOSTREAM
    color: int = 1  # 0 rojo, 1 negro
    start: int = ENDOFCHAIN
    size: int = 0


def _cfb_key(name: str) -> tuple[int, str]:
    return (len(name), name.upper())


def _build_tree(nodes: list[_Node]) -> int:
    """Arbol rojo-negro valido: BST equilibrado, ultimo nivel incompleto en rojo."""
    nodes = sorted(nodes, key=lambda n: _cfb_key(n.name))
    depth_of: dict[int, int] = {}

    def build(lo: int, hi: int, depth: int) -> int:
        if lo > hi:
            return NOSTREAM
        mid = (lo + hi + 1) // 2
        node = nodes[mid]
        depth_of[id(node)] = depth
        node.left = build(lo, mid - 1, depth + 1)
        node.right = build(mid + 1, hi, depth + 1)
        return node.did

    root = build(0, len(nodes) - 1, 0)
    if nodes:
        max_depth = max(depth_of.values())
        full = len(nodes) == (1 << (max_depth + 1)) - 1
        for n in nodes:
            n.color = 0 if (not full and depth_of[id(n)] == max_depth and max_depth > 0) else 1
    return root


def _dir_entry(node: _Node | None) -> bytes:
    if node is None:
        return (b"\x00" * 64 + struct.pack("<HBB", 0, 0, 0)
                + struct.pack("<III", NOSTREAM, NOSTREAM, NOSTREAM)
                + b"\x00" * 16 + b"\x00" * 4 + b"\x00" * 16 + struct.pack("<IQ", 0, 0))
    name = node.name.encode("utf-16-le")
    if len(name) > 62:
        raise ValueError(f"Nombre demasiado largo: {node.name}")
    return (name.ljust(64, b"\x00")
            + struct.pack("<HBB", len(name) + 2, node.kind, node.color)
            + struct.pack("<III", node.left, node.right, node.child)
            + b"\x00" * 16 + b"\x00" * 4 + b"\x00" * 16
            + struct.pack("<IQ", node.start, node.size))


def build_cfb(tree: dict) -> bytes:
    """tree: {nombre: bytes | dict} (dict = storage). Devuelve el fichero CFB."""
    root = _Node("Root Entry", 5)
    order: list[_Node] = [root]

    def add(parent: _Node, content: dict) -> None:
        for name, value in content.items():
            if isinstance(value, dict):
                node = _Node(name, 1)
                parent.children.append(node)
                order.append(node)
                add(node, value)
            else:
                node = _Node(name, 2, data=bytes(value), size=len(value))
                parent.children.append(node)
                order.append(node)

    add(root, tree)
    for i, n in enumerate(order):
        n.did = i
    for n in order:
        if n.kind in (1, 5):
            n.child = _build_tree(n.children)

    # Mini stream (streams < 4096 bytes)
    mini_stream = bytearray()
    mini_fat: list[int] = []
    big: list[_Node] = []
    for n in order:
        if n.kind != 2:
            continue
        if n.size == 0:
            n.start = ENDOFCHAIN
        elif n.size < MINI_CUTOFF:
            first = len(mini_stream) // MINI_SECTOR
            count = (n.size + MINI_SECTOR - 1) // MINI_SECTOR
            n.start = first
            mini_stream += n.data.ljust(count * MINI_SECTOR, b"\x00")
            for k in range(count):
                mini_fat.append(first + k + 1 if k < count - 1 else ENDOFCHAIN)
        else:
            big.append(n)

    def sectors(nbytes: int) -> int:
        return (nbytes + SECTOR - 1) // SECTOR

    dir_bytes_len = len(order) * 128
    n_dir = sectors(dir_bytes_len)
    n_minifat = sectors(len(mini_fat) * 4)
    n_ministream = sectors(len(mini_stream))
    n_big = sum(sectors(n.size) for n in big)
    n_fat = 1
    while True:
        total = n_fat + n_dir + n_minifat + n_ministream + n_big
        if total <= n_fat * (SECTOR // 4):
            break
        n_fat += 1
    if n_fat > 109:
        raise ValueError("Fichero demasiado grande para este escritor (DIFAT)")

    fat = [FREESECT] * (n_fat * (SECTOR // 4))
    cursor = 0

    def alloc(count: int) -> int:
        nonlocal cursor
        if count == 0:
            return ENDOFCHAIN
        first = cursor
        for k in range(count):
            fat[cursor + k] = cursor + k + 1 if k < count - 1 else ENDOFCHAIN
        cursor += count
        return first

    for k in range(n_fat):
        fat[k] = FATSECT
    cursor = n_fat
    dir_start = alloc(n_dir)
    minifat_start = alloc(n_minifat)
    ministream_start = alloc(n_ministream)
    for n in big:
        n.start = alloc(sectors(n.size))

    root.start = ministream_start if mini_stream else ENDOFCHAIN
    root.size = len(mini_stream)

    body = bytearray()
    body += b"".join(struct.pack("<I", v) for v in fat)
    dir_data = b"".join(_dir_entry(n) for n in order)
    while len(dir_data) % SECTOR:
        dir_data += _dir_entry(None)
    body += dir_data
    mf = b"".join(struct.pack("<I", v) for v in mini_fat)
    body += mf.ljust(n_minifat * SECTOR, b"\xff")
    body += bytes(mini_stream).ljust(n_ministream * SECTOR, b"\x00")
    for n in big:
        body += n.data.ljust(sectors(n.size) * SECTOR, b"\x00")

    difat = [k for k in range(n_fat)] + [FREESECT] * (109 - n_fat)
    header = (b"\xD0\xCF\x11\xE0\xA1\xB1\x1A\xE1" + b"\x00" * 16
              + struct.pack("<HHHHH", 0x003E, 0x0003, 0xFFFE, 9, 6)
              + b"\x00" * 6
              + struct.pack("<IIIIIIIII", 0, n_fat, dir_start, 0, MINI_CUTOFF,
                            minifat_start if mini_fat else ENDOFCHAIN, n_minifat,
                            ENDOFCHAIN, 0)
              + b"".join(struct.pack("<I", v) for v in difat))
    assert len(header) == 512
    return header + bytes(body)


# --------------------------------------------------------------------------
# Proyecto VBA [MS-OVBA]
# --------------------------------------------------------------------------

CODEPAGE = 1252
ENC = "cp1252"

WORKBOOK_ATTRS = (
    'Attribute VB_Name = "{name}"\r\n'
    'Attribute VB_Base = "0{{00020819-0000-0000-C000-000000000046}}"\r\n'
    "Attribute VB_GlobalNameSpace = False\r\n"
    "Attribute VB_Creatable = False\r\n"
    "Attribute VB_PredeclaredId = True\r\n"
    "Attribute VB_Exposed = True\r\n"
    "Attribute VB_TemplateDerived = False\r\n"
    "Attribute VB_Customizable = True\r\n"
)
SHEET_ATTRS = WORKBOOK_ATTRS.replace("00020819", "00020820")


@dataclass
class Module:
    name: str
    kind: str  # "workbook", "sheet" o "module"
    code: str = ""

    def source(self) -> bytes:
        body = self.code.replace("\r\n", "\n").replace("\n", "\r\n")
        if body and not body.endswith("\r\n"):
            body += "\r\n"
        if self.kind == "workbook":
            text = WORKBOOK_ATTRS.format(name=self.name) + body
        elif self.kind == "sheet":
            text = SHEET_ATTRS.format(name=self.name) + body
        else:
            text = f'Attribute VB_Name = "{self.name}"\r\n' + body
        return text.encode(ENC)


def _rec(rid: int, payload: bytes) -> bytes:
    return struct.pack("<HI", rid, len(payload)) + payload


def _dir_stream(project_name: str, modules: list[Module]) -> bytes:
    b = bytearray()
    b += _rec(0x0001, struct.pack("<I", 1))            # SysKind Win32
    b += _rec(0x0002, struct.pack("<I", 0x0409))       # LCID
    b += _rec(0x0014, struct.pack("<I", 0x0409))       # LCID invoke
    b += _rec(0x0003, struct.pack("<H", CODEPAGE))     # CodePage
    b += _rec(0x0004, project_name.encode(ENC))        # Name
    b += _rec(0x0005, b"") + _rec(0x0040, b"")         # DocString
    b += _rec(0x0006, b"") + _rec(0x003D, b"")         # HelpFile
    b += _rec(0x0007, struct.pack("<I", 0))            # HelpContext
    b += _rec(0x0008, struct.pack("<I", 0))            # LibFlags
    b += struct.pack("<HIIH", 0x0009, 4, 1361024421, 6)  # Version
    b += _rec(0x000C, b"") + _rec(0x003C, b"")         # Constants

    # Referencia: OLE Automation (stdole)
    ref_name = "stdole"
    libid = ("*\\G{00020430-0000-0000-C000-000000000046}#2.0#0#"
             "C:\\Windows\\System32\\stdole2.tlb#OLE Automation").encode(ENC)
    b += _rec(0x0016, ref_name.encode(ENC)) + _rec(0x003E, ref_name.encode("utf-16-le"))
    b += _rec(0x000D, struct.pack("<I", len(libid)) + libid + struct.pack("<IH", 0, 0))

    b += _rec(0x000F, struct.pack("<H", len(modules)))
    b += _rec(0x0013, struct.pack("<H", 0xFFFF))
    for m in modules:
        name_a = m.name.encode(ENC)
        name_w = m.name.encode("utf-16-le")
        b += _rec(0x0019, name_a)
        b += _rec(0x0047, name_w)
        b += _rec(0x001A, name_a) + _rec(0x0032, name_w)
        b += _rec(0x001C, b"") + _rec(0x0048, b"")
        b += _rec(0x0031, struct.pack("<I", 0))        # TextOffset: sin cache
        b += _rec(0x001E, struct.pack("<I", 0))
        b += _rec(0x002C, struct.pack("<H", 0xFFFF))
        b += struct.pack("<HI", 0x0021 if m.kind == "module" else 0x0022, 0)
        b += struct.pack("<HI", 0x002B, 0)
    b += struct.pack("<HI", 0x0010, 0)
    return bytes(b)


def _encrypt(data: bytes, project_id: str, rng: random.Random) -> str:
    """Data Encryption de MS-OVBA 2.4.3.2 (CMG, DPB, GC)."""
    seed = rng.randrange(256)
    version_enc = seed ^ 2
    project_key = sum(project_id.encode(ENC)) & 0xFF
    project_key_enc = seed ^ project_key
    out = [seed, version_enc, project_key_enc]
    unencrypted_byte1 = project_key
    encrypted_byte1 = project_key_enc
    encrypted_byte2 = version_enc
    ignored_length = (seed & 6) // 2
    plain = bytes([7] * ignored_length) + struct.pack("<I", len(data)) + data
    for byte in plain:
        byte_enc = byte ^ ((encrypted_byte2 + unencrypted_byte1) & 0xFF)
        out.append(byte_enc)
        encrypted_byte2 = encrypted_byte1
        encrypted_byte1 = byte_enc
        unencrypted_byte1 = byte
    return "".join(f"{v:02X}" for v in out)


def _decrypt(hexstr: str, project_id: str) -> bytes:
    enc = bytes.fromhex(hexstr)
    seed, version_enc, project_key_enc = enc[0], enc[1], enc[2]
    assert version_enc ^ seed == 2
    project_key = project_key_enc ^ seed
    assert project_key == sum(project_id.encode(ENC)) & 0xFF
    unencrypted_byte1 = project_key
    encrypted_byte1 = project_key_enc
    encrypted_byte2 = version_enc
    plain = bytearray()
    for byte_enc in enc[3:]:
        byte = byte_enc ^ ((encrypted_byte2 + unencrypted_byte1) & 0xFF)
        plain.append(byte)
        encrypted_byte2 = encrypted_byte1
        encrypted_byte1 = byte_enc
        unencrypted_byte1 = byte
    ignored = (seed & 6) // 2
    length = struct.unpack_from("<I", plain, ignored)[0]
    data = bytes(plain[ignored + 4:])
    assert len(data) == length
    return data


def _project_stream(project_name: str, project_id: str, modules: list[Module], seed: int) -> bytes:
    rng = random.Random(seed)
    lines = [f'ID="{project_id}"']
    for m in modules:
        if m.kind == "module":
            lines.append(f"Module={m.name}")
        else:
            lines.append(f"Document={m.name}/&H00000000")
    lines += [
        f'Name="{project_name}"',
        'HelpContextID="0"',
        'VersionCompatible32="393222000"',
        f'CMG="{_encrypt(bytes(4), project_id, rng)}"',
        f'DPB="{_encrypt(bytes(1), project_id, rng)}"',
        f'GC="{_encrypt(bytes([0xFF]), project_id, rng)}"',
        "",
        "[Host Extender Info]",
        "&H00000001={3832D640-CF90-11CF-8E43-00A0C911005A};VBE;&H00000000",
        "",
        "[Workspace]",
    ]
    lines += [f"{m.name}=0, 0, 0, 0, C" for m in modules]
    return ("\r\n".join(lines) + "\r\n").encode(ENC)


def _projectwm(modules: list[Module]) -> bytes:
    b = bytearray()
    for m in modules:
        b += m.name.encode(ENC) + b"\x00" + m.name.encode("utf-16-le") + b"\x00\x00"
    b += b"\x00\x00"
    return bytes(b)


def build_vba_project(modules: list[Module], project_name: str = "VBAProject",
                      seed: int = 2025) -> bytes:
    project_id = "{" + str(uuid.UUID(int=random.Random(seed).getrandbits(128))).upper() + "}"
    vba: dict = {
        "_VBA_PROJECT": struct.pack("<HHBH", 0x61CC, 0xFFFF, 0x00, 0x0000),
        "dir": compress(_dir_stream(project_name, modules)),
    }
    for m in modules:
        vba[m.name] = compress(m.source())
    tree = {
        "VBA": vba,
        "PROJECT": _project_stream(project_name, project_id, modules, seed),
        "PROJECTwm": _projectwm(modules),
    }
    return build_cfb(tree)


if __name__ == "__main__":  # autocomprobacion rapida
    rnd = random.Random(1)
    samples = [b"", b"a", b"abcabcabcabc" * 900, bytes(rnd.randrange(256) for _ in range(4096)),
               ("Sub Hola()\r\n    MsgBox \"Hola\"\r\nEnd Sub\r\n" * 400).encode()]
    for s in samples:
        assert decompress(compress(s)) == s, len(s)
    pid = "{12345678-1234-1234-1234-123456789ABC}"
    for d in (bytes(4), bytes(1), b"\xff"):
        assert _decrypt(_encrypt(d, pid, random.Random(3)), pid) == d
    print("ok")
