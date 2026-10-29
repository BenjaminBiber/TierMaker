import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, errorMessage } from '../api';
import { ErrorNote, Icon, IconButton, Modal } from '../components/ui';
import { ZipDrop } from '../components/ZipDrop';
import { AiPromptDialog } from '../components/AiPromptDialog';

const EXAMPLE = `{
  "title": "Bestes Obst",
  "description": "Welches Obst ist das beste?",
  "tiers": [
    { "name": "S", "color": "#ff7f7f" },
    { "name": "A", "color": "#ffbf7f" },
    "B", "C", "D"
  ],
  "items": [
    {
      "name": "Apfel",
      "description": "Knackig und vielseitig.",
      "image": "bilder/apfel.png",
      "herkunft": "Deutschland"
    },
    { "name": "Mango", "image": "mango.jpg" }
  ]
}`;

export default function NewBoardPage() {
  const navigate = useNavigate();
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dialog, setDialog] = useState<'ai' | 'format' | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!file) return setError('Bitte zuerst eine ZIP-Datei auswählen.');
    setBusy(true);
    setError(null);
    const form = new FormData();
    form.append('file', file);
    if (title.trim()) form.append('title', title.trim());
    if (description.trim()) form.append('description', description.trim());
    try {
      const { id } = await api.post<{ id: number }>('/tierlists', form);
      navigate(`/boards/${id}`);
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  }

  return (
    <div className="new-board">
      <div className="page-head">
        <IconButton icon="arrow_back" label="Alle Boards" to="/" />
        <h1>Neues Board</h1>
      </div>

      <form onSubmit={submit} className="panel stack">
        <ZipDrop file={file} onFile={setFile} />
        <label className="field">
          <span>Titel</span>
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Leer lassen: aus JSON oder Dateiname" maxLength={120} />
        </label>
        <label className="field">
          <span>
            Beschreibung <em className="optional">optional</em>
          </span>
          <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} />
        </label>
        <ErrorNote error={error} />
        <button className="btn btn-primary btn-block" disabled={busy || !file}>
          <Icon name="rocket_launch" /> {busy ? 'Wird importiert …' : 'Board erstellen'}
        </button>
      </form>

      <ul className="helpers" aria-label="Hilfe zur ZIP">
        <li>
          <Icon name="auto_awesome" className="helpers-icon" />
          <span>
            <strong>Keine ZIP zur Hand?</strong>
            <small>Eine KI stellt Einträge und Bilder zu deinem Thema zusammen.</small>
          </span>
          <IconButton icon="content_copy" label="KI-Prompt erstellen" variant="soft" onClick={() => setDialog('ai')} />
        </li>
        <li>
          <Icon name="folder_zip" className="helpers-icon" />
          <span>
            <strong>Aufbau der ZIP</strong>
            <small>Bilder plus optional eine tierlist.json.</small>
          </span>
          <IconButton icon="menu_book" label="Format anzeigen" variant="soft" onClick={() => setDialog('format')} />
        </li>
        <li>
          <Icon name="inventory_2" className="helpers-icon" />
          <span>
            <strong>Beispiel-ZIP</strong>
            <small>Zum Ausprobieren oder als Vorlage.</small>
          </span>
          <IconButton icon="download" label="Beispiel-ZIP herunterladen" variant="soft" href="/beispiel-tierlist.zip" download />
        </li>
      </ul>

      {dialog === 'ai' && <AiPromptDialog onClose={() => setDialog(null)} />}
      {dialog === 'format' && (
        <Modal title="So sieht die ZIP aus" size="lg" onClose={() => setDialog(null)}>
          <div className="format-help">
            <p>
              Bilder (PNG, JPG, GIF, WebP, AVIF) plus optional eine <code>tierlist.json</code>. Ohne JSON wird jedes Bild zu einem Eintrag, der Dateiname wird zum Namen.
            </p>
            <pre>{EXAMPLE}</pre>
            <ul>
              <li>
                <code>image</code> verweist auf eine Datei im ZIP (Pfad oder nur Dateiname) oder auf eine <code>https://</code>-URL.
              </li>
              <li>
                Fehlt <code>image</code>, wird ein Bild mit gleichem Namen wie der Eintrag gesucht.
              </li>
              <li>Zusätzliche Felder wie „herkunft“ erscheinen in der Detailansicht.</li>
              <li>
                Ohne <code>tiers</code> gibt es S, A, B, C, D, F.
              </li>
            </ul>
          </div>
        </Modal>
      )}
    </div>
  );
}
