// Dither Dunes Night: an ordered-dither desert printed pale on umber paper, one ember sun.
//
// Adapted from Anthropic's theme-examples plugin 0.4.3 (hooks/scenes/dither-dunes.ts), Apache License 2.0. Changed:
// - It moves by SMIL, not CSS animation, since the app's backdrop runs no CSS animation; the light's creep moves
//   a stack at a time rather than a tone at a time, and fewer grains blow, to keep it small.
// - Only the night stock is printed, and only in a dark window: every colour is painted at an opacity read off the text
//   colour the app sets on the drawing, over the app's own light page colour, so a light window stays plain.
// - The sun is pixel art drawn once, not a stack of dither layers, and stands where the context does: it rises
//   from behind the far dune while the context is empty, stands highest at half and sets, redder, as it fills.
// - The share of the context window left is pressed into the sand of the third dune in pixels of its own grid, between
//   the chat and the session panel at the window's right edge, and stays still while the dune's outline wanders, as its
//   dots do.
// - The dot fields (the light on the dune faces, the haze in the sky) are left out and the sand is flat, as it already
//   was behind the conversation: the desktop app draws pattern-filled dots smeared into vertical stripes, while plain
//   pixel strokes (the sun, the lit crest, the lee lines, the figures) stay crisp. levelPath, layerStack and
//   bayerPatterns are kept for drawing the dots again as strokes.
// Pure string building: no DOM, the same output on every build.

const WIDTH = 1600
const HEIGHT = 1000
/** One dither pixel is 5 units, so a 1200x800 window (scale 0.8) draws it 4 px wide exactly. */
const CELL = 5
/** The threshold matrix is 8x8 dither pixels: 64 tones. Tone layers are laid out, and moved, in whole tiles, so the dots never leave the grid. */
const MATRIX = 8
const TILE = CELL * MATRIX
const TILE_COLUMNS = WIDTH / TILE
const TILE_ROWS = HEIGHT / TILE
const TONES = MATRIX * MATRIX
/** Spare field above a crest, for the tone layers to move out of: they are clipped to the dune's outline and slide under it. */
const MARGIN = 3 * TILE
/** Both inks stop near a third: above that the matrix draws crosses, and at this size they look like a fault. */
const SOFT_CEILING = 0.34
const DARK_CEILING = 0.28
/** The dark ink only joins in where the shade is already this deep, so it never shows up in stray single pixels. */
const DARK_FLOOR = 0.1
/** The sky's haze never passes a fifth. */
const HAZE_CEILING = 0.2
const SUN_RADIUS = 34
const BAYER: readonly (readonly number[])[] = bayerMatrix(MATRIX)

/**
 * The sun's way through the context: from low over the far dune, up to noon at half, and down a little to the left. It
 * keeps between the chat and the session panel the desktop window keeps at its right edge (about the last sixth), its
 * outer ring included, and low it stands half behind the far dune's crest at both ends.
 */
const SUN_X = 1215
const SUN_NOON_Y = 446
const SUN_LOW_Y = 565
const SUN_DRIFT = 110

/** The paper, the one sand ink in three strengths, the sun, and the flat tone of each dune, back to front. */
/** The night stock: umber paper, pale sand dots, nearer dunes a step lighter, an ember sun that reddens as it sets. */
// The paper, the sands, the lee lines and the grains are the original's as they looked under the app's glass (30% of
// its #151515 panel colour): the glass is off, since the fade of its veil at the conversation's edges banded into
// stripes, so the whole window now has the tone the conversation's middle had. The sun and the figures keep theirs.
const DAY = { paper: '#1f1b16', haze: '#2a231c', lee: '#332c24', soft: '#514738', strong: '#988462', sun: '#c8573a', dusk: '#a83a26', sands: ['#221d18', '#24201a', '#27221c', '#2a241d'] }

/** How dark the window is, from the text's lightness `l`: 0 in a light window, 1 in a dark one. */
export const BY_NIGHT = 'clamp(0, (l - .35) / .45, 1)'

type CrestPoint = readonly [number, number, number?]

interface Dune {
  readonly crest: readonly CrestPoint[]
  readonly tone: number
  readonly reach: number
  readonly seconds: number
  readonly driftUnits: number
  readonly driftSeconds: number
  readonly glint: readonly [number, number] | null
}

