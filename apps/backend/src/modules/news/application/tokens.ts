// Runtime injection tokens for News application ports exported across module boundaries.

export const NEWS_ITEM_QUERY = Symbol("NEWS_ITEM_QUERY");
export const SENTIMENT_DISTRIBUTION_QUERY = Symbol("SENTIMENT_DISTRIBUTION_QUERY");
export const NEWS_HEALTH_QUERY = Symbol("NEWS_HEALTH_QUERY");
/** Public read-only feature port; it never exposes News storage or analyzer lifecycle. */
export const SENTIMENT_FEATURE = Symbol("SENTIMENT_FEATURE");
