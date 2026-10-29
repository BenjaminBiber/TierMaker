import type { Tier } from '../types';

/** Turns a 0-based tier value (possibly fractional) into "B" or "A–B · 1,5". */
export function formatTierValue(value: number | null, tiers: Tier[]) {
  if (value === null) return '–';
  const lo = tiers[Math.floor(value)]?.name ?? '?';
  const hi = tiers[Math.ceil(value)]?.name ?? '?';
  const num = (value + 1).toLocaleString('de-DE', { maximumFractionDigits: 2 });
  return lo === hi && Number.isInteger(value) ? `${lo} (${num})` : `${lo}–${hi} (${num})`;
}

/** Small histogram: one column per tier, height = share of votes. */
export function Distribution({ tiers, distribution, large }: { tiers: Tier[]; distribution: number[]; large?: boolean }) {
  const max = Math.max(1, ...distribution);
  const total = distribution.reduce((a, b) => a + b, 0);
  return (
    <div
      className={`dist ${large ? 'dist-large' : ''}`}
      role="img"
      aria-label={tiers.map((t, i) => `${t.name}: ${distribution[i] ?? 0}`).join(', ')}
    >
      {tiers.map((t, i) => {
        const n = distribution[i] ?? 0;
        return (
          <div className="dist-col" key={t.id} title={`${t.name}: ${n} von ${total}`}>
            <div className="dist-track">
              <span style={{ height: `${(n / max) * 100}%`, background: t.color }} />
            </div>
            {large && (
              <>
                <small className="dist-n">{n}</small>
                <small className="dist-label">{t.name}</small>
              </>
            )}
          </div>
        );
      })}
    </div>
  );
}
