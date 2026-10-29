import { useCallback, useEffect, useState } from 'react';
import { NavLink, Navigate, Route, Routes, useParams } from 'react-router-dom';
import { api, errorMessage } from '../api';
import { Avatar, ErrorNote, Icon, IconButton, Modal } from '../components/ui';
import type { Board } from '../types';
import VoteView from './board/VoteView';
import ResultsView from './board/ResultsView';
import SettingsView from './board/SettingsView';

export default function BoardPage() {
  const { id } = useParams();
  const [board, setBoard] = useState<Board | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showFullDesc, setShowFullDesc] = useState(false);

  const reload = useCallback(
    () =>
      api.get<Board>(`/tierlists/${id}`).then(
        (b) => {
          setBoard(b);
          setError(null);
        },
        (err) => setError(errorMessage(err)),
      ),
    [id],
  );

  useEffect(() => {
    reload();
  }, [reload]);

  if (error && !board) return <ErrorNote error={error} />;
  if (!board) return <div className="loading" aria-busy="true" />;
  const base = `/boards/${board.id}`;
  const longDesc = board.description.length > 140;

  return (
    <>
      <header className="board-head">
        <IconButton icon="arrow_back" label="Alle Boards" to="/" className="board-back" />
        <div className="board-title">
          <div className="board-title-row">
            <h1>{board.title}</h1>
            <ShareButton board={board} />
          </div>
          {board.description && (
            <div className="board-desc-wrap">
              <p className={`lede ${longDesc && !showFullDesc ? 'is-clamped' : ''}`}>{board.description}</p>
              {longDesc && (
                <button className="link-btn" onClick={() => setShowFullDesc((v) => !v)} aria-expanded={showFullDesc}>
                  {showFullDesc ? 'weniger' : 'mehr'}
                </button>
              )}
            </div>
          )}
          <div className="board-meta">
            {board.owner && (
              <span className="who">
                <Avatar person={board.owner} size={20} /> {board.owner.name}
              </span>
            )}
            <span>
              <Icon name="style" /> {board.items.length} Einträge
            </span>
            <span>
              <Icon name="group" /> {board.voterCount} abgestimmt
            </span>
            {board.status === 'closed' && (
              <span className="chip chip-closed">
                <Icon name="lock" /> Beendet
              </span>
            )}
          </div>
        </div>

        <nav className="tabs" aria-label="Ansicht">
          <NavLink to={base} end>
            <Icon name="swap_vert" /> Abstimmen
          </NavLink>
          <NavLink to={`${base}/results`}>
            <Icon name="leaderboard" /> Ergebnis
          </NavLink>
          {board.canManage && (
            <NavLink to={`${base}/settings`}>
              <Icon name="tune" /> Verwalten
            </NavLink>
          )}
        </nav>
      </header>

      <Routes>
        <Route index element={<VoteView board={board} setBoard={setBoard} />} />
        <Route path="results" element={<ResultsView board={board} />} />
        {board.canManage && <Route path="settings" element={<SettingsView board={board} reload={reload} />} />}
        <Route path="*" element={<Navigate to={base} replace />} />
      </Routes>
    </>
  );
}

/** Native share sheet on phones, copy-to-clipboard elsewhere, a dialog if neither works. */
function ShareButton({ board }: { board: Board }) {
  const [copied, setCopied] = useState(false);
  const [showLink, setShowLink] = useState(false);
  const url = `${window.location.origin}/boards/${board.id}`;

  useEffect(() => {
    if (!copied) return;
    const t = setTimeout(() => setCopied(false), 2200);
    return () => clearTimeout(t);
  }, [copied]);

  async function share() {
    if (navigator.share && matchMedia('(pointer: coarse)').matches) {
      try {
        await navigator.share({ title: board.title, text: `Ranke mit: ${board.title}`, url });
        return;
      } catch (err) {
        if ((err as DOMException).name === 'AbortError') return;
      }
    }
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
    } catch {
      setShowLink(true);
    }
  }

  return (
    <>
      <span className="share">
        <IconButton
          icon={copied ? 'check' : 'share'}
          label={copied ? 'Link kopiert' : 'Link zum Board teilen'}
          variant="soft"
          className={copied ? 'is-done' : ''}
          onClick={share}
        />
        <span className="share-status" role="status">
          {copied ? 'Link kopiert' : ''}
        </span>
      </span>
      {showLink && (
        <Modal title="Board teilen" size="sm" onClose={() => setShowLink(false)}>
          <label className="field">
            <span>Link kopieren und weitergeben</span>
            <input readOnly value={url} autoFocus onFocus={(e) => e.currentTarget.select()} />
          </label>
        </Modal>
      )}
    </>
  );
}
