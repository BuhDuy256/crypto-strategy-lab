// Pure numeric indicator primitives shared by built-in strategies.

export function simpleMovingAverage(
  values: readonly number[],
  period: number
): readonly number[] {
  if (!Number.isInteger(period) || period <= 0) {
    throw new Error("SMA_PERIOD: period must be a positive integer");
  }
  if (values.length < period) {
    return [];
  }

  const averages: number[] = [];
  let windowSum = 0;
  for (let index = 0; index < values.length; index += 1) {
    const current = values[index];
    if (current === undefined || !Number.isFinite(current)) {
      throw new Error(`SMA_VALUE: value at index ${index} must be finite`);
    }
    windowSum += current;

    const expired = values[index - period];
    if (expired !== undefined) {
      windowSum -= expired;
    }
    if (index >= period - 1) {
      averages.push(windowSum / period);
    }
  }
  return averages;
}

export function bollingerBands(
  values: readonly number[],
  period: number,
  deviation: number
): { readonly middle: readonly number[]; readonly upper: readonly number[]; readonly lower: readonly number[] } {
  if (!Number.isInteger(period) || period <= 0) {
    throw new Error("BOLLINGER_PERIOD: period must be a positive integer");
  }
  if (values.length < period) {
    return { middle: [], upper: [], lower: [] };
  }

  const middle = simpleMovingAverage(values, period);
  const upper: number[] = [];
  const lower: number[] = [];

  for (let index = 0; index < values.length; index += 1) {
    if (index < period - 1) {
      continue;
    }
    const window = values.slice(index - period + 1, index + 1);
    const mean: any = middle[index - period + 1];
    let variance = 0;
    for (const v of window) {
      variance += Math.pow(v - mean, 2);
    }
    variance /= period;
    const stdDev = Math.sqrt(variance);

    upper.push(mean + deviation * stdDev);
    lower.push(mean - deviation * stdDev);
  }

  return { middle, upper, lower };
}

export function relativeStrengthIndex(
  values: readonly number[],
  period: number
): readonly number[] {
  if (!Number.isInteger(period) || period <= 1) {
    throw new Error("RSI_PERIOD: period must be an integer greater than 1");
  }
  if (values.length <= period) {
    return [];
  }

  const rsi: number[] = [];
  let avgGain = 0;
  let avgLoss = 0;

  for (let i = 1; i <= period; i++) {
    const change = values[i] - values[i - 1];
    if (change > 0) {
      avgGain += change;
    } else {
      avgLoss -= change;
    }
  }
  avgGain /= period;
  avgLoss /= period;

  const pushRsi = () => {
    if (avgLoss === 0) {
      rsi.push(100);
    } else {
      const rs = avgGain / avgLoss;
      rsi.push(100 - (100 / (1 + rs)));
    }
  };

  pushRsi();

  for (let i = period + 1; i < values.length; i++) {
    const change = values[i] - values[i - 1];
    const gain = change > 0 ? change : 0;
    const loss = change < 0 ? -change : 0;

    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;

    pushRsi();
  }

  return rsi;
}
