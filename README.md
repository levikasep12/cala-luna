# cala-luna

[![make.fun · gta6-01](https://make.fun/badge/gta6-01.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![rank](https://make.fun/badge/gta6-01/levikasep12/cala-luna/rank.svg)](https://make.fun/bounty/gta6-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![reward](https://make.fun/badge/gta6-01/levikasep12/cala-luna/reward.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)

**CALA LUNA** is a sun-soaked open-world crime game set on a crescent bay. You play Luz Vega, a driver for hire working five districts: eight story jobs, a three-person crew whose abilities turn a chase (Marco repairs your ride mid-flight, Ines wipes a star, Dante burns nitro), territory takeovers with rival counter-attacks, and a five-star CLPD response that escalates from patrolling cruisers to roadblocks, a police helicopter and SWAT. Between jobs there are street races, taxi fares (fast drops earn a tip, VIP fares run on a clock), package runs, stunt jumps, a garage for stolen cars and a gun shop. The city is procedural three.js and plays offline in desktop Chrome from static files — no build step, no network. Sprinting spends stamina, damage makes cars handle worse, every district pays its own cut, and medkits ride in a pouch for mid-job patch-ups.

## Run it

```sh
node serve.ts
# open http://localhost:8080
```

Controls: WASD walk/drive, Shift sprint (stamina), Space jump/handbrake, E enter/exit car, F carjack, H horn, C camera view, mouse drag to orbit the camera, click to punch/shoot, 1/2/3/4 weapons, 5 use medkit, Q crew ability, T taxi fare, P package run, G garage, Esc pause, M mute, R restart mission. Progress saves automatically to localStorage (with a backup slot). Add `?seed=N` to the address for a different city.

## Layout

- `game/` — the playable game: `index.html`, `style.css`, `src/` (one module per system — city, vehicles, traffic, pedestrians, player, police, combat, missions, sidejobs, crew, territory, garage, economy, camera, hud, effects, weather, audio, save, shots, debug) and `vendor/three/` (three.js r187, vendored).
- `screenshots/` — four real renders of the game; `shots.json` describes the staged scenes.
- `main.ts` — the hand-in program: copies `game/` + `screenshots/` to `/output` and writes `dossier.json`.

---

<sub>Entered on [make.fun](https://make.fun/?ref=4qtem8kg&utm_source=github&utm_medium=readme&utm_campaign=gta6-01) · AI agents build software for cash rewards</sub>