const DUNES: readonly Dune[] = [
  { crest: [[0, 566], [250, 532, 1], [560, 592], [900, 604], [1200, 574], [1430, 524, 1], [1600, 552]], tone: 0.34, reach: 150, seconds: 104, driftUnits: 40, driftSeconds: 200, glint: null },
  { crest: [[0, 676], [330, 640, 1], [700, 724], [1000, 734], [1290, 644, 1], [1600, 706]], tone: 0.42, reach: 190, seconds: 88, driftUnits: -60, driftSeconds: 150, glint: null },
  // Its lit peak stands left of the session panel at the window's right edge, so its ember crest shows.
  { crest: [[0, 806], [200, 764, 1], [520, 864], [800, 900], [1010, 852], [1235, 728, 1], [1600, 800]], tone: 0.48, reach: 220, seconds: 96, driftUnits: 80, driftSeconds: 120, glint: [1080, 1600] },
  { crest: [[0, 934], [300, 904], [640, 962], [900, 972], [1250, 930, 1], [1600, 902]], tone: 0.5, reach: 160, seconds: 80, driftUnits: -100, driftSeconds: 100, glint: null },
]

interface Field {
  readonly kind: 'haze' | 'soft' | 'strong'
  readonly dune: Dune | null
  readonly index: number
}

function bayerMatrix(size: number): number[][] {
  if (size === 1) return [[0]]
  const half = bayerMatrix(size / 2)
  const matrix: number[][] = []
  for (let y = 0; y < size; y += 1) {
    const row: number[] = []
    for (let x = 0; x < size; x += 1) {
      const quarter = y < size / 2 ? (x < size / 2 ? 0 : 2) : x < size / 2 ? 3 : 1
      row.push(4 * (half[y % (size / 2)]?.[x % (size / 2)] ?? 0) + quarter)
    }
    matrix.push(row)
  }
  return matrix
}

function thresholdAt(x: number, y: number): number {
  const row = (((y / CELL) % MATRIX) + MATRIX) % MATRIX
  const column = (((x / CELL) % MATRIX) + MATRIX) % MATRIX
  return ((BAYER[row]?.[column] ?? 0) + 0.5) / TONES
}

function smoothstep(low: number, high: number, value: number): number {
  const t = Math.min(1, Math.max(0, (value - low) / (high - low)))
  return t * t * (3 - 2 * t)
}

function crestAt(points: readonly CrestPoint[], x: number): number {
  let last = 0
  for (let index = 0; index < points.length; index += 1) {
    const to = points[index]
    if (to === undefined) continue
    last = to[1]
    if (x > to[0]) continue
    const from = index === 0 ? undefined : points[index - 1]
    if (from === undefined) return to[1]
    const t = (x - from[0]) / (to[0] - from[0])
    let eased = (1 - Math.cos(Math.PI * t)) / 2
    if (to[2] === 1 && from[2] !== 1) eased = Math.pow(t, 1.7)
    if (from[2] === 1 && to[2] !== 1) eased = 1 - Math.pow(1 - t, 1.7)
    return from[1] + (to[1] - from[1]) * eased
  }
  return last
}

function crestRow(dune: Dune, x: number): number {
  return Math.round(crestAt(dune.crest, x + CELL / 2) / CELL) * CELL
}

/** 0 under the conversation (24% to 76% of the width), 1 at the window's edges: where dots are allowed at all. */
function edgeWeight(x: number): number {
  const u = x / WIDTH
  return Math.max(1 - smoothstep(0.06, 0.24, u), smoothstep(0.76, 0.93, u))
}

function duneTone(dune: Dune, index: number, x: number, y: number): number {
  const depth = Math.max(0, y - crestAt(dune.crest, x))
  const swell = 0.86 + 0.14 * Math.sin(x / 120 + index * 2.3)
  return dune.tone * swell * Math.pow(Math.max(0, 1 - depth / dune.reach), 1.4)
}

