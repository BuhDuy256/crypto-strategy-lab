  return (
    <section className="discovery-page">
      <div className="page-heading">
        <div>
          <h1>Discovery</h1>
          <p>Automatically generate, backtest, and rank candidate strategies.</p>
        </div>
      </div>

      <div className="stacked-sections">
        <section className="panel" aria-labelledby="search-setup-heading">
          <header className="panel-header">
            <div>
              <h2 id="search-setup-heading">Search configuration</h2>
              <p>Choose the market window, the search method, the strategy pool, and the limits</p>
            </div>
          </header>
          <div className="panel-body">
            <section className="form-section">
              <h3 className="section-title"><span className="step">1</span> Search setup</h3>
              <div className="field-grid field-grid-3">
                <label className="field">
                  <span className="field-label">Timeframe</span>
                  <select
                    aria-label="Timeframe"
                    value={timeframe}
                    onChange={(e) => handleTimeframeChange(e.target.value as ApiTimeframe)}
                  >
                    {API_TIMEFRAMES.map((tf) => (
                      <option key={tf} value={tf}>{tf}</option>
                    ))}
                  </select>
                </label>
                <label className="field">
                  <span className="field-label">Search method</span>
                  <select
                    aria-label="Search method"
                    value={generatorId}
                    onChange={(e) => setGeneratorId(e.target.value)}
                  >
                    {generators.map((g) => (
                      <option key={g.id} value={g.id}>{g.name}</option>
                    ))}
                  </select>
                </label>
                <label className="field">
                  <span className="field-label">Start date</span>
                  <input
                    aria-label="Start date"
                    type="date"
                    value={toDateInputValue(startTime)}
                    onChange={(e) => {
                      const parsed = fromDateInputValue(e.target.value, "start");
                      if (parsed !== null) setStartTime(alignToCandleOpen(parsed, timeframe));
                    }}
                  />
                </label>
                <label className="field">
                  <span className="field-label">End date</span>
                  <input
                    aria-label="End date"
                    type="date"
                    value={toDateInputValue(endTime)}
                    onChange={(e) => {
                      const parsed = fromDateInputValue(e.target.value, "end");
                      if (parsed !== null) setEndTime(alignToCandleOpen(parsed, timeframe));
                    }}
                  />
                </label>
                <label className="field">
                  <span className="field-label">Composite size</span>
                  <input
                    aria-label="Composite size"
                    type="number"
                    min={1}
                    value={compositeSize}
                    onChange={(e) => setCompositeSize(Math.max(1, Number(e.target.value)))}
                  />
                  <span className="field-hint">
                    {compositeSize > 1
                      ? `Each candidate combines ${compositeSize} strategies by majority vote.`
                      : "Each candidate is a single strategy."}
                  </span>
                </label>
              </div>
            </section>

            <section className="form-section">
              <h3 className="section-title">
                <span className="step">2</span> Strategy pool
                <span className="section-count">{selectedStrategies.length}</span>
              </h3>
              <p className="section-note">
                The search draws candidates from the strategies checked here.
              </p>
              <fieldset className="strategy-pool">
                {strategies.map((s) => {
                  const checked = selectedStrategies.includes(s.id);
                  return (
                    <label key={s.id} className={checked ? "pool-option is-checked" : "pool-option"}>
                      <input
                        type="checkbox"
                        aria-label={s.name}
                        checked={checked}
                        onChange={(e) =>
                          setSelectedStrategies((current) =>
                            e.target.checked
                              ? [...current, s.id]
                              : current.filter((id) => id !== s.id)
                          )
                        }
                      />
                      <span>{s.name}</span>
                    </label>
                  );
                })}
              </fieldset>
            </section>

            <section className="form-section">
              <h3 className="section-title"><span className="step">3</span> Run limits</h3>
              <div className="field-grid field-grid-3">
                <label className="field">
                  <span className="field-label">Candidate limit</span>
                  <input
                    aria-label="Candidate limit"
                    type="number"
                    value={maxCandidates}
                    onChange={(e) => setMaxCandidates(Number(e.target.value))}
                  />
                  <span className="field-hint">Stop after this many candidates.</span>
                </label>
                <label className="field">
                  <span className="field-label">Max in flight</span>
                  <input
                    aria-label="Max in flight"
                    type="number"
                    value={maxInFlight}
                    onChange={(e) => setMaxInFlight(Number(e.target.value))}
                  />
                  <span className="field-hint">Backtests running at the same time.</span>
                </label>
                <label className="field">
                  <span className="field-label">Seed</span>
                  <input aria-label="Seed" value={seed} onChange={(e) => setSeed(e.target.value)} />
                  <span className="field-hint">Same seed, same candidates.</span>
                </label>
                <label className="field">
                  <span className="field-label">Time limit (minutes)</span>
                  <input
                    aria-label="Time limit"
                    type="number"
                    min={0}
                    value={maxDurationMs === 0 ? 0 : maxDurationMs / 60_000}
                    onChange={(e) =>
                      setMaxDurationMs(Math.max(0, Number(e.target.value)) * 60_000)
                    }
                  />
                  <span className="field-hint">0 means no time limit.</span>
                </label>
                <label className="field">
                  <span className="field-label">No-improvement stop</span>
                  <input
                    aria-label="No-improvement stop"
                    type="number"
                    min={0}
                    value={noImprovementIterations}
                    onChange={(e) => setNoImprovementIterations(Number(e.target.value))}
                  />
                  <span className="field-hint">0 means never stop early.</span>
                </label>
              </div>
            </section>

            <div className="run-actions">
              <button
                type="button"
                className="button-primary"
                onClick={() => void handleStart()}
                disabled={selectedStrategies.length === 0 || generatorId === ""}
              >
                Start Search
              </button>
              {selectedStrategies.length === 0 && (
                <span className="hint">Check at least one strategy to start a search.</span>
              )}
              {selectedStrategies.length > 0 && compositeSize > selectedStrategies.length && (
                <span className="hint">
                  Check at least {compositeSize} strategies to fill a composite of this size.
                </span>
              )}
            </div>

            {error !== null && <p className="banner banner-error" role="alert">{error}</p>}
          </div>
        </section>

        {progress !== null && (
          <section className="panel" aria-labelledby="progress-heading">
            <header className="panel-header">
              <div>
                <h2 id="progress-heading">Search progress</h2>
                <p>Live counts from the running experiment</p>
              </div>
              <div className="status-line">
                <span className="status-chip" data-status={progress.status}>
                  Status: {progress.status}
                </span>
                {progress.stopReason !== null && (
                  <span className="hint">Stopped: {progress.stopReason}</span>
                )}
              </div>
            </header>
            <div className="panel-body">
              <ul className="progress-counts">
                {[
                  ["Generated", progress.generated],
                  ["Submitted", progress.submitted],
                  ["Completed", progress.completed],
                  ["Failed", progress.failed],
                  ["Cancelled", progress.cancelled],
                  ["In flight", progress.inFlight]
                ].map(([label, value]) => (
                  <li key={String(label)} className="progress-count">
                    <span className="progress-count-label">{label}</span>
                    <span className="progress-count-value">{value}</span>
                  </li>
                ))}
              </ul>
              <div className="control-row">
                <button type="button" onClick={() => void handleControl(pauseSearch)} disabled={!canPause}>Pause</button>
                <button type="button" onClick={() => void handleControl(resumeSearch)} disabled={!canResume}>Resume</button>
                <button type="button" onClick={() => void handleControl(cancelSearch)} disabled={!canCancel}>Cancel</button>
              </div>
            </div>
          </section>
        )}

        {leaderboard !== null && (
          <section className="panel" aria-labelledby="leaderboard-heading">
            <header className="panel-header">
              <div>
                <h2 id="leaderboard-heading">Leaderboard</h2>
                <p>Best candidates found so far. Select a row to open its result.</p>
              </div>
              <label className="field">
                <span className="field-label">Sort by</span>
                <select
                  aria-label="Sort by"
                  value={sort}
                  onChange={(e) => void handleSortChange(e.target.value as LeaderboardSort)}
                >
                  {LEADERBOARD_SORTS.map((option) => (
                    <option key={option} value={option}>{option}</option>
                  ))}
                </select>
              </label>
            </header>
            <div className="panel-body">
              {entries.length === 0 ? (
                <p className="empty-state">No ranked candidates yet.</p>
              ) : (
                <div className="table-scroll">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Rank</th>
                        <th>Strategy</th>
                        <th className="numeric">Total return</th>
                        <th className="numeric">Win rate</th>
                        <th className="numeric">Max drawdown</th>
                        <th className="numeric">Trades</th>
                        <th className="numeric">Score</th>
                      </tr>
                    </thead>
                    <tbody>
                      {entries.map((entry) => (
                        <tr
                          key={entry.runId}
                          onClick={() => void openEntry(entry)}
                          aria-selected={selectedEntry?.runId === entry.runId}
                          className={
                            selectedEntry?.runId === entry.runId ? "clickable selected" : "clickable"
                          }
                        >
                          <td className="rank-cell">{entry.rank}</td>
                          <td className="strategy-cell">{describeStrategy(entry)}</td>
                          <td
                            className={
                              entry.metrics.totalReturn < 0
                                ? "numeric value-negative"
                                : "numeric value-positive"
                            }
                          >
                            {formatPercent(entry.metrics.totalReturn)}
                          </td>
                          <td className="numeric">{formatPercent(entry.metrics.winRate)}</td>
                          <td className="numeric">{formatPercent(entry.metrics.maximumDrawdown)}</td>
                          <td className="numeric">{entry.metrics.numberOfTrades}</td>
                          <td className="numeric">{formatNumber(entry.score)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </section>
        )}

        {selectedEntry !== null && (
          <section className="panel" aria-labelledby="entry-detail-heading">
            <header className="panel-header">
              <div>
                <h2 id="entry-detail-heading">Entry detail: rank {selectedEntry.rank}</h2>
                <p>{describeStrategy(selectedEntry)}</p>
              </div>
            </header>
            <div className="panel-body">
              <div className="chart-card">
                <CandlestickChart
                  state={chartState}
                  candles={detailCandles}
                  annotations={detailAnnotations}
                  trades={detailTradeRows}
                  selectedTradeId={null}
                />
              </div>

              <section className="form-section">
                <h3 className="subsection-title">Trades</h3>
                {detailTradeRows.length === 0 ? (
                  <p className="empty-state">No trades for this candidate.</p>
                ) : (
                  <div className="table-scroll">
                    <table className="data-table">
                      <thead>
                        <tr>
                          <th>Entry</th>
                          <th>Exit</th>
                          <th>Direction</th>
                          <th className="numeric">PnL</th>
                        </tr>
                      </thead>
                      <tbody>
                        {detailTradeRows.map((trade) => (
                          <tr key={trade.sequenceNumber}>
                            <td>{formatDateTime(trade.entryTime)}</td>
                            <td>{formatDateTime(trade.exitTime)}</td>
                            <td>
                              <span className={`direction-${trade.direction}`}>{trade.direction}</span>
                            </td>
                            <td
                              className={
                                trade.profitAndLoss < 0
                                  ? "numeric value-negative"
                                  : "numeric value-positive"
                              }
                            >
                              {formatMoney(trade.profitAndLoss)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </section>

              {detailProvenance !== null && (
                <details className="provenance">
                  <summary>Run provenance</summary>
                  <ul className="provenance-list">
                    {Object.entries(detailProvenance.checklist).map(([key, item]) => (
                      <li key={key}>
                        {key}: {item.status}
                      </li>
                    ))}
                  </ul>
                </details>
              )}
            </div>
          </section>
        )}
      </div>
    </section>
  );
}
