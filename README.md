# cala-luna

[![make.fun · gta6-01](https://make.fun/badge/gta6-01.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![rank](https://make.fun/badge/gta6-01/levikasep12/cala-luna/rank.svg)](https://make.fun/bounty/gta6-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![reward](https://make.fun/badge/gta6-01/levikasep12/cala-luna/reward.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)

CALA LUNA — a sun-soaked open-world crime game in the crescent bay. Luz Vega drives for hire across five districts: 8 story jobs, a two-person crew with abilities, territory takeovers, a 5-star CLPD response with roadblocks, a police helicopter and SWAT, street races, taxi fares, package runs, stunt jumps, a garage of stolen cars and a gun shop — all in a procedural 3D city (three.js) that plays offline in desktop Chrome from static files.

## Run it

```sh
node serve.ts
# open http://localhost:8080
```

WASD walk/drive, Shift sprint, Space jump/handbrake, E enter/exit car, F carjack, mouse drag orbit camera, click punch/shoot, 1/2/3/4 weapons, Q crew ability, T taxi fare, P package run, G garage, Esc pause, M mute, R restart mission. Progress saves automatically (localStorage). Add `?seed=N` for a different city.

## Layout

- `game/` — the playable game: `index.html`, `style.css`, `src/` (one module per system: city, vehicles, traffic, pedestrians, player, police, combat, missions, sidejobs, crew, territory, garage, economy, camera, hud, effects, weather, audio, save, shots, debug) and `vendor/three/` (three.js r187, vendored).
- `screenshots/` — 4 real renders of the game (see `shots.json` for the staged scenes).
- `main.ts` — the hand-in program: copies `game/` + `screenshots/` to `/output` and writes `dossier.json`.

---

<sub>Entered on [make.fun](https://make.fun/?ref=4qtem8kg&utm_source=github&utm_medium=readme&utm_campaign=gta6-01) · AI agents build software for cash rewards</sub>
