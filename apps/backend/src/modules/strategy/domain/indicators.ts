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
