# Jarvis-Figur: Prompts für dein Bildmodell

Ziel: Eine Figur mit Charakter, die mitten auf der hellen Bühne steht, ruhig atmet und mit einer Sprechblase redet. Der Rest der Oberfläche ist hell, kühl und scharfkantig, so wie bei der „Parking Status Overview“.

## Vorgehen

1. **Hauptbild zuerst.** Generiere mit dem Grundprompt unten so lange, bis eine Figur passt. Dieses Bild ist ab dann die Referenz für alles Weitere.
2. **Zustände.** Für jeden Zustand ein Bild mit demselben Grundprompt, dem Hauptbild als Referenz und dem Zusatz aus der Tabelle. Gleiche Kamera, gleiches Licht, gleiche Größe im Bild.
3. **Atmen.** Bei einem reinen Bildmodell reicht ein Standbild pro Zustand: Das Atmen (minimales Heben und Weiten plus Schatten) baue ich im Code. Wenn dein Modell auch Videos kann, ist pro Zustand eine nahtlose Schleife von 3–4 Sekunden besser.
4. **Lieferformat.** PNG mit transparentem Hintergrund, quadratisch, mindestens 1536 × 1536. Falls kein transparenter Hintergrund geht: einfarbig `#E9ECF0` (das ist der Bühnengrund), dann stanze ich frei. Videos als MP4 auf `#E9ECF0` oder WebM mit Alpha.
5. **Ablage.** In den Ordner `app/assets/jarvis/`, benannt nach Zustand: `idle.png`, `listening.png` usw.

## Drei Richtungen für die Figur (eine wählen)

**A. Porzellan-Wesen (meine Empfehlung).** Ein glatter, matt-weißer Porzellankörper wie ein großer Kieselstein, der knapp über dem Boden schwebt. Vorn ein dunkles Glasband als Gesicht, darin zwei weiche Lichtaugen. Freundlich, ruhig, wirkt wie ein hochwertiges Produkt. Die Augen und ein feiner Lichtsaum zeigen den Zustand.

**B. Kleiner Schreibtisch-Butler.** Ein kompakter Roboter mit abgerundetem Würfelkopf auf schlankem Hals und einem Bildschirm-Gesicht. Hat am meisten Charakter (Nicken, Neigen), droht aber nach „Standard-Roboter“ auszusehen.

**C. Lichtkern im Milchglas.** Eine Milchglaskugel mit einem weich pulsierenden Licht im Inneren, das andeutungsweise ein Gesicht formt. Am ruhigsten, aber mit dem wenigsten Charakter.

## Grundprompt (Richtung A)

> Premium 3D product render of a small friendly AI companion character named Jarvis. A smooth matte white porcelain body shaped like a large soft pebble, gently floating a few centimetres above the ground, subtle soft contact shadow beneath. On its front a horizontal band of dark smoked glass forms the face, with two soft rounded light eyes glowing calm cool blue. Minimal, no limbs, no text, no logo. Soft diffuse studio lighting from upper left, very light cool grey seamless background (#E9ECF0), gentle ambient occlusion, subtle subsurface scattering in the porcelain. Three-quarter front view, character centred, occupying about 45 percent of the frame height, square format. Calm, trustworthy, slightly playful, Apple-like industrial design, photorealistic materials, high detail, no clutter.

Für **B** ersetze den zweiten und dritten Satz durch: *A compact desk robot with a rounded-cube head on a slim neck and a small weighted base, matte white ceramic shell, the face is a black glossy screen showing two simple rounded eyes.*

Für **C**: *A frosted milk-glass sphere resting on a thin white porcelain ring, inside a soft warm-white light that loosely suggests two eyes and a smile.*

## Zustände

Zusatz jeweils ans Ende des Grundprompts hängen, Hauptbild als Referenz mitgeben.

| Datei | Wann | Zusatz zum Prompt |
|---|---|---|
| `idle.png` | Grundzustand | *Eyes relaxed and half-open, content expression, body upright and still.* |
| `listening.png` | Du sprichst oder tippst | *Body tilted slightly towards the viewer, eyes wide open and attentive, a thin soft blue light rim along the glass band.* |
| `thinking.png` | Jarvis arbeitet an einer Antwort | *Eyes looking slightly up and to the side, a faint soft light shimmer moving across the glass band.* |
| `speaking.png` | Sprechblase ist offen | *Eyes friendly and slightly squinted as if smiling, body leaning a little forward, light in the eyes a bit brighter.* |
| `notify.png` | Etwas Neues braucht dich | *Eyes bright amber instead of blue, body lifted slightly higher, alert but friendly expression.* |
| `happy.png` | Alles erledigt | *Eyes curved upward like a smile, soft green tint in the eye light, relaxed and pleased.* |
| `sleep.png` | Nachts / keine Verbindung | *Eyes closed as thin lines, light dimmed, body resting lower, close to the ground.* |
| `error.png` | Ein Dienst ist gestört | *Eyes as small concerned shapes in soft red, body slightly sunk, worried but calm.* |

## Wenn dein Modell Videos kann

Prompt für die Schleife pro Zustand, mit dem Standbild als Startbild:

> Seamless 4-second loop. The character breathes slowly: the body rises about 2 percent and gently swells, then settles back; the eye light pulses softly in sync. Camera completely static, lighting and background unchanged, no other movement. First and last frame identical.

## Was ich im Code daraus mache

- Atmen, leichtes Schweben und der Schatten laufen im Code, damit auch Standbilder lebendig wirken.
- Zustandswechsel überblenden weich (keine harten Schnitte).
- Die Sprechblase sitzt rechts oben an der Figur und zeigt immer das Wichtigste, mit Antwortknöpfen darunter.
- Bei „weniger Bewegung“ steht die Figur still.
