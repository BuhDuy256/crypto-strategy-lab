# Demo screenshots

These are real screenshots taken from a clean `docker compose up --build -d` run of
this repository, following the same walkthrough as
[`docs/demo-script.md`](../../demo-script.md). Every number, chart, and table shown
here is live output from the running system, not a mockup.

A full recorded video walkthrough is provided separately by the team; these
screenshots exist as a quick, clickable way to see the same flow without watching
a video.

| # | File | What it shows |
|---|---|---|
| 1 | [`01-realtime.png`](01-realtime.png) | Realtime page: four BTC/USDT charts streaming live at 5m, 15m, 1h, 4h. |
| 2 | [`02-strategy-engine-configured.png`](02-strategy-engine-configured.png) | Strategy Engine: two strategies (Moving average crossover, RSI) added as components of a new composite, with their parameters and combination policy set. |
| 3 | [`03-strategy-engine-saved.png`](03-strategy-engine-saved.png) | The composite saved successfully, with the ID the backend returned. |
| 4 | [`04-backtest-result.png`](04-backtest-result.png) | Backtest page: the saved composite run end to end, with metrics, the trade table, the annotated chart, and the run's provenance record expanded. |
| 5 | [`05-discovery-setup.png`](05-discovery-setup.png) | Discovery page: a search configured with composite size 2, two strategies in the pool, and a 10-candidate limit, about to start. |
| 6 | [`06-discovery-leaderboard.png`](06-discovery-leaderboard.png) | The finished search: progress counters and a leaderboard filled entirely with generated composite candidates, ranked by score. |
| 7 | [`07-discovery-provenance.png`](07-discovery-provenance.png) | The top leaderboard entry opened, showing its trades, chart, and its provenance checklist (dataset, specification, strategy, and so on, each marked recorded). |
| 8 | [`08-news.png`](08-news.png) | News page: sentiment distribution and the list of collected items. Collection is shown as "degraded" here because that was the real, live state of the news source at capture time, not a staged example. |
