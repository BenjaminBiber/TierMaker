import { useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, errorMessage } from '../../api';
import { ErrorNote, FormDialog, Icon, IconButton, SearchField, matches, readableOn, useConfirm } from '../../components/ui';
import { ZipDrop } from '../../components/ZipDrop';
import type { Board, Item, ResultsVisibility } from '../../types';

const PALETTE = ['#ff7f7f', '#ffbf7f', '#ffdf7f', '#ffff7f', '#bfff7f', '#7fff7f', '#7fffff', '#7fbfff', '#bf7fff', '#ff7fbf'];

const VISIBILITY: Record<ResultsVisibility, string> = {
  always: 'Für alle, jederzeit',
  after_vote: 'Sobald man selbst abgestimmt hat',
  after_close: 'Erst nach Ende der Abstimmung',
};

export default function SettingsView({ board, reload }: { board: Board; reload: () => Promise<void> }) {
  return (
    <div className="settings">
      <div className="settings-col">
        <GeneralPanel board={board} reload={reload} />
        <TiersPanel board={board} reload={reload} />
      </div>
      <ItemsPanel board={board} reload={reload} />
    </div>
  );
}

type SectionProps = { board: Board; reload: () => Promise<void> };

function useSaver() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function run(fn: () => Promise<unknown>) {
    setBusy(true);
    setError(null);
    try {
      await fn();
      return true;
    } catch (err) {
      setError(errorMessage(err));
      return false;
    } finally {
      setBusy(false);
    }
  }
  return { busy, error, run, clear: () => setError(null) };
}

function PanelHead({ title, count, children }: { title: string; count?: number; children?: ReactNode }) {
  return (
    <div className="panel-head">
      <h2>
        {title} {count != null && <span className="count">{count}</span>}
      </h2>
      <div className="panel-actions">{children}</div>
    </div>
  );
}

/* ── Board ───────────────────────────────────────────────────────────── */

function GeneralPanel({ board, reload }: SectionProps) {
  const confirm = useConfirm();
  const navigate = useNavigate();
  const [editing, setEditing] = useState(false);
  const { busy, error, run } = useSaver();
  const open = board.status === 'open';

  async function toggleStatus() {
    const ok = await confirm(
      open
        ? {
            title: 'Abstimmung beenden?',
            message: 'Danach kann niemand mehr einordnen. Du kannst die Abstimmung später wieder öffnen.',
            confirmLabel: 'Beenden',
            icon: 'lock',
          }
        : { title: 'Abstimmung wieder öffnen?', message: 'Alle können wieder einordnen und ihre Stimmen ändern.', confirmLabel: 'Öffnen', icon: 'lock_open' },
    );
    if (!ok) return;
    run(async () => {
      await api.patch(`/tierlists/${board.id}`, { status: open ? 'closed' : 'open' });
      await reload();
    });
  }

  async function remove() {
    const ok = await confirm({
      title: 'Board löschen?',
      message: (
        <p>
          „{board.title}“ wird mit allen {board.items.length} Einträgen, Bildern und Stimmen <strong>endgültig</strong> gelöscht.
        </p>
      ),
      confirmLabel: 'Endgültig löschen',
      icon: 'delete_forever',
      danger: true,
      requireText: board.title,
    });
    if (!ok) return;
    run(async () => {
      await api.del(`/tierlists/${board.id}`);
      navigate('/');
    });
  }

  return (
    <section className="panel">
      <PanelHead title="Board">
        <IconButton icon="edit" label="Titel und Sichtbarkeit bearbeiten" onClick={() => setEditing(true)} />
        <IconButton icon={open ? 'lock' : 'lock_open'} label={open ? 'Abstimmung beenden' : 'Abstimmung wieder öffnen'} onClick={toggleStatus} disabled={busy} />
        <IconButton icon="delete_forever" label="Board löschen" variant="danger" onClick={remove} disabled={busy} />
      </PanelHead>
      <dl className="facts">
        <div>
          <dt>Status</dt>
          <dd>
            {open ? (
              <span className="chip chip-open">
                <Icon name="how_to_vote" /> Abstimmung läuft
              </span>
            ) : (
              <span className="chip chip-closed">
                <Icon name="lock" /> Beendet
              </span>
            )}
          </dd>
        </div>
        <div>
          <dt>Ergebnis sichtbar</dt>
          <dd>{VISIBILITY[board.resultsVisibility]}</dd>
        </div>
        <div>
          <dt>Beschreibung</dt>
          <dd className={board.description ? 'facts-text' : 'muted'}>{board.description || 'Keine'}</dd>
        </div>
      </dl>
      <ErrorNote error={error} />
      {editing && <BoardDialog board={board} reload={reload} onClose={() => setEditing(false)} />}
    </section>
  );
}

