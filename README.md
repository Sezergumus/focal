# Focal: The Gentle Observatory

A calm daily puzzle collection. You keep a quiet coastal lighthouse, and every day the wind, the sea and the sky drift slightly out of tune. Eight small instruments, one puzzle each, bring them back. Finish all eight to seal the day's logbook.

There are no timers, no sirens and no failures. A wrong move only sends a small ripple across the water.

## The eight instruments

| # | Instrument | What you do |
|---|------------|-------------|
| 01 | **Balance** | Place counterweights so the swaying tower comes to rest |
| 02 | **Sonar** | Find the hidden boats with row/column clues and two pings |
| 03 | **Resonance** | Balance crests and troughs in every row and column |
| 04 | **Echo** | Listen to an echo and hold a pad for the same length of silence |
| 05 | **Prism** | Turn mirrors to guide a sunbeam to every crystal |
| 06 | **Knot** | Drag stars until no threads cross |
| 07 | **Circuit** | Rotate pipes so current lights every lantern without leaking |
| 08 | **Spectrum** | Order seven vials by their hidden pitch, lowest to highest |

Echo and Spectrum are solved by ear, so the ambient music box fades out while they are open.

## How it works

- **Daily puzzles** are seeded from the calendar date, so everyone gets the same set on the same day. A new one arrives at local midnight.
- **Archive mode** draws a random past sky from the archive, as many times as you like.
- **Progress** is saved in the browser's `localStorage`. There are no accounts, no backend and no analytics.
- **Sound** is generated live with the Web Audio API. There are no audio files.

## Run it locally

Requires Node.js. There are no dependencies and no build step.

```bash
npm start
```

Then open http://localhost:8080 (set `PORT` to change it). Any static file server works as well.

## Install it as an app (PWA)

Focal is an installable progressive web app and works offline after the first visit.

- **Android / desktop Chrome and Edge:** use the install icon in the address bar, or menu → *Install app*.
- **iPhone / iPad:** open it in Safari, tap Share → *Add to Home Screen*.

The service worker ([sw.js](sw.js)) fetches from the network first and falls back to its cache when offline, so new deploys show up straight away. If you add or rename files, update the `SHELL` list in `sw.js`.

## Deploy

It is a static site. Import the repo in Vercel with no framework, no build command and no output directory. [vercel.json](vercel.json) enables clean URLs and keeps `sw.js` from being cached.

## Project layout

```
index.html              page markup and the hub
styles.css              all styling
manifest.webmanifest    PWA manifest
sw.js                   service worker
icons/                  PWA icons
js/observatory-main.js  hub, navigation, daily progress, modals
js/observatory-audio.js sound effects and the ambient music box
js/atmosphere.js        sky colours that follow the time of day
js/rng.js               seeded random numbers and daily/archive seeds
js/game-*.js            one file per instrument
js/icons.js             inline SVG icon set
server.js               tiny local dev server
story.md                the story behind the game
```

## Story

See [story.md](story.md) for the premise and the daily routine of the Observer.
