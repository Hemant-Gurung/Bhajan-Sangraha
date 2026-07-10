---
# Bachan & Bhajan — design tokens (machine-readable)
colors:
  bg: "#ECEAE3"          # app canvas behind the panel
  panel: "#FAF8F3"       # warm cream surface (home + operator body)
  card: "#FFFFFF"        # raised cards, inputs, buttons
  ink: "#2B2B27"         # primary text
  muted: "#9A968C"       # secondary text, labels, captions
  line: "#E4E0D6"        # borders and hairlines
  olive: "#6E7656"       # primary accent (Songs, active states, primary segment)
  terra: "#B06A44"       # secondary accent (Bible, primary action button)
  amber: "#E8A33D"       # highlight accent (sun, small flourishes)
  logoNavy: "#080C1A"    # projector logo-screen background (matches the logo art)

typography:
  displayXl:             # hero headline
    family: "Georgia, Spectral, 'Times New Roman', serif"
    size: "46px"
    weight: 400
    lineHeight: 1.1
  displayLg:             # card titles, section headings
    family: "Georgia, Spectral, 'Times New Roman', serif"
    size: "30px"
    weight: 400
  brand:                 # wordmark next to the logo
    family: "Georgia, Spectral, 'Times New Roman', serif"
    size: "22px"
    weight: 400
  body:
    family: "-apple-system, 'Segoe UI', system-ui, sans-serif"
    size: "15px"
    weight: 400
    lineHeight: 1.6
  label:                 # eyebrows, field labels, meta (always UPPERCASE)
    family: "ui-monospace, 'SF Mono', Menlo, monospace"
    size: "11px"
    weight: 400
    letterSpacing: "0.08em"
    textTransform: "uppercase"
    color: "muted"
  deva:                  # Devanagari (Nepali lyrics, titles, sub-lines)
    family: "'Noto Sans Devanagari', Mangal, 'Devanagari MT', sans-serif"
    weight: 400

rounded:
  sm: "10px"             # grid buttons, small chips
  md: "12px"             # inputs, buttons, preview
  lg: "14px"             # cards, controls panel, media tiles
  xl: "18px"             # top-level panels (home, shell body)
  pill: "999px"          # segmented controls, brand mark, live dot

spacing:
  xs: "4px"
  sm: "8px"
  md: "14px"
  lg: "18px"
  xl: "24px"
  xxl: "28px"            # column padding

components:
  brandMark:
    size: "38px"
    rounded: "pill"
  segmentedControl:      # e.g. tab switcher, translation, lyric mode
    backgroundColor: "panel"
    rounded: "pill"
    padding: "4px"
  segmentActive:
    backgroundColor: "olive"
    textColor: "card"
    rounded: "pill"
  primaryButton:         # Send to Projector
    backgroundColor: "terra"
    textColor: "card"
    rounded: "md"
    height: "auto"
  secondaryButton:       # Previous / Next / Blank / Logo / Freeze
    backgroundColor: "card"
    textColor: "ink"
    rounded: "md"
  sourceCard:            # home Songs / Bible cards
    backgroundColor: "card"
    rounded: "xl"
    padding: "24px"
  gridButton:            # chapter / verse cells
    backgroundColor: "card"
    textColor: "ink"
    rounded: "sm"
    size: "aspect-ratio 1"
  gridButtonSelected:
    backgroundColor: "olive"
    textColor: "card"
    rounded: "sm"
  controlsPanel:         # collapsible "Appearance" disclosure
    backgroundColor: "card"
    rounded: "lg"
---

# Overview

Bachan & Bhajan ("Word & Song") is an offline lyrics-and-Bible projection tool for
Nepali churches. The interface is a calm, warm control room: the operator drives a
service without the UI competing with it. The visual language is **quiet paper and
worship light** — cream surfaces, a serif display voice, monospace labels for
structure, and two earthy accents (olive for song, terracotta for scripture). Nothing
is loud except the one thing the operator is about to do: send a slide.

The audience is a volunteer operator, often non-technical, working live under time
pressure. Legibility, generous tap targets, and a layout that never shifts under them
matter more than decoration.

# Colors

The palette is drawn from a Nepali hillside chapel at sunrise: cream mist, olive
foliage, terracotta earth, and a low amber sun.

