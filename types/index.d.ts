// What this mod keeps for the session: where its scene stands in the chat's context.

/** How far the sun has crossed its sky, in twentieths of the context (0 a fresh chat, 20 a full one), and the whole percent of the context window left, written in the sand. */
export type Sky = { step: number; left: number }

declare module 'claude-code' {
  interface PluginState {
    'dunes-night': { sky: Sky }
  }
}
