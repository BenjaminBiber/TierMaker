import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, errorMessage } from '../api';
import { Avatar, ErrorNote, Icon, IconButton, SearchField, matches } from '../components/ui';
import type { BoardSummary } from '../types';

export default function BoardsPage() {
  const [boards, setBoards] = useState<BoardSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');

  useEffect(() => {
    api.get<BoardSummary[]>('/tierlists').then(setBoards, (err) => setError(errorMessage(err)));
  }, []);

  const visible = boards?.filter((b) => matches(`${b.title} ${b.description}`, query));

  return (
    <>
      <div className="page-head">
        <h1>
          Boards {boards && boards.length > 0 && <span className="count">{boards.length}</span>}
        </h1>
        <span className="spacer" />
        {boards && boards.length > 6 && <SearchField value={query} onChange={setQuery} placeholder="Board suchen" />}
        <IconButton icon="add" label="Neues Board" to="/new" variant="primary" size="lg" />
      </div>
      <ErrorNote error={error} />

      {boards?.length === 0 && (
        <div className="empty">
          <Icon name="leaderboard" className="empty-icon" />
          <p>Noch keine Boards. Lade eine ZIP mit Bildern hoch, um das erste anzulegen.</p>
          <Link to="/new" className="btn btn-primary">
            <Icon name="upload_file" /> ZIP hochladen
          </Link>
        </div>
      )}

      <ul className="board-grid">
        {visible?.map((b) => {
          const done = b.itemCount > 0 && b.myVoteCount >= b.itemCount;
          const share = b.itemCount ? (b.myVoteCount / b.itemCount) * 100 : 0;
          return (
            <li key={b.id}>
              <Link to={`/boards/${b.id}`} className="board-card">
                <div className="board-cover">
                  {b.cover ? <img src={b.cover} alt="" loading="lazy" /> : <Icon name="leaderboard" />}
                  <span className="board-status">
                    {b.status === 'closed' ? (
                      <span className="chip chip-closed">
                        <Icon name="lock" /> Beendet
                      </span>
                    ) : done ? (
                      <span className="chip chip-done">
                        <Icon name="check" /> Erledigt
                      </span>
                    ) : b.myVoteCount === 0 ? (
                      <span className="chip chip-new">Neu für dich</span>
                    ) : null}
                  </span>
                  <span className="board-progress" aria-hidden>
                    <span style={{ width: `${share}%` }} />
                  </span>
                </div>
                <div className="board-body">
                  <h2>{b.title}</h2>
                  {b.description && <p className="board-desc">{b.description}</p>}
                  <div className="board-meta">
                    {b.owner && <Avatar person={b.owner} size={20} />}
                    <span aria-label={`${b.itemCount} Einträge`}>
                      <Icon name="style" /> {b.itemCount}
                    </span>
                    <span aria-label={`${b.voterCount} Abstimmende`}>
                      <Icon name="group" /> {b.voterCount}
                    </span>
                    <span className="board-mine">
                      {b.myVoteCount}/{b.itemCount} eingeordnet
                    </span>
                  </div>
                </div>
              </Link>
            </li>
          );
        })}
      </ul>
      {visible?.length === 0 && boards!.length > 0 && <p className="empty">Kein Board passt zu „{query}“.</p>}
    </>
  );
}
