// Minimal ZIP reader (stored + deflate) for .apkg packages, using only node:zlib. No extraction by archive names: callers read
// entries into memory and decide their own output paths. `safeJoin` guards every path a tool writes.
import { crc32, inflateRawSync, deflateRawSync } from 'node:zlib'
import { isAbsolute, join, resolve, sep } from 'node:path'

export type ZipEntry = { name: string; method: number; compressedSize: number; size: number; crc: number; localOffset: number }

/** Archive member names we accept: relative, no "..", no backslashes, no drive letters, no NUL. */
export function safeEntryName(name: string): boolean {
  if (!name || name.includes('\0') || name.includes('\\') || isAbsolute(name) || /^[a-zA-Z]:/.test(name)) return false
  return !name.split('/').some(p => p === '..')
}

/** Join `rel` under `dest`, refusing anything that would resolve outside `dest`. */
export function safeJoin(dest: string, rel: string): string {
  if (!safeEntryName(rel)) throw new Error(`unsafe path "${rel}"`)
  const root = resolve(dest)
  const out = resolve(join(root, rel))
  if (out !== root && !out.startsWith(root + sep)) throw new Error(`path "${rel}" escapes ${dest}`)
  return out
}

export function readZip(buf: Buffer): Map<string, ZipEntry> {
  // End of central directory: scan back from the end (comment up to 64 KiB).
  let eocd = -1
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 22 - 0xffff); i--) if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break }
  if (eocd < 0) throw new Error('not a ZIP archive (no end of central directory)')
  let count = buf.readUInt16LE(eocd + 10)
  let cdOffset = buf.readUInt32LE(eocd + 16)
  if (count === 0xffff || cdOffset === 0xffffffff) {
    // ZIP64 end of central directory locator just before EOCD
    const loc = eocd - 20
    if (loc < 0 || buf.readUInt32LE(loc) !== 0x07064b50) throw new Error('ZIP64 archive without locator')
    const z = Number(buf.readBigUInt64LE(loc + 8))
    count = Number(buf.readBigUInt64LE(z + 32)); cdOffset = Number(buf.readBigUInt64LE(z + 48))
  }
  const out = new Map<string, ZipEntry>()
  let p = cdOffset
  for (let n = 0; n < count; n++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) throw new Error('corrupt central directory')
    const method = buf.readUInt16LE(p + 10)
    const crc = buf.readUInt32LE(p + 16)
    let compressedSize = buf.readUInt32LE(p + 20), size = buf.readUInt32LE(p + 24)
    const nameLen = buf.readUInt16LE(p + 28), extraLen = buf.readUInt16LE(p + 30), commentLen = buf.readUInt16LE(p + 32)
    let localOffset = buf.readUInt32LE(p + 42)
    const name = buf.subarray(p + 46, p + 46 + nameLen).toString('utf8')
    // ZIP64 extra field
    let e = p + 46 + nameLen
    const end = e + extraLen
    while (e + 4 <= end) {
      const id = buf.readUInt16LE(e), len = buf.readUInt16LE(e + 2)
      if (id === 0x0001) {
        let q = e + 4
        if (size === 0xffffffff) { size = Number(buf.readBigUInt64LE(q)); q += 8 }
        if (compressedSize === 0xffffffff) { compressedSize = Number(buf.readBigUInt64LE(q)); q += 8 }
        if (localOffset === 0xffffffff) { localOffset = Number(buf.readBigUInt64LE(q)) }
      }
      e += 4 + len
    }
    if (!name.endsWith('/')) {
      if (!safeEntryName(name)) throw new Error(`archive contains an unsafe member name: ${JSON.stringify(name)}`)
      if (out.has(name)) throw new Error(`archive contains ${name} twice`)
      out.set(name, { name, method, compressedSize, size, crc, localOffset })
    }
    p += 46 + nameLen + extraLen + commentLen
  }
  return out
}

export function readEntry(buf: Buffer, e: ZipEntry): Buffer {
  const p = e.localOffset
  if (buf.readUInt32LE(p) !== 0x04034b50) throw new Error(`corrupt local header for ${e.name}`)
  const start = p + 30 + buf.readUInt16LE(p + 26) + buf.readUInt16LE(p + 28)
  const raw = buf.subarray(start, start + e.compressedSize)
  const data = e.method === 0 ? Buffer.from(raw) : e.method === 8 ? inflateRawSync(raw) : null
  if (!data) throw new Error(`${e.name}: unsupported compression method ${e.method}`)
  if (data.length !== e.size) throw new Error(`${e.name}: size mismatch`)
  if ((crc32(data) >>> 0) !== (e.crc >>> 0)) throw new Error(`${e.name}: CRC mismatch`)
  return data
}

/** Writes a small ZIP (deflate). Used by tests to build fixture packages; never needed for importing. */
export function writeZip(files: { name: string; data: Buffer }[]): Buffer {
  const locals: Buffer[] = [], centrals: Buffer[] = []
  let offset = 0
  for (const f of files) {
    const name = Buffer.from(f.name, 'utf8')
    const comp = deflateRawSync(f.data)
    const crc = crc32(f.data) >>> 0
    const lh = Buffer.alloc(30)
    lh.writeUInt32LE(0x04034b50, 0); lh.writeUInt16LE(20, 4); lh.writeUInt16LE(0x0800, 6); lh.writeUInt16LE(8, 8)
    lh.writeUInt32LE(crc, 14); lh.writeUInt32LE(comp.length, 18); lh.writeUInt32LE(f.data.length, 22); lh.writeUInt16LE(name.length, 26)
    const ch = Buffer.alloc(46)
    ch.writeUInt32LE(0x02014b50, 0); ch.writeUInt16LE(20, 4); ch.writeUInt16LE(20, 6); ch.writeUInt16LE(0x0800, 8); ch.writeUInt16LE(8, 10)
    ch.writeUInt32LE(crc, 16); ch.writeUInt32LE(comp.length, 20); ch.writeUInt32LE(f.data.length, 24); ch.writeUInt16LE(name.length, 28)
    ch.writeUInt32LE(offset, 42)
    locals.push(lh, name, comp); centrals.push(ch, name)
    offset += lh.length + name.length + comp.length
  }
  const cd = Buffer.concat(centrals)
  const eocd = Buffer.alloc(22)
  eocd.writeUInt32LE(0x06054b50, 0); eocd.writeUInt16LE(files.length, 8); eocd.writeUInt16LE(files.length, 10)
  eocd.writeUInt32LE(cd.length, 12); eocd.writeUInt32LE(offset, 16)
  return Buffer.concat([...locals, cd, eocd])
}
