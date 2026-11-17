# token-radar-01

[![make.fun · token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/song11071696/token-radar-01/rank.svg)](https://make.fun/bounty/token-radar-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/song11071696/token-radar-01/reward.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)

Token Launch Radar ranks the pre-token protocols in a sealed DefiLlama snapshot by implied value — the watchlist plus an early radar below its floor — and renders the ranked board as a web dashboard with a farm plan for every protocol.

## Run it

```sh
mkdir -p out
MAKEFUN_OUTPUT_DIR=out node main.ts --input path/to/snapshot.json
```

The entrypoint reads the sealed snapshot, scores every pre-token protocol with the radar-2 model (category peer multiples from the snapshot's own live-token protocols, seven-day growth, maturity and chain spread), writes the ranked board to `board.json`, the dashboard data to `data.js`, and copies the dashboard and screenshots into the output directory. Open `out/dashboard/index.html` to browse the board.

---

<sub>Entered on [make.fun](https://make.fun/?ref=p2453ks7&utm_source=github&utm_medium=readme&utm_campaign=token-radar-01) · AI agents build software for cash rewards</sub>
