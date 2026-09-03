  return (
    <section className="backtest-page">
      <div className="page-heading">
        <div>
          <h1>Backtest</h1>
          <p>Run one strategy over a window of normalized BTCUSDT history and read its result.</p>
        </div>
      </div>

      <div className="stacked-sections">
        <section className="panel" aria-labelledby="backtest-configuration-heading">
          <header className="panel-header">
            <div>
              <h2 id="backtest-configuration-heading">Configuration</h2>
              <p>Choose the data window, then the strategy to run over it</p>
            </div>
          </header>
          <div className="panel-body">
            <section className="form-section">
              <h3 className="section-title"><span className="step">1</span> Data</h3>
              <div className="field-grid field-grid-3">
                <label className="field">
                  <span className="field-label">Symbol</span>
                  <select
                    value={symbol}
                    onChange={(event) => setSymbol(event.target.value as Symbol)}
                  >
                    {SYMBOLS.map((option) => (
                      <option key={option} value={option}>{option}</option>
                    ))}
                  </select>
                </label>
                <label className="field">
                  <span className="field-label">Timeframe</span>
                  <select
                    value={timeframe}
                    onChange={(event) => handleTimeframeChange(event.target.value as ApiTimeframe)}
                  >
                    {API_TIMEFRAMES.map((option) => (
                      <option key={option} value={option}>{option}</option>
                    ))}
                  </select>
                </label>
                <label className="field">
                  <span className="field-label">Start date</span>
                  <input
                    type="date"
                    value={toDateInputValue(range.startTime)}
                    onChange={(event) => {
                      const parsed = fromDateInputValue(event.target.value, "start");
                      if (parsed !== null) {
                        setRange((current) => ({
                          ...current,
                          startTime: alignToCandleOpen(parsed, timeframe)
                        }));
                      }
                    }}
                  />
                </label>
                <label className="field">
                  <span className="field-label">End date</span>
                  <input
                    type="date"
                    value={toDateInputValue(range.endTime)}
                    onChange={(event) => {
                      const parsed = fromDateInputValue(event.target.value, "end");
                      if (parsed !== null) {
                        setRange((current) => ({
                          ...current,
                          endTime: alignToCandleOpen(parsed, timeframe)
                        }));
                      }
                    }}
                  />
                </label>
              </div>
            </section>

            <section className="form-section">
              <h3 className="section-title"><span className="step">2</span> Strategy</h3>
              {catalogError !== null ? (
                <p className="banner banner-error" role="alert">
                  Could not load the strategy catalog: {catalogError}
                </p>
              ) : (
                <div className="field-grid field-grid-3">
                  <label className="field">
                    <span className="field-label">Strategy</span>
                    <select
                      value={strategyId ?? ""}
                      disabled={strategies.length === 0}
                      onChange={(event) => handleStrategyChange(event.target.value)}
                    >
                      {strategies.length === 0 && <option value="">Loading strategies...</option>}
                      {strategies.map((descriptor) => (
                        <option key={descriptor.id} value={descriptor.id}>{descriptor.name}</option>
                      ))}
                    </select>
                  </label>
                </div>
              )}
              {compositeCatalogError !== null && (
                <p className="banner banner-error" role="alert">
                  Could not load saved composites: {compositeCatalogError}
                </p>
              )}

              {selectedStrategy !== null && (
                <>
                  <h4 className="subsection-title">Parameters</h4>
                  <GenericParameterForm
                    schema={selectedStrategy.parameterSchema}
                    values={parameters}
                    onChange={handleParametersChange}
                  />
                </>
              )}
            </section>

            <div className="run-actions">
              <button
                type="button"
                className="button-primary"
                onClick={() => void handleStart()}
                disabled={starting || selectedStrategy === null}
              >
                Start Backtest
              </button>
              {run !== null && (
                <span className="status-chip" data-status={run.status}>Status: {run.status}</span>
              )}
            </div>
            {startError !== null && (
              <p className="banner banner-error" role="alert">
                Could not start the backtest: {startError}
              </p>
            )}
            {result?.status === "failed" && (
              <p className="banner banner-error" role="alert">Error: {result.failureReason}</p>
            )}
            {runError !== null && (
              <p className="banner banner-error" role="alert">Could not read the run: {runError}</p>
            )}
          </div>
        </section>

        {completed !== null && (
          <section className="panel" aria-labelledby="backtest-result-heading">
            <header className="panel-header">
              <div>
                <h2 id="backtest-result-heading">Result</h2>
                <p>Every number below is computed and stamped by the backend</p>
              </div>
            </header>
            <div className="panel-body">
              <div className="metric-grid">
                <div
                  className="metric-card"
                  data-tone={completed.metrics.totalReturn < 0 ? "negative" : "positive"}
                >
                  <span className="metric-label">Total return</span>
                  <span className="metric-value">{formatPercent(completed.metrics.totalReturn)}</span>
                </div>
                <div className="metric-card">
                  <span className="metric-label">Win rate</span>
                  <span className="metric-value">{formatPercent(completed.metrics.winRate)}</span>
                </div>
                <div className="metric-card" data-tone="negative">
                  <span className="metric-label">Max drawdown</span>
                  <span className="metric-value">
                    {formatPercent(completed.metrics.maximumDrawdown)}
                  </span>
                </div>
                <div className="metric-card">
                  <span className="metric-label">Trades</span>
                  <span className="metric-value">{completed.metrics.numberOfTrades}</span>
                </div>
              </div>

              <section className="form-section">
                <h3 className="subsection-title">Trades</h3>
                {trades === null ? (
                  <p role="status">Loading trades...</p>
                ) : trades.trades.length === 0 ? (
                  <p className="empty-state">No trades executed.</p>
                ) : (
                  <div className="table-scroll">
                    <table className="data-table">
                      <thead>
                        <tr>
                          <th>Entry time</th>
                          <th className="numeric">Entry price</th>
                          <th>Exit time</th>
                          <th className="numeric">Exit price</th>
                          <th>Direction</th>
                          <th className="numeric">Entry fee</th>
                          <th className="numeric">Exit fee</th>
                          <th className="numeric">Slippage</th>
                          <th className="numeric">PnL</th>
                        </tr>
                      </thead>
                      <tbody>
                        {trades.trades.map((trade) => (
                          <tr
                            key={trade.sequenceNumber}
                            onClick={() => handleTradeClick(trade.sequenceNumber)}
                            aria-selected={selectedTradeId === trade.sequenceNumber}
                            className={
                              selectedTradeId === trade.sequenceNumber
                                ? "clickable selected"
                                : "clickable"
                            }
                          >
                            <td>{formatDateTime(trade.entryTime)}</td>
                            <td className="numeric">{formatMoney(trade.entryPrice)}</td>
                            <td>{formatDateTime(trade.exitTime)}</td>
                            <td className="numeric">{formatMoney(trade.exitPrice)}</td>
                            <td>
                              <span className={`direction-${trade.direction}`}>
                                {trade.direction}
                              </span>
                            </td>
                            <td className="numeric">{formatMoney(trade.entryFee)}</td>
                            <td className="numeric">{formatMoney(trade.exitFee)}</td>
                            <td className="numeric">{formatMoney(trade.slippage)}</td>
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
                <div className="table-footer">
                  <button
                    type="button"
                    disabled={page === 1}
                    onClick={() => setPage((current) => current - 1)}
                  >
                    Prev
                  </button>
                  <span>Page {page} of {totalPages}</span>
                  <button
                    type="button"
                    disabled={page >= totalPages}
                    onClick={() => setPage((current) => current + 1)}
                  >
                    Next
                  </button>
                  {selectedTradeId !== null && (
                    <button type="button" onClick={() => setSelectedTradeId(null)}>
                      Clear selection
                    </button>
                  )}
                </div>
              </section>

              <section className="form-section">
                <h3 className="subsection-title">Execution assumptions</h3>
                <ul className="provenance-list">
                  <li>
                    <span className="provenance-term">Initial capital</span>
                    {formatMoney(completed.executionAssumptions.initialCapital)}
                  </li>
                  <li>
                    <span className="provenance-term">Fee rate</span>
                    {formatPercent(completed.executionAssumptions.feeRate, 4)}
                  </li>
                  <li>
                    <span className="provenance-term">Slippage rate</span>
                    {formatPercent(completed.executionAssumptions.slippageRate, 4)}
                  </li>
                  <li>
                    <span className="provenance-term">Fill rule</span>
                    {completed.executionAssumptions.fillRule}
                  </li>
                  <li>
                    <span className="provenance-term">Signal timing</span>
                    {completed.executionAssumptions.signalTiming}
                  </li>
                </ul>
              </section>

              <details className="provenance">
                <summary>Run provenance</summary>
                <ul className="provenance-list">
                  <li>
                    <span className="provenance-term">Specification</span>
                    <span className="provenance-value" title={completed.specId}>
                      {truncateHash(completed.specId)}
                    </span>
                  </li>
                  <li>
                    <span className="provenance-term">Specification hash</span>
                    <span className="provenance-value" title={completed.specificationHash}>
                      {truncateHash(completed.specificationHash)}
                    </span>
                  </li>
                  <li>
                    <span className="provenance-term">Metric set</span>
                    <span className="provenance-value">
                      {completed.metricSet.id} {completed.metricSet.version}
                    </span>
                  </li>
                </ul>
              </details>
            </div>
          </section>
        )}

        <div className="chart-card">
          <div className="chart-title">
            <strong>{symbol}</strong>
            <span>Binance · {timeframe} · selected window</span>
          </div>
          <CandlestickChart
            state={chartState}
            candles={candles}
            annotations={completed?.annotations ?? []}
            trades={trades?.trades ?? []}
            selectedTradeId={selectedTradeId}
            errorMessage={chartError}
          />
        </div>
      </div>
    </section>
  );
}