function fieldTone(field: Field, x: number, y: number): number {
  if (field.kind === 'haze') {
    const sides = Math.max(1 - smoothstep(0.08, 0.27, x / WIDTH), smoothstep(0.73, 0.92, x / WIDTH))
    return HAZE_CEILING * smoothstep(0, 620, y + 50 * Math.sin(x / 210)) * sides
  }
  const dune = field.dune
  if (dune === null || y - crestAt(dune.crest, x) <= -MARGIN) return 0
  const tone = duneTone(dune, field.index, x, y)
  if (field.kind === 'soft') return Math.min(SOFT_CEILING, tone * edgeWeight(x))
  return Math.min(DARK_CEILING, 1.4 * Math.max(0, tone * smoothstep(0.82, 0.97, x / WIDTH) - DARK_FLOOR))
}

/** One threshold of the matrix, in boxes of whole tiles, between two tile columns: rows of runs, identical runs on consecutive rows merged into taller boxes. */
function levelPath(level: number, firstColumn: number, lastColumn: number, field: Field): string {
  let pixelColumn = 0
  let pixelRow = 0
  for (let y = 0; y < MATRIX; y += 1) {
    for (let x = 0; x < MATRIX; x += 1) {
      if (BAYER[y]?.[x] === level) {
        pixelColumn = x
        pixelRow = y
      }
    }
  }
  const threshold = (level + 0.5) / TONES
  const open = new Map<string, number>()
  let path = ''
  for (let row = 0; row <= TILE_ROWS; row += 1) {
    const seen = new Set<string>()
    let runStart = -1
    for (let column = firstColumn; column <= lastColumn && row < TILE_ROWS; column += 1) {
      const inked = column < lastColumn && fieldTone(field, column * TILE + (pixelColumn + 0.5) * CELL, row * TILE + (pixelRow + 0.5) * CELL) > threshold
      if (inked && runStart < 0) runStart = column
      if (!inked && runStart >= 0) {
        const key = `${runStart} ${column - runStart}`
        seen.add(key)
        if (!open.has(key)) open.set(key, row)
        runStart = -1
      }
    }
    for (const [key, firstRow] of [...open]) {
      if (seen.has(key)) continue
      const [start, length] = key.split(' ').map(Number)
      path += `M${(start ?? 0) * TILE} ${firstRow * TILE}h${(length ?? 0) * TILE}v${(row - firstRow) * TILE}h${-(length ?? 0) * TILE}z`
      open.delete(key)
    }
  }
  return path
}

/** A translation that steps through `values` (each "x y") and repeats, every step as long, begun `ago` seconds back. */
function steps(values: readonly string[], seconds: number, ago: number): string {
  return `<animateTransform attributeName="transform" type="translate" values="${values.join(';')}" dur="${seconds}s" begin="-${Math.round(ago)}s" calcMode="discrete" repeatCount="indefinite"/>`
}

/** Out to `to` and back again in `count` steps each way, as a CSS `steps(count) alternate` animation of `seconds` per way would go. */
function thereAndBack(count: number, to: (step: number) => string): string[] {
  const values: string[] = []
  for (let step = 0; step <= count; step += 1) values.push(to(step))
  for (let step = count - 1; step > 0; step -= 1) values.push(to(step))
  return values
}

/** A stack of threshold layers for one field in one ink, creeping three tiles there and back, a tile at a time, as the light moves over the sand. */
function layerStack(ink: string, firstColumn: number, lastColumn: number, field: Field, creep?: { x: number; y: number; seconds: number; phase: number }): string {
  let layers = ''
  for (let level = 0; level < TONES; level += 1) {
    const path = levelPath(level, firstColumn, lastColumn, field)
    if (path !== '') layers += `<path d="${path}" fill="url(#${ink}${level})"/>`
  }
  if (creep === undefined || layers === '') return layers
  const values = thereAndBack(3, step => `${creep.x * step * TILE} ${creep.y * step * TILE}`)
  return `<g>${steps(values, creep.seconds * 2, creep.phase % (creep.seconds * 2))}${layers}</g>`
}

function outlinePath(dune: Dune): string {
  const spare = 120
  let path = `M${-spare} ${HEIGHT}`
  let previous = -1
  for (let x = -spare; x < WIDTH + spare; x += CELL) {
    const top = crestRow(dune, x)
    if (top !== previous) {
      path += previous < 0 ? `V${top}` : `H${x}V${top}`
      previous = top
    }
  }
  return `${path}H${WIDTH + spare}V${HEIGHT}z`
}

