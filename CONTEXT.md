# Crypto Strategy Lab

This glossary fixes the project-specific language used to describe reproducible
market datasets and executable trading strategies.

## Language

**Logical candle**:
A provider, symbol, timeframe, and open-time identity whose corrected values appear
as immutable local revisions.
_Avoid_: Kline row, Binance candle

**Revision watermark**:
A global ingest boundary that defines which committed candle revisions belong to a
dataset snapshot.
_Avoid_: Candle revision number, latest version

**Dataset snapshot**:
An immutable, content-addressed manifest that resolves one exact normalized candle
series and records any missing ranges.
_Avoid_: Current market data, copied candle table

**Analysis input**:
A declared, normalized data capability supplied to a strategy, such as price bars or
a sentiment series.
_Avoid_: Service, dependency lookup

**Strategy descriptor**:
The versioned identity, parameter schema, required analysis inputs, capabilities, and
built-in implementation binding for one runnable strategy.
_Avoid_: Strategy config, UI catalog row

**Normalized signal**:
A provider-independent buy, sell, or hold decision effective at one time, optionally
carrying confidence and a reason.
_Avoid_: Binance signal, order