- **Surfaces** step from `bg` (#ECEAE3) → `panel` (#FAF8F3) → `card` (#FFFFFF), lightest
  where the operator acts. Keep this order; never put a card darker than its panel.
- **olive** (#6E7656) is the *song* accent and the default "active/selected" color.
- **terra** (#B06A44) is the *scripture* accent and the single primary-action color
  (Send to Projector). Reserve terracotta for the one commit action per screen.
- **amber** (#E8A33D) is a highlight only — small flourishes, never a fill for text or
  large areas.
- **logoNavy** (#080C1A) exists solely so the projector's logo screen blends seamlessly
  into the logo artwork's own background. Do not use it as UI chrome.

Text is `ink` on light surfaces and `muted` for anything secondary. There is no pure
black and no pure-white text on colored fills except on `olive`/`terra` buttons.

# Typography

Three voices, each with a job:

- **Serif (Georgia)** is the display voice — headlines, card titles, the wordmark. It
  carries warmth and a hymnal feel. Use it at large sizes with restraint; never for
  body copy or controls.
- **Sans (system UI)** is the body and interface voice — descriptions, buttons, verse
  numbers. Neutral and legible.
- **Mono** is the *structural* voice — eyebrows, field labels, counts, references. It
  is always UPPERCASE with letter-spacing, and always `muted`. Mono signals "this is a
  label, not content."
- **Devanagari (Noto Sans Devanagari)** renders all Nepali — lyrics, titles, sub-lines.
  It is bundled as a local font so the app works fully offline. Pair it beneath or
  beside the Latin equivalent, never as a substitute for a label.

# Layout

- Both primary screens (home, operator) render inside a **fixed, centered shell**
  sized `min(1760px, 94vw) × min(1000px, 94vh)`. Resizing the OS window changes only the
  margin around the shell, never the internal layout. This keeps the operator's muscle
  memory intact across displays; target is 1920×1080.
- The operator is a **two-column** layout: a `420px` left rail (source selection) and a
  fluid right column (preview + controls + actions).
- The right column is a vertical stack: **preview (fixed height) → Appearance
  (collapsed) → Prev/Next → Send → utility row**. Everything fits at a glance when
  Appearance is closed; opening Appearance pushes the buttons down and the column
  scrolls. The preview never compresses.
- Long lists (chapters, verses, results) scroll **inside their own capped box**, so the
  surrounding controls stay put.

# Elevation & Depth

Depth is subtle and warm, never a hard drop shadow.

- `shadow-sm` (0 1px 3px /.06) — cards, buttons at rest.
- `shadow-md` (0 4px 16px /.08) — the main panel and raised surfaces.
- `shadow-lg` (0 8px 32px /.12) — hover lift on source cards only.

The preview uses a soft *inset* shadow to read as a screen recessed into the panel.
Hover raises a card ~4px; active settles it back. Motion is short (.15–.25s ease).

# Shapes

Rounding increases with surface size: small controls `10–12px`, cards and panels
`14–18px`, anything pill-shaped (segments, brand mark, live indicator) fully round
(`999px`). No sharp corners anywhere; no border-radius above 18px on rectangles.

# Components

- **Segmented control** — a pill track (`panel`) holding options; the active option is a
  filled `olive` pill (`terra` in Bible context). Used for tabs, translation, and lyric
  mode.
- **Primary button (Send to Projector)** — full-width `terra` fill, the only heavy
  element on the screen. One per screen.
- **Secondary buttons** — white `card` with a `line` border for navigation and utility
  (Previous, Next, Blank, Logo, Freeze, Close).
- **Grid button** — square cell for chapters/verses; `card` at rest, `olive` when
  selected. Grids cap their height and scroll.
- **Source card (home)** — a large illustration tile on the left, title + Devanagari
  sub + description + a colored circular go-arrow (olive for Songs, terra for Bible).
- **Appearance disclosure** — a collapsible panel headed by a mono "APPEARANCE" label
  and a rotating chevron; collapsed by default to keep the screen calm.
- **Brand mark** — the round logo image at 38px beside the "Bachan & Bhajan" wordmark.

# Do's and Don'ts

**Do**
- Reserve `terra` for the single commit action (Send); reserve `olive` for
  active/selected state and the song world.
- Keep every label mono, uppercase, and `muted` — labels are scaffolding, not content.
- Pair Latin and Devanagari so the operator can scan either script.
- Keep the shell a fixed centered canvas; let the margin absorb window resizing.
- Keep the screen quiet: one bold element (Send), everything else disciplined.

**Don't**
- Don't use amber for text or large fills, or navy for UI chrome.
- Don't let the preview shrink when Appearance opens — scroll instead.
- Don't introduce a fourth accent or a second display face.
- Don't put content in the mono voice, or labels in the serif voice.
- Don't add motion beyond short functional transitions — extra animation reads as noise
  in a live worship tool.