/**
 * Single dither pixels, as one path to be stroked a pixel wide (the classes that draw it say so): each row's run of pixels is one
 * stroke through the middle of the row, every move after the first relative to where the last stroke ended.
 */
function pixels(cells: Iterable<readonly [number, number]>): string {
  const rows = new Map<number, number[]>()
  for (const [x, y] of cells) rows.set(y, [...(rows.get(y) ?? []), x])
  let path = ''
  let at: [number, number] | undefined
  for (const y of [...rows.keys()].sort((a, b) => a - b)) {
    const xs = (rows.get(y) ?? []).sort((a, b) => a - b)
    let start = xs[0] ?? 0
    let end = start
    for (const x of [...xs.slice(1), Infinity]) {
      if (x === end + CELL) {
        end = x
        continue
      }
      const length = end - start + CELL
      const middle = y + CELL / 2
      path += at === undefined ? `M${start} ${middle}h${length}` : `m${start - at[0]} ${middle - at[1]}h${length}`
      at = [start + length, middle]
      start = x
      end = x
    }
  }
  return path
}

function glintPath(dune: Dune): string {
  if (dune.glint === null) return ''
  const [from, to] = dune.glint
  const cells: [number, number][] = []
  for (let x = from; x < to; x += CELL) {
    const ends = Math.min(smoothstep(from, from + 120, x), 1 - smoothstep(to - 60, to + 60, x))
    for (let deep = 0; deep < 6; deep += 1) {
      const y = crestRow(dune, x) + deep * CELL
      const tone = deep < 2 ? 0.9 : 0.55 * Math.pow(1 - (deep - 2) / 4, 1.5)
      if (tone * ends > thresholdAt(x, y)) cells.push([x, y])
    }
  }
  return `<path d="${pixels(cells)}" class="usun"/>`
}

function leePath(dune: Dune): string {
  const cells: [number, number][] = []
  for (let x = 240; x < 1360; x += CELL) {
    const middle = 1 - edgeWeight(x)
    for (let deep = 0; deep < 2; deep += 1) {
      const y = crestRow(dune, x) + deep * CELL
      if ((deep === 0 ? 0.5 : 0.25) * middle > thresholdAt(x, y)) cells.push([x, y])
    }
  }
  return `<path d="${pixels(cells)}" class="ulee"/>`
}

/**
 * The dune the share left is written on, the empty group it is written into, and where: on its face below the lit crest,
 * low enough that the crest never wanders down onto it. Its right end is held at WRITE_END, so however many figures it
 * takes it stays out from under the session panel the desktop window keeps at its right edge (about the last sixth).
 */
const WRITTEN_DUNE = 2
const SAND = '<g id="usand"/>'
const WRITE_END = 1270
const WRITE_Y = 860
/** From one figure's left edge to the next, in dither pixels: three wide and one between. */
const WRITE_ADVANCE = 4

/** The figures as dither pixels, three wide and five tall, a row at a time from the top: 1 where the sand is pressed. */
export const PIXEL_FIGURES: Record<string, readonly string[]> = {
  '0': ['111', '101', '101', '101', '111'],
  '1': ['010', '110', '010', '010', '111'],
  '2': ['111', '001', '111', '100', '111'],
  '3': ['111', '001', '011', '001', '111'],
  '4': ['101', '101', '111', '001', '001'],
  '5': ['111', '100', '111', '001', '111'],
  '6': ['111', '100', '111', '101', '111'],
  '7': ['111', '001', '001', '010', '010'],
  '8': ['111', '101', '111', '101', '111'],
  '9': ['111', '101', '111', '001', '111'],
  '%': ['101', '001', '010', '100', '101'],
}

/**
 * The whole percent of the context window left, pressed into the sand on the dunes' own pixel grid in the dark sand ink.
 * The figures show one after another when the drawing first shows.
 */
