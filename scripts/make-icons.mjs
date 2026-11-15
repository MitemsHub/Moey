/**
 * Writes the PWA icons with no dependencies: a small RGBA rasteriser and a PNG
 * encoder. Run once (`node scripts/make-icons.mjs`) whenever the mark changes.
 *
 * Shape: the same mark as public/favicon.svg — two figures, one cream and one
 * accent — on the app's dark surface.
 */
import { deflateSync } from 'node:zlib'
import { writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

const DARK = [20, 20, 24]
const CREAM = [244, 241, 234]
const ACCENT = [143, 139, 255]

const crcTable = (() => {
  const table = new Uint32Array(256)
  for (let n = 0; n < 256; n += 1) {
    let c = n
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    table[n] = c >>> 0
  }
  return table
})()

function crc32(buffer) {
  let c = 0xffffffff
  for (const byte of buffer) c = crcTable[(c ^ byte) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

function chunk(type, data) {
  const length = Buffer.alloc(4)
  length.writeUInt32BE(data.length)
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(body))
  return Buffer.concat([length, body, crc])
}

function encodePng(size, rgba) {
  const header = Buffer.alloc(13)
  header.writeUInt32BE(size, 0)
  header.writeUInt32BE(size, 4)
  header[8] = 8 // bit depth
  header[9] = 6 // RGBA
  const raw = Buffer.alloc((size * 4 + 1) * size)
  for (let y = 0; y < size; y += 1) {
    raw[y * (size * 4 + 1)] = 0 // filter: none
    rgba.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4)
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

// A figure is a head circle plus shoulders: an ellipse whose top half is kept.
function insideFigure(x, y, cx, headCy, headR, shoulderTop, rx, ry) {
  const dx = x - cx
  const dy = y - headCy
  if (dx * dx + dy * dy <= headR * headR) return true
  if (y > shoulderTop) return false
  const sx = dx / rx
  const sy = (y - shoulderTop) / ry
  return sx * sx + sy * sy <= 1
}

function render(size, { maskable }) {
  const scale = size / 512
  const supersample = 4
  const rgba = Buffer.alloc(size * size * 4)
  const radius = maskable ? 0 : 96 * scale

  const inRoundedRect = (x, y) => {
    if (!radius) return true
    const cx = Math.min(Math.max(x, radius), size - radius)
    const cy = Math.min(Math.max(y, radius), size - radius)
    const dx = x - cx
    const dy = y - cy
    return dx * dx + dy * dy <= radius * radius
  }

  const mark = maskable ? 0.68 : 1
  const toMark = (value) => (value - 256) * mark + 256

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      let cream = 0
      let accent = 0
      let covered = 0
      for (let sy = 0; sy < supersample; sy += 1) {
        for (let sx = 0; sx < supersample; sx += 1) {
          const px = (x + (sx + 0.5) / supersample) / scale
          const py = (y + (sy + 0.5) / supersample) / scale
          if (!inRoundedRect(x + (sx + 0.5) / supersample, y + (sy + 0.5) / supersample)) continue
          covered += 1
          const mx = 256 + (px - 256) / mark
          const my = 256 + (py - 256) / mark
          if (insideFigure(mx, my, 196, 196, 62, 400, 100, 104)) cream += 1
          else if (insideFigure(mx, my, 352, 176, 30, 296, 46, 54)) accent += 1
        }
      }
      const total = supersample * supersample
      const alpha = covered / total
      const index = (y * size + x) * 4
      if (alpha === 0) continue
      const cw = cream / total
      const aw = accent / total
      const base = DARK.map((channel) => channel * (1 - cw - aw))
      rgba[index] = Math.round(base[0] + CREAM[0] * cw + ACCENT[0] * aw)
      rgba[index + 1] = Math.round(base[1] + CREAM[1] * cw + ACCENT[1] * aw)
      rgba[index + 2] = Math.round(base[2] + CREAM[2] * cw + ACCENT[2] * aw)
      rgba[index + 3] = Math.round(alpha * 255)
    }
  }
  return encodePng(size, rgba)
}

const targets = [
  ['public/icon-192.png', 192, { maskable: false }],
  ['public/icon-512.png', 512, { maskable: false }],
  ['public/icon-maskable-512.png', 512, { maskable: true }],
]

for (const [path, size, options] of targets) {
  writeFileSync(resolve(path), render(size, options))
  console.log('wrote', path, size)
}
