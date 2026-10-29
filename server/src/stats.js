/**
 * Aggregation of tier votes. Tier positions are 0-based, 0 = best tier.
 */

export function median(sorted) {
  const n = sorted.length;
  if (n === 0) return null;
  const mid = Math.floor(n / 2);
  return n % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

export function mean(values) {
  if (values.length === 0) return null;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

export function stddev(values) {
  if (values.length < 2) return 0;
  const m = mean(values);
  return Math.sqrt(values.reduce((acc, v) => acc + (v - m) ** 2, 0) / values.length);
}

/**
 * Maps a (possibly .5) median to a tier position. On a tie between two tiers
 * the one closer to the mean wins; if the mean sits exactly in the middle too,
 * the better tier wins.
 */
export function consensusPosition(med, avg) {
  if (med === null) return null;
  if (Number.isInteger(med)) return med;
  const better = Math.floor(med);
  const worse = Math.ceil(med);
  return avg > med ? worse : better;
}

/**
 * @param {number} tierCount
 * @param {number[]} positions  tier positions of all votes for one item
 */
export function summarize(tierCount, positions) {
  const sorted = [...positions].sort((a, b) => a - b);
  const med = median(sorted);
  const avg = mean(sorted);
  const distribution = Array.from({ length: tierCount }, () => 0);
  for (const p of sorted) if (p >= 0 && p < tierCount) distribution[p] += 1;
  return {
    votes: sorted.length,
    median: med,
    mean: avg,
    stddev: stddev(sorted),
    min: sorted.length ? sorted[0] : null,
    max: sorted.length ? sorted[sorted.length - 1] : null,
    distribution,
    position: consensusPosition(med, avg),
  };
}

/** Sort order inside a tier: better median, better mean, more votes, name. */
export function compareResults(a, b) {
  return (
    a.median - b.median ||
    a.mean - b.mean ||
    b.votes - a.votes ||
    a.name.localeCompare(b.name, 'de')
  );
}
