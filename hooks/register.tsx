import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, SessionContextUsage, ThemeBackdropGlass, Timer } from 'claude-code'

import type { Sky } from '../types'
import { BY_NIGHT, ditherDunesSvg } from './dither-dunes'
import { makeColors } from './make-colors.js'

// ---------------------------------------------------------------------------
// Behind every desktop session, whatever its folder: Dither Dunes Night (from Anthropic's theme-examples plugin,
// Apache License 2.0; see dither-dunes.ts) in a dark window; a light window shows the app's own page colour and nothing
// else. The colours are the app's own in both modes, as the original's are, but for the text, which keeps the warm
// tones chosen earlier: in a light window the darkest gray (the text, and the ink hovers and lines are a share of) a
// dark warm brown; in a dark one the three text grays warm creams and the ink a warm cream. Setting them all replaces
// whatever colours an earlier look left behind.
//
// The context keeps the time: the ember sun rises while the context is empty, stands highest when half of it is used
// and sets, redder, as it fills towards compaction, and the share of the context window left is written in the sand.
// ---------------------------------------------------------------------------

const PLUGIN = 'dunes-night'
const SCENE = 'dither-dunes-night'

/** A mode's whole gray ramp as the app has it, with `ink`'s stops warmed. */
function warmed(inputs: Record<string, string> | undefined, ink: Record<number, string>): Record<number, string> {
  const stops: Record<number, string> = {}
  for (const [name, hex] of Object.entries(inputs ?? {})) {
    if (name.startsWith('gray-')) {
      stops[Number(name.slice('gray-'.length))] = hex
    }
  }
  return { ...stops, ...ink }
}

const PLAIN = makeColors({ label: 'plain', light: {}, dark: {} }).theme.inputs
const { theme: COLORS } = makeColors({
  label: 'Dither Dunes Night',
  light: { gray: { stops: warmed(PLAIN.light, { 900: '#33180b' }) } },
  dark: { gray: { stops: warmed(PLAIN.dark, { 0: '#ffe9d5', 50: '#f8e2cf', 200: '#d4c0ad', 400: '#b29e8b' }) } },
})

/** The app's own light page colour (its surface-0), which a light window shows. */
const LIGHT_PAGE = '#f9f9f7'

// No glass at all: no blur, and no veil, whose fade at the conversation's edges banded into vertical stripes
// in these dark tones. The scene is printed in the tones it had under the veil instead (see dither-dunes.ts).
const GLASS: ThemeBackdropGlass = { blur: 0, opacity: 0 }

// The app does not draw the backdrop of a session it started in the background (at launch, for one) when that
// session is opened later. So until the window has asked for a backdrop, the look is offered again every twenty
// seconds, the glass a point apart every other time: a change the eye cannot see but the engine can, which makes the
// window ask for the scene once it shows the session. A window that asks for any backdrop ends it, and so does
// another theme or a clear.
const GLASS_AGAIN: ThemeBackdropGlass = { blur: 0, opacity: 0.01 }
const AGAIN_EVERY = 20_000
let again: Timer | undefined
let apart = false

function stopOffering(): void {
  again?.cancel()
  again = undefined
}

function keepOffering($: EngineInterface): void {
  stopOffering()
  apart = false
  again = $.clock.every(AGAIN_EVERY, () => {
    apart = !apart
    $.theme.set({ colors: COLORS, backdrop: { scene: SCENE, glass: apart ? GLASS_AGAIN : GLASS } }).catch(() => {
      // Not offered this time: the next tick tries again.
    })
  })
}

// Where the scene stands in the context: the sun's step in twentieths, and the whole percent of the window left. The
// scene is drawn again only when either moves, since a new drawing starts the motion over.
const STEPS = 20
const sky = atom({ plugin: 'dunes-night', key: 'sky' } as const, { step: 0, left: 100 } as Sky)

// The drawings made so far, by step and percent left; the oldest go once there are more.
const scenes = new Map<string, string>()
const KEPT = 40

// The token count the sun sets at, kept for the window it was read for.
let horizon: { window: number; tokens: number } | undefined

/** Where the session auto-compacts, or its whole window where it never does or cannot say. */
async function horizonOf($: EngineInterface, window: number): Promise<number> {
  if (horizon?.window === window) {
    return horizon.tokens
  }

  try {
    const { breakdown } = (await $.session.usage({ breakdown: 'summary' })).context
    const compactsAt = breakdown?.isAutoCompactEnabled === true ? breakdown.autoCompactThreshold : undefined
    const tokens = compactsAt !== undefined && compactsAt > 0 ? Math.min(compactsAt, window) : window
    horizon = { window, tokens }

    return tokens
  } catch {
    // No breakdown to be had now: the whole window stands in, and the next measurement asks again.
    return window
  }
}

/** Puts the sun and the writing where the context stands, writing only when either moves. */
async function follow($: EngineInterface, context: SessionContextUsage): Promise<void> {
  const used = context.tokens ?? 0
  const fill = used > 0 ? used / (await horizonOf($, context.window)) : 0
  const step = Math.round(Math.min(1, Math.max(0, fill)) * STEPS)
  const percent = used > 0 ? (context.percent ?? (used / context.window) * 100) : 0
  const left = Math.min(100, Math.max(0, Math.round(100 - percent)))
  const now = await read($, sky)

  if (now.step !== step || now.left !== left) {
    await update($, sky, () => ({ step, left }))
  }
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    try {
      await $.theme.set({ colors: COLORS, backdrop: { scene: SCENE, glass: GLASS } })
      keepOffering($)
    } catch {
      // No backdrop for this session: it keeps the app's own look.
    }

    // A resumed chat, or this mod reloaded mid-chat, starts where the context already is.
    try {
      await follow($, (await $.session.usage()).context)
    } catch {
      // The context could not be read now: the next measurement moves the scene.
    }

    return next(e)
  })

  // Another theme, or none: the look is not offered again over it.
  on('theme.set', ($, e, next) => {
    if ((e.backdrop as { scene?: string } | undefined)?.scene !== SCENE) {
      stopOffering()
    }

    return next(e)
  })
  on('theme.clear', ($, e, next) => {
    stopOffering()

    return next(e)
  })

  // After each turn: the fill the status line shows, pushed here.
  on('session.measure', async ($, e, next) => {
    if (e.changed.includes('context')) {
      try {
        await follow($, e.context)
      } catch {
        // The scene stays where it was until the next measurement.
      }
    }

    return next(e)
  })

  // Only the desktop window has room behind the chat; another plugin's scene is left to that plugin.
  on('ui.render', { component: 'Backdrop' }, async ($, e, next) => {
    if (e.surface === 'desktop') {
      stopOffering()
    }

    if (e.surface !== 'desktop' || e.props.plugin !== PLUGIN || e.props.scene !== SCENE) {
      return next(e)
    }

    const { Svg } = $.ui.resolve(e)
    const { step, left } = await read($, sky)
    const key = `${step}:${left}`
    let source = scenes.get(key)

    if (source === undefined) {
      source = ditherDunesSvg(step / STEPS, BY_NIGHT, left, LIGHT_PAGE)
      scenes.set(key, source)
      if (scenes.size > KEPT) {
        scenes.delete(scenes.keys().next().value as string)
      }
    }

    const alt = `In a dark window, Dither Dunes Night: pale one-bit dunes on umber paper under an ember sun, ${(step / STEPS) * 100}% across its sky as this chat's context fills, with ${left}% of the context window left written in the sand.`

    return <Svg alt={alt} source={source} />
  })
}
