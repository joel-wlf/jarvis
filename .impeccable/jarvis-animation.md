# Jarvis-Figur: Animation

Ergänzt [jarvis-figur-prompts.md](jarvis-figur-prompts.md) (Grundprompt, Richtungen, Zustände).

## Prinzip

- **Innerhalb eines Zustands: Stop-Motion.** Wenige Bilder, harter Wechsel ohne Überblendung, 2–3 fps. Beispiel Ruhe: Augen offen, offen, halb, zu, offen. Das Blinzeln wirkt bewusst getaktet, fast handgemacht.
- **Zwischen Zuständen: weiche Blur-Überblendung.** Das alte Bild wird kurz unscharf und blendet aus, das neue kommt unscharf herein und wird scharf, insgesamt 300–400 ms. Der Kontrast zwischen getaktet und fließend macht die Figur lebendig, ohne nach Effekt auszusehen.
- **Zufällige Pausen:** Blinzeln nicht im festen Rhythmus, sondern alle 3–7 Sekunden. Dazwischen steht das Ruhebild.
- **Weniger Bewegung** (Systemeinstellung): kein Blinzeln, Zustandswechsel als einfacher kurzer Wechsel ohne Blur.

## Was generiert wird

Pro Zustand ein Sprite-Sheet mit 2–4 Bildern in einer Reihe:

| Zustand | Datei | Bilder |
|---|---|---|
| Ruhe | `idle.png` | Augen offen · halb geschlossen · geschlossen |
| Hört zu | `listening.png` | offen · weit offen |
| Denkt | `thinking.png` | Blick oben links · Blick oben rechts · Blick oben links |
| Spricht | `speaking.png` | lächelnd · lächelnd heller · lächelnd |
| Neu | `notify.png` | 2 Bilder |
| Erledigt | `happy.png` | 2 Bilder |
| Nacht | `sleep.png` | 2 Bilder |
| Störung | `error.png` | 2 Bilder |

## Prompt-Zusatz

An den Grundprompt anhängen, Hauptbild als Referenz mitgeben:

> Sprite sheet, N frames in a single row, equal square cells. Identical character, position, size, camera, lighting and background in every frame. Only the eyes change between frames; the body stays exactly the same. Frames: [Beschreibung pro Bild aus der Tabelle]. Suitable for a slow 3 fps stop-motion loop.

**Wichtig:** Nur die Augen ändern sich. Bewegen sich nur die Augen, fällt jede kleine Abweichung am Körper kaum auf.

## Ablage

- Sheets in `admin/public/jarvis/`, benannt nach Zustand.
- Raster angeben (z. B. 3×1), dann werden Blinzeln und Blur-Übergänge eingebaut.