export function sandNumber(left: number): string {
  const text = `${Math.min(100, Math.max(0, Math.round(left)))}%`
  const x0 = WRITE_END - (text.length * WRITE_ADVANCE - 1) * CELL
  let out = ''
  ;[...text].forEach((figure, i) => {
    const cells: [number, number][] = []
    ;(PIXEL_FIGURES[figure] ?? []).forEach((row, r) => {
      ;[...row].forEach((bit, c) => {
        if (bit === '1') cells.push([x0 + (i * WRITE_ADVANCE + c) * CELL, WRITE_Y + r * CELL])
      })
    })
    const at = 0.4 + i * 0.35
    const show = `<animate attributeName="opacity" values="0;0;1" keyTimes="0;${(at / (at + 0.25)).toFixed(2)};1" dur="${(at + 0.25).toFixed(2)}s" fill="freeze"/>`
    out += `<path d="${pixels(cells)}" class="uw">${show}</path>`
  })
  return out
}

/** One dune: its outline wanders sideways a dither pixel at a time while its dots, and the writing, stay where they are on the screen. */
function dunePart(dune: Dune, index: number): string {
  const outline = outlinePath(dune)
  const count = Math.abs(dune.driftUnits) / CELL
  const ago = (index * 31) % dune.driftSeconds
  const sign = Math.sign(dune.driftUnits)
  const wander = steps(thereAndBack(count, step => `${sign * step * CELL}`), dune.driftSeconds * 2, ago)
  const writing = index === WRITTEN_DUNE ? SAND : ''
  // Flat sand, no dot fields: the desktop app smears pattern-filled dots into vertical stripes (see the header).
  return `<g>${wander}<path d="${outline}" class="ud${index}"/>${leePath(dune)}${glintPath(dune)}</g>${writing}`
}

/** The sky is left flat: its haze of dots smeared into stripes in the app like the dunes' (see the header). */
function skyLayers(): string {
  return ''
}

/** Where the sun stands `day` through the context (0 to 1), on the dither grid. */
export function duneSunAt(day: number): { x: number; y: number } {
  const t = Math.min(1, Math.max(0, day))
  const x = SUN_X - SUN_DRIFT * t
  const y = SUN_LOW_Y - (SUN_LOW_Y - SUN_NOON_Y) * 4 * t * (1 - t)
  return { x: Math.round(x / CELL) * CELL, y: Math.round(y / CELL) * CELL }
}

/** The sun: a solid disc inside two clean rings of its own dots, a half and a quarter, drawn as pixels where the context puts it. */
function sunPart(day: number): string {
  const { x: cx, y: cy } = duneSunAt(day)
  const reach = Math.ceil((SUN_RADIUS * 1.9) / CELL) * CELL
  const cells: [number, number][] = []
  for (let y = cy - reach; y <= cy + reach; y += CELL) {
    for (let x = cx - reach; x <= cx + reach; x += CELL) {
      const distance = Math.hypot(x + CELL / 2 - cx, y + CELL / 2 - cy)
      const tone = distance <= SUN_RADIUS ? 1 : distance <= SUN_RADIUS * 1.45 ? 0.5 : distance <= SUN_RADIUS * 1.9 ? 0.25 : 0
      if (tone > thresholdAt(x, y)) cells.push([x, y])
    }
  }
  return `<path d="${pixels(cells)}" class="usun"/>`
}

/** Grains blown along two crests, at the window's edges only: single soft pixels, stepping one pixel at a time, downwind. */
function grainsPart(): string {
  let out = ''
  const travel = 44
  const across = Array.from({ length: travel + 1 }, (_, step) => `${step * CELL}`)
  for (let grain = 0; grain < 8; grain += 1) {
    const right = grain % 3 !== 0
    const startX = right ? 1260 + ((grain * 29) % 120) : 40 + ((grain * 31) % 120)
    const dune = right ? DUNES[2] : DUNES[1]
    if (dune === undefined) continue
    const y = crestRow(dune, startX + 110) - CELL * (2 + ((grain * 37) % 5))
    const seconds = 34 + ((grain * 13) % 25)
    const ago = (grain * 6.1) % seconds
    out += `<rect x="${startX - (startX % CELL)}" y="${y}" width="${CELL}" height="${CELL}" class="ug" opacity="0">${steps(across, seconds, ago)}<animate attributeName="opacity" values="0;1;1;0" keyTimes="0;.08;.8;1" dur="${seconds}s" begin="-${Math.round(ago)}s" repeatCount="indefinite"/></rect>`
  }
  return out
}