function BoardDialog({ board, reload, onClose }: SectionProps & { onClose: () => void }) {
  const [title, setTitle] = useState(board.title);
  const [description, setDescription] = useState(board.description);
  const [visibility, setVisibility] = useState<ResultsVisibility>(board.resultsVisibility);
  const { busy, error, run } = useSaver();

  const save = async () => {
    const ok = await run(async () => {
      await api.patch(`/tierlists/${board.id}`, { title, description, resultsVisibility: visibility });
      await reload();
    });
    if (ok) onClose();
  };

  return (
    <FormDialog title="Board bearbeiten" busy={busy} error={error} onSubmit={save} onClose={onClose}>
      <label className="field">
        <span>Titel</span>
        <input value={title} onChange={(e) => setTitle(e.target.value)} required maxLength={120} autoFocus />
      </label>
      <label className="field">
        <span>Beschreibung</span>
        <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={4} />
      </label>
      <fieldset className="field choice">
        <legend>Ergebnis sichtbar</legend>
        {(Object.keys(VISIBILITY) as ResultsVisibility[]).map((v) => (
          <label key={v} className="check">
            <input type="radio" name="visibility" checked={visibility === v} onChange={() => setVisibility(v)} />
            {VISIBILITY[v]}
          </label>
        ))}
      </fieldset>
    </FormDialog>
  );
}

/* ── Tiers ───────────────────────────────────────────────────────────── */

function TiersPanel({ board, reload }: SectionProps) {
  const [editing, setEditing] = useState(false);
  return (
    <section className="panel">
      <PanelHead title="Ränge" count={board.tiers.length}>
        <IconButton icon="edit" label="Ränge bearbeiten" onClick={() => setEditing(true)} />
      </PanelHead>
      <ol className="tier-preview">
        {board.tiers.map((t) => (
          <li key={t.id} style={{ background: t.color, color: readableOn(t.color) }}>
            {t.name}
          </li>
        ))}
      </ol>
      {editing && <TiersDialog board={board} reload={reload} onClose={() => setEditing(false)} />}
    </section>
  );
}

interface DraftTier {
  id?: number;
  key: string;
  name: string;
  color: string;
}

function TiersDialog({ board, reload, onClose }: SectionProps & { onClose: () => void }) {
  const confirm = useConfirm();
  const [tiers, setTiers] = useState<DraftTier[]>(board.tiers.map((t) => ({ id: t.id, key: String(t.id), name: t.name, color: t.color })));
  const { busy, error, run } = useSaver();

  const update = (i: number, patch: Partial<DraftTier>) => setTiers((ts) => ts.map((t, j) => (j === i ? { ...t, ...patch } : t)));
  const move = (i: number, dir: -1 | 1) =>
    setTiers((ts) => {
      const next = [...ts];
      [next[i], next[i + dir]] = [next[i + dir], next[i]];
      return next;
    });
  const removed = board.tiers.filter((t) => !tiers.some((d) => d.id === t.id));

  const save = async () => {
    if (removed.length) {
      const ok = await confirm({
        title: removed.length === 1 ? 'Rang entfernen?' : 'Ränge entfernen?',
        message: `Alle Stimmen in ${removed.map((t) => `„${t.name}“`).join(', ')} werden gelöscht. Die Einträge landen bei allen wieder im Pool.`,
        confirmLabel: 'Entfernen und speichern',
        icon: 'delete',
        danger: true,
      });
      if (!ok) return;
    }
    const ok = await run(async () => {
      await api.put(`/tierlists/${board.id}/tiers`, { tiers: tiers.map(({ id, name, color }) => ({ id, name, color })) });
      await reload();
    });
    if (ok) onClose();
  };

  return (
    <FormDialog title="Ränge bearbeiten" busy={busy} error={error} onSubmit={save} onClose={onClose}>
      <p className="muted small">Oben steht der beste Rang. Umbenennen und Umsortieren behält die Stimmen.</p>
      <ul className="tier-editor">
        {tiers.map((t, i) => (
          <li key={t.key}>
            <label className="swatch" style={{ background: t.color, color: readableOn(t.color) }} aria-label={`Farbe von ${t.name}`}>
              <input type="color" value={t.color.length === 7 ? t.color : '#cccccc'} onChange={(e) => update(i, { color: e.target.value })} />
              <Icon name="palette" />
            </label>
            <input value={t.name} onChange={(e) => update(i, { name: e.target.value })} maxLength={40} required aria-label="Name des Rangs" />
            <IconButton icon="arrow_upward" label="Nach oben" size="sm" onClick={() => move(i, -1)} disabled={i === 0} />
            <IconButton icon="arrow_downward" label="Nach unten" size="sm" onClick={() => move(i, 1)} disabled={i === tiers.length - 1} />
            <IconButton
              icon="delete"
              label="Rang entfernen"
              size="sm"
              variant="danger"
              onClick={() => setTiers((ts) => ts.filter((_, j) => j !== i))}
              disabled={tiers.length <= 2}
            />
          </li>
        ))}
      </ul>
      <button
        type="button"
        className="btn btn-ghost btn-dashed"
        onClick={() => setTiers((ts) => [...ts, { key: crypto.randomUUID(), name: `Rang ${ts.length + 1}`, color: PALETTE[ts.length % PALETTE.length] }])}
        disabled={tiers.length >= 20}
      >
        <Icon name="add" /> Rang hinzufügen
      </button>
    </FormDialog>
  );
}

