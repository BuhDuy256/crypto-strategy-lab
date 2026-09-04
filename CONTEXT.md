# Domain glossary

Project-specific vocabulary for Crypto Strategy Lab. It fixes the language used to
describe reproducible market datasets and executable trading strategies, so the same
idea has one name in code, documents, and conversation.

For what the project is and how to run it, see [`README.md`](README.md).

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

## Future account scope

The current V1 product is a single shared workspace and has no authentication or
per-user ownership. A later version may add deliberately minimal local accounts:

- username and password only;
- one personal workspace per account;
- experiments, saved strategies, runs, and results scoped to that workspace;
- no email address, email verification, password recovery, social login, team
  workspace, invitation, or billing flow.

Passwords must never be stored directly, and the API must derive account/workspace
identity from the authenticated session rather than accept an owner ID from the SPA.
Background workers continue to receive durable resource IDs, not user credentials.

This paragraph records product context only. It does not modify frozen architecture
v1.2 or authorize account implementation inside V1. Adding Identity/Access,
credentials, sessions, ownership columns, or authorization requires a proposed ADR,
explicit Project Owner acceptance, migrations, and security tests.
