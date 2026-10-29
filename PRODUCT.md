# Product

## Register

product

## Users
Kolleg:innen im Team, die zum Spaß gemeinsam Dinge ranken (Energydrinks, Spiele, Snacks …). Sie öffnen ein Board, sortieren Einträge per Drag & Drop oder Antippen in Ränge und schauen danach, wie das Team insgesamt entschieden hat. Nutzung am Desktop und am Handy, oft nebenbei.

## Product Purpose
Ein Board wird per ZIP angelegt, jede Person ordnet für sich ein, das Ergebnis ist der Median aller Stimmen. Erfolg heißt: Man kommt ohne Erklärung vom Board zur fertigen eigenen Tierlist und versteht das Gesamtergebnis auf einen Blick.

## Brand Personality
Verspielt, schnell, klar. Die klassischen Tier-Farben dürfen leuchten, die Oberfläche drumherum bleibt ruhig und tritt hinter die Bilder zurück. Kleine Momente der Freude (z. B. wenn alles eingeordnet ist), aber kein Effekt-Feuerwerk.

## Anti-references
- Formular-lastige Admin-Oberflächen mit Textbuttons in jeder Zeile.
- Browser-Standarddialoge (`confirm`, `prompt`) für Bearbeiten und Löschen.
- Lange Seiten, auf denen man zwischen Pool und Rängen hin- und herscrollen muss.

## Design Principles
- **Das Board ist die Bühne**: Ränge und Bilder bekommen den meisten Platz, Bedienelemente sind kompakt.
- **Icons statt Wortbuttons**: Aktionen sind sinnhafte Icon-Buttons mit Tooltip; Text nur dort, wo eine Entscheidung fällt (Dialog-Bestätigung, Formular-Absenden).
- **Ändern im Dialog, Zerstören mit Bestätigung**: Bearbeiten öffnet einen Dialog; Löschen und Statuswechsel brauchen eine eigene Bestätigung.
- **Ohne Scroll-Ping-Pong**: Was man gerade braucht (Pool, Fortschritt), bleibt sichtbar.

## Accessibility & Inclusion
WCAG 2.2 AA als Ziel. Volle Tastaturbedienung (dnd-kit Keyboard-Sensor), Icon-Buttons immer mit `aria-label`, sichtbarer Fokus, `prefers-reduced-motion` respektieren, Hell- und Dunkelmodus.
