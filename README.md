# TierMaker

Multi-User-Tierlist-Maker: Board per ZIP anlegen, alle ordnen die Einträge für sich in Ränge ein, das Ergebnis ist der **Median** aller Stimmen.

- React-Frontend (Vite, Drag & Drop mit Maus, Touch und Tastatur, responsive)
- Node/Express-Backend mit SQLite (`better-sqlite3`)
- Login per **Google OAuth** (Name + Profilbild kommen von Google) und/oder **Benutzername + Passwort**
- Alle angemeldeten Nutzer sehen alle Boards und können abstimmen; Ersteller:in und Admins verwalten ein Board

## Start mit Docker Compose

```bash
docker compose up -d
```

Die Konfiguration steht als Umgebungsvariablen in [docker-compose.yml](docker-compose.yml):

| Variable | Bedeutung | Standard |
|---|---|---|
| `PUBLIC_URL` | Öffentliche URL der App, Basis für die Google-Redirect-URI | `http://localhost:3000` |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | OAuth-Client aus der Google Cloud Console; beide gesetzt = Google-Login aktiv | leer |
| `GOOGLE_ALLOWED_DOMAINS` | Kommagetrennte E-Mail-Domains, die sich anmelden dürfen | alle |
| `ADMIN_EMAILS` | Google-Konten, die Admin werden | leer |
| `PASSWORD_AUTH` | Login mit Benutzername + Passwort | `true` |
| `ALLOW_REGISTRATION` | Selbstregistrierung mit Passwort | `true` |
| `ADMIN_USERNAME` / `ADMIN_PASSWORD` | Lokaler Admin; ohne Passwort wird beim ersten Start eins erzeugt und geloggt | `admin` / zufällig |
| `COOKIE_SECURE` | Session-Cookie nur über HTTPS | `true` bei `https://`-URL |
| `SESSION_DAYS` | Gültigkeit einer Anmeldung | `30` |
| `MAX_UPLOAD_MB` / `MAX_IMAGE_MB` | Größenlimits für ZIP bzw. einzelnes Bild | `200` / `20` |

Daten (SQLite-DB und Bilder) liegen im Volume unter `/data`.

### Google-Login einrichten

1. In der [Google Cloud Console](https://console.cloud.google.com/apis/credentials) eine *OAuth-Client-ID* vom Typ „Webanwendung“ anlegen.
2. Als autorisierte Weiterleitungs-URI `<PUBLIC_URL>/api/auth/google/callback` eintragen, z. B. `https://tier.example.com/api/auth/google/callback`.
3. Client-ID und -Secret in `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` setzen. Für reinen Google-Login `PASSWORD_AUTH: "false"`.

## ZIP-Format

Bilder (PNG, JPG, GIF, WebP, AVIF, BMP) plus optional eine `tierlist.json` (oder irgendeine andere `.json`):

```json
{
  "title": "Bestes Obst",
  "description": "Welches Obst ist das beste?",
  "tiers": [{ "name": "S", "color": "#ff7f7f" }, "A", "B", "C", "D"],
  "items": [
    { "name": "Apfel", "description": "Knackig.", "image": "bilder/apfel.png", "herkunft": "Deutschland" },
    { "name": "Mango", "image": "https://example.com/mango.jpg" }
  ]
}
```

- `image` ist ein Pfad im ZIP (auch nur der Dateiname reicht) oder eine `https://`-URL. Fehlt es, wird ein Bild mit dem Namen des Eintrags gesucht.
- Weitere Felder (hier `herkunft`) werden in der Detailansicht angezeigt.
- Ohne JSON wird jedes Bild ein Eintrag, der Dateiname wird zum Namen. Bilder ohne JSON-Eintrag werden ebenfalls übernommen.
- Ohne `tiers` gibt es S, A, B, C, D, F.

Eine Beispiel-ZIP liegt unter [client/public/beispiel-tierlist.zip](client/public/beispiel-tierlist.zip) (neu erzeugen: `node server/scripts/make-example.js`).

## Auswertung

Jede Stimme ist der Index des Rangs (S = 1, A = 2, …). Pro Eintrag werden Median, Mittelwert, Standardabweichung und die Verteilung über die Ränge berechnet.

- Der Eintrag landet im Rang seines **Medians**.
- Liegt der Median genau zwischen zwei Rängen (gerade Stimmenzahl), entscheidet der Mittelwert; ist auch der genau in der Mitte, gewinnt der bessere Rang.
- Innerhalb eines Rangs wird nach Median, dann Mittelwert, dann Stimmenzahl sortiert.
- Wann Ergebnisse sichtbar sind, stellt man pro Board ein: immer, nach eigener Abstimmung oder erst nach Ende der Abstimmung. Export als CSV möglich.

## Entwicklung

```bash
cd server && npm install && npm run dev      # API auf :3017, Daten in server/data
cd client && npm install && npm run dev      # Vite auf :5173, proxyt /api und /uploads
cd server && npm test                        # Unit-Tests der Statistik
```

Dann http://localhost:5173 öffnen und mit `admin` / `admin` anmelden. Im Dev-Modus wird dieser Admin bei jedem Start angelegt bzw. zurückgesetzt (Port und Zugangsdaten in [server/.env.dev](server/.env.dev)). Allgemein gilt: Ein gesetztes `ADMIN_PASSWORD` überschreibt beim Start immer das Passwort des Admins.

## Docker Hub per GitHub Action

[.github/workflows/docker.yml](.github/workflows/docker.yml) testet, baut für `linux/amd64` und `linux/arm64` und pusht `benjaminbiber/tiermaker:latest` bei jedem Push auf `main`/`master` (Tags `v*` zusätzlich als Versions-Tag). Im GitHub-Repo werden dafür die Secrets `DOCKERHUB_USERNAME` und `DOCKERHUB_TOKEN` (Docker-Hub-Access-Token) benötigt.