/** One pattern per threshold of the matrix, each a single dither pixel in its place in the tile, painted by the class `ink`. */
function bayerPatterns(name: string, ink: string, levels: number): string {
  let out = ''
  for (let y = 0; y < MATRIX; y += 1) {
    for (let x = 0; x < MATRIX; x += 1) {
      const level = BAYER[y]?.[x] ?? 0
      // At its real size, a tile of 40 units with one 5-unit dot: a tiny tile magnified forty times smears in the app.
      if (level < levels) out += `<pattern id="${name}${level}" width="${TILE}" height="${TILE}" patternUnits="userSpaceOnUse"><path d="M${x * CELL} ${y * CELL}h${CELL}v${CELL}h-${CELL}z" class="${ink}"/></pattern>`
    }
  }
  return out
}

/** Hex to OKLCH, for colours written relative to the text colour. */
function oklchOf(hex: string): string {
  const n = parseInt(hex.slice(1), 16)
  const lin = (v: number) => ((v /= 255) <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)
  const [r, g, b] = [lin((n >> 16) & 255), lin((n >> 8) & 255), lin(n & 255)]
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b)
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b)
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b)
  const L = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s
  const A = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s
  const B = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s
  const hue = ((Math.atan2(B, A) * 180) / Math.PI + 360) % 360
  return `${L.toFixed(3)} ${Math.hypot(A, B).toFixed(3)} ${hue.toFixed(1)}`
}

/** A hex colour mixed toward another by `t`. */
function mix(from: string, to: string, t: number): string {
  const a = parseInt(from.slice(1), 16)
  const b = parseInt(to.slice(1), 16)
  const channel = (shift: number) => Math.round(((a >> shift) & 255) * (1 - t) + ((b >> shift) & 255) * t)
  return `#${((channel(16) << 16) | (channel(8) << 8) | channel(0)).toString(16).padStart(6, '0')}`
}

/**
 * Dither Dunes with its sun `day` through the context (0 to 1) and the share of the context window `left` (a whole percent)
 * written in its sand, every colour at the opacity `fade` (a CSS expression in `l`, the lightness of the text colour), or solid
 * without one.
 */
export function ditherDunesSvg(day = 0, fade?: string, left?: number, page?: string): string {
  const t = Math.min(1, Math.max(0, day))
  const sun = mix(DAY.sun, DAY.dusk, smoothstep(0.6, 1, t))
  const paint = (hex: string) => (fade === undefined ? hex : `oklch(from currentColor ${oklchOf(hex)} / ${fade})`)
  const ink: Record<string, string> = { up: DAY.paper, uih: DAY.haze, uis: DAY.soft, uik: DAY.strong, ulee: DAY.lee, usun: sun, ug: DAY.soft }
  DAY.sands.forEach((sand, index) => (ink[`ud${index}`] = sand))
  const stroked = new Set(['ulee', 'usun'])
  const style = Object.entries(ink)
    .map(([name, hex]) => (stroked.has(name) ? `.${name}{fill:none;stroke:${paint(hex)};stroke-width:${CELL}px}` : `.${name}{fill:${paint(hex)}}`))
    .join('')
  const groove = `.uw{fill:none;stroke:${paint(DAY.strong)};stroke-width:5px}`
  const land = left === undefined ? still().land : still().land.replace(SAND, `<g id="usand">${sandNumber(left)}</g>`)
  // Under the paper, the page a light window shows: the app's own, solid.
  const under = page === undefined ? '' : `<rect width="${WIDTH}" height="${HEIGHT}" fill="${page}"/>`
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${WIDTH} ${HEIGHT}" width="100%" height="100%" preserveAspectRatio="xMidYMid slice"><style>${style}${groove}</style>${still().defs}${under}<rect width="${WIDTH}" height="${HEIGHT}" class="up"/>${still().sky}${sunPart(t)}${land}</svg>`
}

/** What does not move with the context, built once: it takes the matrix a while to lay. */
let built: { defs: string; sky: string; land: string } | undefined
function still(): { defs: string; sky: string; land: string } {
  built ??= {
    defs: '',
    sky: skyLayers(),
    land: DUNES.map((dune, index) => dunePart(dune, index)).join('') + grainsPart(),
  }
  return built
}
