// News-owned windowed sentiment distribution read for the NEWS-07 query surface.
// Asset-agnostic: proportions over every analyzed item published in the window, not
// scoped to one canonical asset the way NEWS-05's SentimentFeature is.

export interface SentimentDistributionWindow {
  readonly startAt: number;
  readonly endAt: number;
}

export interface SentimentLabelCounts {
  readonly positive: number;
  readonly neutral: number;
  readonly negative: number;
}

export interface SentimentDistribution {
  readonly window: SentimentDistributionWindow;
  readonly itemCount: number;
  readonly positive: number;
  readonly neutral: number;
  readonly negative: number;
}

export interface SentimentDistributionQuery {
  getDistribution(window: SentimentDistributionWindow): Promise<SentimentDistribution>;
}

/** Turns raw label counts into proportions of the total. Zero items never divides by zero. */
export function computeSentimentProportions(counts: SentimentLabelCounts): SentimentLabelCounts {
  const total = counts.positive + counts.neutral + counts.negative;
  if (total === 0) {
    return { positive: 0, neutral: 0, negative: 0 };
  }
  return {
    positive: counts.positive / total,
    neutral: counts.neutral / total,
    negative: counts.negative / total
  };
}
