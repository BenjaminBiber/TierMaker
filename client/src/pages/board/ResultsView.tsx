import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, errorMessage } from '../../api';
import { Avatar, Icon, IconButton, Modal, readableOn } from '../../components/ui';
import { Distribution, formatTierValue } from '../../components/Distribution';
import { ItemModal } from '../../components/ItemModal';
import type { Board, ItemResult, Results } from '../../types';
import { TileFace } from './VoteView';

type View = 'tiers' | 'table';

export default function ResultsView({ board }: { board: Board }) {
  const [results, setResults] = useState<Results | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [detail, setDetail] = useState<ItemResult | null>(null);
  const [view, setView] = useState<View>('tiers');
  const [dialog, setDialog] = useState<'voters' | 'method' | null>(null);

  useEffect(() => {
    api.get<Results>(`/tierlists/${board.id}/results`).then(setResults, (err) => setError(errorMessage(err)));
  }, [board.id]);

  if (error) {
    return (
      <div className="empty">
        <Icon name="lock_clock" className="empty-icon" />
        <p>{error}</p>
        {board.status === 'open' && (
          <Link to={`/boards/${board.id}`} className="btn btn-primary">
            <Icon name="swap_vert" /> Jetzt abstimmen
          </Link>
        )}
      </div>
    );
  }
  if (!results) return <div className="loading" aria-busy="true" />;

  const tiers = results.tiers;
  const myTier = (itemId: number) => tiers.find((t) => t.id === board.myVotes[itemId]);

  return (
    <div className="results">
      <div className="toolbar">
        <div className="segmented" role="tablist" aria-label="Darstellung">
          <button role="tab" aria-selected={view === 'tiers'} onClick={() => setView('tiers')}>
            <Icon name="view_agenda" /> Tierlist
          </button>
          <button role="tab" aria-selected={view === 'table'} onClick={() => setView('table')}>
            <Icon name="format_list_numbered" /> Rangliste
          </button>
        </div>

        <span className="spacer" />

        {results.voters.length > 0 && (
          <button className="voter-stack" onClick={() => setDialog('voters')} aria-label={`${results.voters.length} Personen haben abgestimmt, Liste anzeigen`}>
            <span className="voter-faces">
              {results.voters.slice(0, 5).map((v) => (
                <Avatar key={v.id} person={v} size={26} />
              ))}
            </span>
            <span>{results.voters.length}</span>
          </button>
        )}
        <IconButton icon="help_outline" label="So wird gerechnet" onClick={() => setDialog('method')} />
        <IconButton icon="download" label="Als CSV herunterladen" href={`/api/tierlists/${board.id}/results.csv`} download />
      </div>

      {results.totalVotes === 0 ? (
        <div className="empty">
          <Icon name="how_to_vote" className="empty-icon" />
          <p>Noch keine Stimmen abgegeben.</p>
        </div>
      ) : view === 'tiers' ? (
        <div className="tierboard">
          {tiers.map((tier) => (
            <div className="tier-row" key={tier.id}>
              <div className="tier-label" style={{ background: tier.color, color: readableOn(tier.color) }}>
                <span>{tier.name}</span>
                {tier.items.length > 0 && <small className="tier-count">{tier.items.length}</small>}
              </div>
              <div className="tier-zone">
                {tier.items.map((item) => (
                  <button key={item.id} className="tile tile-result" onClick={() => setDetail(item)} aria-label={`${item.name}, Details`} title={item.name}>
                    <TileFace item={item} />
                    <span className="tile-badge" aria-hidden>
                      {(item.median! + 1).toLocaleString('de-DE')}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <ol className="ranking">
          {results.ranking.map((item, i) => {
            const tier = tiers[item.position!];
            const mine = myTier(item.id);
            return (
              <li key={item.id}>
                <button className="ranking-row" onClick={() => setDetail(item)}>
                  <span className="rank">{i + 1}</span>
                  <span className="ranking-thumb">{item.image ? <img src={item.image} alt="" loading="lazy" /> : <Icon name="image" />}</span>
                  <span className="ranking-name">
                    <strong>{item.name}</strong>
                    <small>
                      Median {formatTierValue(item.median, tiers)} · {item.votes} {item.votes === 1 ? 'Stimme' : 'Stimmen'}
                      {mine && (
                        <>
                          {' '}
                          · du: <b>{mine.name}</b>
                        </>
                      )}
                    </small>
                  </span>
                  <Distribution tiers={tiers} distribution={item.distribution} />
                  <span className="tier-pill" style={{ background: tier.color, color: readableOn(tier.color) }}>
                    {tier.name}
                  </span>
                </button>
              </li>
            );
          })}
        </ol>
      )}

      {results.unrated.length > 0 && (
        <section className="unrated">
          <h2>
            Ohne Stimmen <span className="count">{results.unrated.length}</span>
          </h2>
          <div className="unrated-zone">
            {results.unrated.map((item) => (
              <button key={item.id} className="tile tile-result" onClick={() => setDetail(item)} title={item.name}>
                <TileFace item={item} />
              </button>
            ))}
          </div>
        </section>
      )}

      {dialog === 'voters' && (
        <Modal title="Abgestimmt haben" size="sm" onClose={() => setDialog(null)}>
          <ul className="voter-list">
            {results.voters.map((v) => (
              <li key={v.id}>
                <Avatar person={v} size={32} />
                <span>{v.name}</span>
                <small>
                  {v.voteCount} / {board.items.length}
                </small>
              </li>
            ))}
          </ul>
        </Modal>
      )}
      {dialog === 'method' && (
        <Modal title="So wird gerechnet" size="sm" onClose={() => setDialog(null)}>
          <div className="stack-sm prose">
            <p>Jede Person ordnet für sich ein. Ein Eintrag landet in dem Rang, den der <strong>Median</strong> aller Stimmen ergibt: Die Hälfte hat ihn besser, die andere Hälfte schlechter eingestuft.</p>
            <p>Liegt der Median genau zwischen zwei Rängen, entscheidet der Mittelwert. Die Zahl auf jedem Bild ist der Median (1 = bester Rang).</p>
          </div>
        </Modal>
      )}
      {detail && <ItemModal item={detail} tiers={tiers} onClose={() => setDetail(null)} />}
    </div>
  );
}