/* ── Items ───────────────────────────────────────────────────────────── */

function ItemsPanel({ board, reload }: SectionProps) {
  const confirm = useConfirm();
  const [editing, setEditing] = useState<Item | null>(null);
  const [importing, setImporting] = useState(false);
  const [query, setQuery] = useState('');
  const { error, run } = useSaver();

  async function remove(item: Item) {
    const ok = await confirm({
      title: 'Eintrag löschen?',
      message: `„${item.name}“ wird mit allen Stimmen gelöscht.`,
      confirmLabel: 'Löschen',
      icon: 'delete',
      danger: true,
    });
    if (!ok) return;
    run(async () => {
      await api.del(`/tierlists/${board.id}/items/${item.id}`);
      await reload();
    });
  }

  const visible = query ? board.items.filter((i) => matches(i.name, query)) : board.items;

  return (
    <section className="panel panel-items">
      <PanelHead title="Einträge" count={board.items.length}>
        <IconButton icon="add_photo_alternate" label="Einträge aus ZIP hinzufügen" variant="soft" onClick={() => setImporting(true)} />
      </PanelHead>
      {board.items.length > 8 && <SearchField value={query} onChange={setQuery} placeholder="Eintrag suchen" />}
      <ErrorNote error={error} />
      <ul className="item-list">
        {visible.map((item) => (
          <li key={item.id}>
            <span className="ranking-thumb">{item.image ? <img src={item.image} alt="" loading="lazy" /> : <Icon name="image" />}</span>
            <span className="item-list-text">
              <strong>{item.name}</strong>
              {item.description && <small>{item.description}</small>}
            </span>
            <span className="row-actions">
              <IconButton icon="edit" label={`${item.name} bearbeiten`} size="sm" onClick={() => setEditing(item)} />
              <IconButton icon="delete" label={`${item.name} löschen`} size="sm" variant="danger" onClick={() => remove(item)} />
            </span>
          </li>
        ))}
        {visible.length === 0 && <li className="muted">Kein Treffer.</li>}
      </ul>
      {editing && <ItemDialog board={board} item={editing} reload={reload} onClose={() => setEditing(null)} />}
      {importing && <ImportDialog board={board} reload={reload} onClose={() => setImporting(false)} />}
    </section>
  );
}

function ItemDialog({ board, item, reload, onClose }: SectionProps & { item: Item; onClose: () => void }) {
  const [name, setName] = useState(item.name);
  const [description, setDescription] = useState(item.description);
  const { busy, error, run } = useSaver();
  const save = async () => {
    const ok = await run(async () => {
      await api.patch(`/tierlists/${board.id}/items/${item.id}`, { name, description });
      await reload();
    });
    if (ok) onClose();
  };
  return (
    <FormDialog title="Eintrag bearbeiten" busy={busy} error={error} onSubmit={save} onClose={onClose}>
      <div className="item-edit">
        {item.image && <img src={item.image} alt="" className="item-edit-img" />}
        <div className="stack">
          <label className="field">
            <span>Name</span>
            <input value={name} onChange={(e) => setName(e.target.value)} required maxLength={200} autoFocus />
          </label>
          <label className="field">
            <span>Beschreibung</span>
            <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={4} />
          </label>
        </div>
      </div>
    </FormDialog>
  );
}

function ImportDialog({ board, reload, onClose }: SectionProps & { onClose: () => void }) {
  const [file, setFile] = useState<File | null>(null);
  const { busy, error, run } = useSaver();
  const save = async () => {
    const ok = await run(async () => {
      const form = new FormData();
      form.append('file', file!);
      await api.post(`/tierlists/${board.id}/items/import`, form);
      await reload();
    });
    if (ok) onClose();
  };
  return (
    <FormDialog title="Einträge hinzufügen" submitLabel="Hinzufügen" submitIcon="add_photo_alternate" busy={busy} error={error} disabled={!file} onSubmit={save} onClose={onClose}>
      <p className="muted small">Bilder und optional eine tierlist.json, wie beim Anlegen. Bestehende Einträge und Stimmen bleiben erhalten.</p>
      <ZipDrop file={file} onFile={setFile} />
    </FormDialog>
  );
}
