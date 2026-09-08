# Still

A meditation timer that shows a slow visual instead of a countdown. Five scenes
— water filling a glass, a candle burning down, a fuse spiralling inward, a
sunset, an incense stick — and a zen mode that hides every trace of interface,
including the clock.

## Running it

Open `index.html`. That's the whole setup — no server, no build step, no
dependencies. It works straight off the filesystem.

If you want one file to host or hand to someone, run `node build.js`, which
inlines everything into `still.html`. You never need this to develop.

## Files

| File | What's in it |
| --- | --- |
| `index.html` | Markup and controls. Small — the scene buttons and duration buttons are generated in JS. |
| `still.css` | All styling, including zen mode (`body.zen`). |
| `still.js` | Utilities, timer state, canvas setup, audio, the render loop, the controls. |
| `scenes.js` | Geometry rebuilt on resize, then one draw function per scene. |
| `build.js` | Optional bundler. |

`still.js` and `scenes.js` load as two plain scripts sharing one global scope.
That's deliberate: scene code stays short, and you can poke at the running app
from the browser console — try `S.scene = 'fuse'` or `S.minutes = 1`.

## Two rules worth keeping

**Time comes from timestamps, never from counting frames.** Browsers stop
animation callbacks in background tabs and throttle timers, so anything derived
from a frame counter silently falls behind. Elapsed time is always
`Date.now() - S.startedAt`, and progress is recomputed from it every frame. This
is why you can switch tabs for twenty minutes, come back, and the candle is
exactly where it should be.

The completion chime follows from the same problem. It's scheduled on the Web
Audio clock, which keeps running when the tab is hidden — but scheduling two
hours ahead is more than that clock should be asked to hold, so `armLoop()`
waits until ten minutes remain and schedules precisely then. If arming never
runs at all, `finish()` rings immediately as a fallback.

**Every scene needs motion that isn't progress.** At 30 minutes the water level
rises about a pixel every few seconds; at two hours it may as well be frozen. So
each scene carries something that moves on its own — waves, flame flicker,
sparks, cloud drift, smoke. Without it the screen looks broken.

## Adding a scene

Four steps:

1. Write `drawMyScene(p, t, fin, dt)` in `scenes.js`.
2. Add any geometry it needs to `buildGeometry()`, which reruns on every resize.
3. Add `'myscene'` to `SCENES` in `still.js`.
4. Add a `case 'myscene': drawMyScene(p,t,fin,dt); break;` to the switch in `frame()`.

The button, the keyboard shortcut and the saved preference all follow from
`SCENES` automatically.

### The four arguments

| | | |
| --- | --- | --- |
| `p` | `0..1` | How far through the session. Drives whatever depletes. |
| `t` | seconds | Free-running clock. Drives idle motion — never progress. |
| `fin` | seconds | Time since the timer finished, or `null` while running. |
| `dt` | seconds | Since the last frame, capped at 50ms. For particles. |

Use `p` for anything that must survive a hidden tab, and `t` or `dt` for
anything that just needs to keep moving. The distinction matters: if you
accumulate a value with `dt` each frame, it will be wrong after the tab sleeps.
The snow scene in an earlier version had exactly this bug — the drift depth is
now derived from `p`, with landed flakes only adding local texture on top.

Call `resetSceneMemory()` when clearing particle arrays; it runs on scene
switches and on reset.

### Useful helpers

`clamp`, `lerp`, `ease` (smoothstep), `rnd(a,b)`, `mixc(colA, colB, t)` for
blending `[r,g,b]` arrays, and `rgb(col, alpha)` to turn one into a CSS string.
`smoke(x, y, t, opts)` draws a wavering ribbon — the candle and incense both use
it.

## Controls

Space begins and pauses. `Z` toggles zen, Escape leaves it, `R` resets, `1`–`5`
switch scenes, and `P` runs a 30-second preview — the fastest way to judge a
scene you're working on without sitting through a real session.

Zen mode engages automatically 2.4 seconds after you begin. Tap anywhere or
press Escape to leave it. Scene and duration are saved to `localStorage`;
switching scenes mid-session deliberately does not touch the clock.

## Things that might surprise you

The candle's flicker is a damped random walk rather than a sine wave — sine
reads as mechanical the moment you look at it directly.

The fuse's spiral is precomputed with cumulative arc lengths, so mapping
progress to distance-along-the-path gives a constant burn speed. Without that
the flame races through the tight inner turns.

The water surface is two sine waves at different speeds and wavelengths. The
interference between them is what stops it reading as a progress bar.

There's a wake lock request so the screen doesn't sleep mid-session. It's
re-requested on `visibilitychange`, because the browser drops it when you tab
away.
