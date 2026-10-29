import { useMemo, useRef, useState } from 'react';
import { Icon, Modal } from './ui';

const slug = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/ß/g, 'ss')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '') || 'tierlist';

/** count = null means: no limit, the AI should be as complete as possible. */
export function buildPrompt(topic: string, count: number | null) {
  const subject = topic.trim() || '[THEMA HIER EINSETZEN]';
  const file = `${slug(topic)}.zip`;
  const scope =
    count === null
      ? 'Stelle eine möglichst vollständige Liste aller Einträge zu diesem Thema zusammen – ohne Begrenzung der Anzahl (technisches Maximum: 2000).'
      : `Stelle eine Liste von ${count} bekannten, klar unterscheidbaren Einträgen zu diesem Thema zusammen.`;
  return `Erstelle mir eine ZIP-Datei für einen Tierlist-Maker zum Thema: „${subject}“.

## Vorgehen

1. ${scope} Keine Duplikate, keine Sammelbegriffe.
2. Besorge zu jedem Eintrag genau ein passendes, gut erkennbares Bild.
   - Nutze bevorzugt frei lizenzierte Quellen (z. B. Wikimedia Commons, Wikipedia, offizielle Pressebilder) und notiere Quelle und Lizenz je Bild.
   - Formate: PNG, JPG, WebP oder GIF. Kein SVG.
   - Möglichst quadratisch oder mit dem Motiv in der Mitte (wird quadratisch zugeschnitten), mindestens 256 px Kantenlänge, höchstens 2 MB pro Bild.
   - Dateinamen nur aus Kleinbuchstaben, Ziffern und Bindestrichen, z. B. \`bilder/mein-eintrag.jpg\`.
   - Falls du keine Dateien herunterladen kannst: Trage bei "image" stattdessen eine direkte https-URL zu einer Bilddatei ein (muss direkt auf .jpg/.png/.webp/.gif zeigen, keine HTML-Seite).
3. Lege im Wurzelverzeichnis der ZIP eine Datei \`tierlist.json\` mit genau diesem Aufbau an:

\`\`\`json
{
  "title": "Kurzer Titel des Boards",
  "description": "Ein Satz, worum es geht und wonach bewertet wird.",
  "tiers": [
    { "name": "S", "color": "#ff7f7f" },
    { "name": "A", "color": "#ffbf7f" },
    { "name": "B", "color": "#ffdf7f" },
    { "name": "C", "color": "#ffff7f" },
    { "name": "D", "color": "#bfff7f" },
    { "name": "F", "color": "#7fbfff" }
  ],
  "items": [
    {
      "name": "Name des Eintrags",
      "description": "1–3 sachliche Sätze, die beim Einordnen helfen.",
      "image": "bilder/name-des-eintrags.jpg",
      "jahr": "1999",
      "quelle": "https://commons.wikimedia.org/wiki/File:…",
      "lizenz": "CC BY-SA 4.0"
    }
  ]
}
\`\`\`

## Regeln für die JSON

- "title" (kurz) und "description" (ein Satz) beschreiben das Board.
- "tiers" ist optional: Ränge vom besten zum schlechtesten, jeweils mit "name" und "color" als Hex-Farbe. Ohne "tiers" gelten S, A, B, C, D, F.
- "items" enthält ein Objekt pro Eintrag:
  - "name": Pflichtfeld, eindeutig, höchstens 200 Zeichen.
  - "description": kurz und neutral, keine Wertung vorwegnehmen.
  - "image": exakter Pfad der Bilddatei innerhalb der ZIP oder eine https-URL.
  - Beliebig viele weitere Felder mit kurzen Text- oder Zahlenwerten (z. B. "jahr", "herkunft", "hersteller", "quelle", "lizenz"). Sie werden in der Detailansicht angezeigt. Verwende bei allen Einträgen dieselben Feldnamen.
- Gültiges JSON in UTF-8: keine Kommentare, keine Platzhalter, keine abschließenden Kommas.

## Abschluss

4. Prüfe vor dem Packen: Jeder "image"-Pfad existiert in der ZIP, jede Bilddatei ist ein echtes Bild im erlaubten Format, kein Eintrag fehlt oder ist doppelt.
5. Packe \`tierlist.json\` und den Ordner \`bilder/\` in die Datei \`${file}\` und stelle sie mir zum Download bereit.
6. Liste mir zum Schluss kurz alle Einträge mit Bildquelle auf und nenne Einträge, für die du kein passendes Bild gefunden hast.`;
}

/** Copies text, with a fallback for plain-http hosts where the Clipboard API is unavailable. */
async function copyText(text: string, fallback: HTMLTextAreaElement | null) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    if (!fallback) return false;
    fallback.select();
    return document.execCommand('copy');
  }
}

export function AiPromptDialog({ onClose }: { onClose: () => void }) {
  const [topic, setTopic] = useState('');
  const [count, setCount] = useState(20);
  const [unlimited, setUnlimited] = useState(false);
  const [copied, setCopied] = useState<boolean | null>(null);
  const area = useRef<HTMLTextAreaElement>(null);
  const prompt = useMemo(() => buildPrompt(topic, unlimited ? null : count), [topic, count, unlimited]);

  async function copy() {
    setCopied(await copyText(prompt, area.current));
  }

  return (
    <Modal title="Board mit KI erstellen" onClose={onClose} size="lg">
      <div className="stack">
        <p className="muted">
          Kopiere diesen Prompt in eine KI mit Websuche und Dateizugriff (z. B. Claude oder ChatGPT). Sie sucht Einträge und Bilder zum Thema und
          liefert eine ZIP, die du hier direkt hochladen kannst.
        </p>
        <div className="row row-wrap">
          <label className="field prompt-topic">
            <span>Thema</span>
            <input
              value={topic}
              onChange={(e) => {
                setTopic(e.target.value);
                setCopied(null);
              }}
              placeholder="z. B. Nintendo-64-Spiele, Pokémon der 1. Generation, Brotsorten"
              autoFocus
            />
          </label>
          <label className="field prompt-count">
            <span>Einträge</span>
            <input
              type="number"
              min={2}
              max={2000}
              value={count}
              disabled={unlimited}
              onChange={(e) => {
                setCount(Math.min(2000, Math.max(2, Number(e.target.value) || 2)));
                setCopied(null);
              }}
            />
          </label>
          <label className="check prompt-unlimited">
            <input
              type="checkbox"
              checked={unlimited}
              onChange={(e) => {
                setUnlimited(e.target.checked);
                setCopied(null);
              }}
            />
            Keine Einschränkung
          </label>
        </div>
        <textarea ref={area} className="prompt-preview" value={prompt} readOnly rows={14} aria-label="Prompt" />
        <div className="row">
          <button className="btn btn-primary" onClick={copy}>
            <Icon name={copied ? 'check' : 'content_copy'} /> {copied ? 'Kopiert' : 'Prompt kopieren'}
          </button>
          {copied === false && <span className="muted small">Kopieren nicht möglich. Markiere den Text oben und kopiere ihn manuell.</span>}
        </div>
      </div>
    </Modal>
  );
}
