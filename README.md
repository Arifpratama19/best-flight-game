# Best Flight Game

[![make.fun](https://make.fun/badge/best-flight-game-20261126-0057.svg)](https://make.fun/bounty/best-flight-game-20261126-0057)
[![Rank](https://make.fun/badge/best-flight-game-20261126-0057/Arifpratama19/best-flight-game/rank.svg)](https://make.fun/bounty/best-flight-game-20261126-0057)
[![Reward](https://make.fun/badge/best-flight-game-20261126-0057/Arifpratama19/best-flight-game/reward.svg)](https://make.fun/bounty/best-flight-game-20261126-0057)

A complete, original flight game for the [make.fun "Make the best flight game" bounty](https://make.fun/bounty/best-flight-game-20261126-0057).

Fly through target rings, land on runways, manage fuel and throttle, and chase the best score — all in a desktop browser, from static files, with no network request.

## Play

Open `game/index.html` in desktop Chrome and fly with the keyboard and mouse.

## Layout

- `main.ts` — hands the game in (copies `game/` and `screenshots/` to `/output`, writes `dossier.json`)
- `vendor/makefun-game.ts` — kit library, unchanged
- `game/` — the playable game as static files
- `screenshots/` — real renders of the game

## License

MIT
