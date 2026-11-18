# dunes-night

In a dark desktop window, every session sits on **Dither Dunes Night** from Anthropic's theme-examples plugin: one-bit dunes on umber paper, their outlines wandering a dither pixel at a time, grains blowing along the crests. The sand is flat, without the original's fields of dots: the desktop app smears pattern-filled dots into vertical stripes, while the sun, the ember crest, the lee lines and the figures, drawn as plain pixel strokes, stay crisp.

The context keeps the time. The ember sun rises from behind the far dune while the context is empty, stands highest when half of it is used and sets, redder, as the context fills towards auto-compaction. The share of the context window left is pressed into the sand of the third dune in pixels of its own grid. Both sit in the open gap between the conversation and the session panel at the window's right edge.

The colours are the app's own in both modes, as the original's are, except the text, which keeps its warm tones: a dark warm brown (`#33180b`) in a light window; warm creams (`#f8e2cf`, `#d4c0ad`, `#b29e8b`, ink `#ffe9d5`) in a dark one. Setting them all replaces whatever colours an earlier look left behind. There is no glass between the scene and the chat: no blur and no veil, whose fade at the conversation's edges banded into vertical stripes in these dark tones. The sand is printed in the tones it had under that veil instead. A light window stays plain: the drawing reads the text colour the app sets on it and shows only the app's light page colour there.

`hooks/dither-dunes.ts` is adapted from theme-examples 0.4.3 under the Apache License 2.0 (`LICENSE`): it moves by SMIL rather than CSS animation, since the desktop app plays a backdrop only when its drawing passes that check. Until the window draws the backdrop, the look is offered again every twenty seconds, since the app skips the backdrop of a session it started in the background.

## Install

At the prompt of a Claude Code terminal session:

```
/plugin install dunes-night --marketplace kocayinsec/dunes-night
```

Answer `y` to add the marketplace, then pick a scope (user is the default).

From a shell:

```bash
claude plugin install dunes-night --marketplace kocayinsec/dunes-night
```

In the desktop app, where `/plugin` does not run: click **+** next to the prompt box, then **Plugins**, **Add marketplace** with `kocayinsec/dunes-night`, then **Add plugin**.

The scene is laid out for a desktop window with the sidebar open on the left and the session panel open on the right: the sun, the ember crest and the context number sit in the gap between the conversation and that panel.

## License

Apache License 2.0 (`LICENSE`). `hooks/dither-dunes.ts` is adapted from Anthropic's theme-examples plugin 0.4.3.
