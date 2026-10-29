import type { Item, ItemResult, Tier } from '../types';
import { Modal } from './ui';
import { Distribution, formatTierValue } from './Distribution';

export function ItemModal({ item, tiers, onClose }: { item: Item | ItemResult; tiers: Tier[]; onClose: () => void }) {
  const result = 'distribution' in item ? item : null;
  const extra = Object.entries(item.extra ?? {});
  return (
    <Modal title={item.name} onClose={onClose} size="lg">
      <div className="item-detail">
        {item.image && <img src={item.image} alt={item.name} className="item-detail-img" />}
        <div className="stack">
          {item.description ? <p className="item-detail-desc">{item.description}</p> : <p className="muted">Keine Beschreibung.</p>}
          {extra.length > 0 && (
            <dl className="extra">
              {extra.map(([k, v]) => (
                <div key={k}>
                  <dt>{k}</dt>
                  <dd>{v}</dd>
                </div>
              ))}
            </dl>
          )}
          {result && result.votes > 0 && (
            <div className="stack-sm">
              <dl className="stats">
                <div>
                  <dt>Median</dt>
                  <dd>{formatTierValue(result.median, tiers)}</dd>
                </div>
                <div>
                  <dt>Mittelwert</dt>
                  <dd>{formatTierValue(result.mean, tiers)}</dd>
                </div>
                <div>
                  <dt>Stimmen</dt>
                  <dd>{result.votes}</dd>
                </div>
              </dl>
              <Distribution tiers={tiers} distribution={result.distribution} large />
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
}
