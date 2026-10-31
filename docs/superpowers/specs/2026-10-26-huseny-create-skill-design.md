# huseny-create Skill — Design Spec

**Date:** 2026-10-26
**Author:** huseny80@gmail.com
**Status:** Approved for implementation

---

## 1. Purpose & Scope

`huseny-create` is a Claude Code custom skill that generates production-quality,
self-contained interactive HTML artifacts. It covers four artifact categories:

1. **SVG Diagrams** — force graphs, particle systems, flow networks
2. **3D CSS / WebGL** — glassmorphism cards, perspective transforms, depth effects
3. **Data Visualizers** — animated charts, infographics, scrollytelling
4. **Cursor-FX** — cursor-reactive parallax, magnetic elements, orbital systems

Every artifact is adaptive (light + dark theme), fully self-contained (no runtime
CDN calls), and delivered both as a `.html` file on disk and as a Claude Artifact.

---

## 2. Repository Structure

```
huseny80/huseny-create/
├── SKILL.md                    # Hub: routing, workflow, design rules
├── README.md                   # Install guide + usage examples
├── templates/
│   ├── svg-diagrams.md         # SVG artifact rules + generation patterns
│   ├── css-3d.md               # 3D CSS/WebGL rules + generation patterns
│   ├── data-viz.md             # Data viz rules + generation patterns
│   └── cursor-fx.md            # Cursor-reactive rules + generation patterns
├── output/                     # Generated artifacts (gitignored)
└── .gitignore
```

---

## 3. Slash Command

```
/huseny-create [optional: "natural language prompt"]
```

**Installed via:**
```
install this skill huseny80/huseny-create
```

---

## 4. Workflow Logic

### 4.1 Entry Decision Tree

```
/huseny-create [optional prompt]
        │
        ▼
  Inline prompt provided?
   ├─ YES → classify into artifact type
   │         → load matching template module
   │         → generate artifact
   │         → run 5-point checklist
   │         → deliver (.html + Artifact)
   │
   └─ NO  → ask ONE question:
             "What are you building? Describe the mood, purpose, or domain."
                  │
                  ▼
             Classify response → pitch 3 named concepts
                  │
                  ▼
             User picks (1 / 2 / 3) or "none, try again"
                  │
                  ▼
             Load matching template → generate → checklist → deliver
```

### 4.2 Concept Pitch Format

When no inline prompt is provided, Claude presents exactly 3 named concepts:

```
Here are 3 concepts:

1. **[Name]** — [One-line description of the interaction + visual style]
2. **[Name]** — [One-line description of the interaction + visual style]
3. **[Name]** — [One-line description of the interaction + visual style]

Pick one (1/2/3) or describe what you actually want.
```

Concept names must be evocative and specific (e.g., "Orbital Drift", "Neuro Map",
"Prism Shelf") — never generic (e.g., "Option A", "Dark Chart").

### 4.3 Artifact Type Classification

Claude maps user intent to one of four types using these signals:

| Type | Keywords / Signals |
|---|---|
| `svg-diagrams` | graph, network, nodes, flow, force, connections, tree |
| `css-3d` | card, glass, 3D, depth, perspective, frosted, layered |
| `data-viz` | chart, data, metrics, stats, bars, lines, numbers, dashboard |
| `cursor-fx` | cursor, mouse, magnetic, parallax, orbit, reactive, follow |

When ambiguous, default to `cursor-fx` — it has the highest visual impact.

---

## 5. Pre-Delivery Checklist (Hub-Enforced)

Claude must verify all 5 points before publishing or writing the file:

1. **Self-contained** — zero external network calls at runtime; all JS/CSS inlined
2. **Adaptive themes** — both `prefers-color-scheme: light` and `dark` render
   without layout breaks
3. **Primary interaction verified** — cursor tracking, animation, or hover
   confirmed present and functional in the code
4. **No error conditions** — no `console.error`, no uncaught promise rejections,
   no undefined variable references
5. **Dual delivery** — Claude Artifact published AND `.html` written to
   `output/<kebab-slug>.html`

If any point fails, Claude fixes before delivering — never skips.

---

## 6. Design Token Contract

All artifacts must use CSS custom properties for every color value.
No hardcoded hex values outside `:root` declarations.

```css
:root {
  --bg:          #ffffff;
  --bg-surface:  #f5f5f5;
  --fg:          #0a0a0a;
  --fg-muted:    #6b6b6b;
  --accent:      #3b82f6;
  --accent-glow: rgba(59, 130, 246, 0.15);
  --border:      rgba(0, 0, 0, 0.08);
  --radius:      12px;
  --transition:  0.25s cubic-bezier(0.4, 0, 0.2, 1);
}

@media (prefers-color-scheme: dark) {
  :root {
    --bg:          #0a0a0a;
    --bg-surface:  #141414;
    --fg:          #f5f5f5;
    --fg-muted:    #888888;
    --accent:      #60a5fa;
    --accent-glow: rgba(96, 165, 250, 0.15);
    --border:      rgba(255, 255, 255, 0.08);
  }
}
```

---

## 7. Mandatory Technical Constraints

These apply to every artifact, regardless of type:

| Constraint | Rule |
|---|---|
| External dependencies | Zero at runtime — all inlined |
| Output format | Single `.html` file, no build step |
| Animation loop | `requestAnimationFrame` only — no `setInterval`/`setTimeout` loops |
| Cursor tracking | `mousemove` on `document`, not individual elements |
| Mobile fallback | If no pointer device detected, animation runs in auto-pilot mode |
| File naming | `output/<kebab-slug>.html` (e.g., `output/orbital-drift.html`) |
| Viewport | Must be responsive; no fixed-width layouts |

---

## 8. Template Module Responsibility Split

| Concern | Hub `SKILL.md` | Module `templates/*.md` |
|---|---|---|
| Workflow routing | ✓ | |
| Concept pitch format | ✓ | |
| Design token contract | ✓ | |
| Technical constraints | ✓ | |
| Pre-delivery checklist | ✓ | |
| Artifact type rules | | ✓ |
| Code generation patterns | | ✓ |
| Interaction-specific APIs | | ✓ |

---

## 9. Template Module Summaries

### 9.1 `svg-diagrams.md`
- SVG `<g>` grouping patterns for force-directed layouts
- D3-style positioning via vanilla JS (no D3 dependency)
- Node pulse animations via CSS `@keyframes`
- Edge/link rendering with `<path>` and Bezier curves
- Hover: highlight connected nodes, dim unconnected

### 9.2 `css-3d.md`
- `perspective` + `transform-style: preserve-3d` patterns
- Glassmorphism: `backdrop-filter: blur()` + `--accent-glow`
- Depth-shift on cursor proximity using `transform: rotateX/Y`
- `will-change: transform` on animated elements for GPU compositing
- Stacking layers via `translateZ` increments

### 9.3 `data-viz.md`
- SVG-based bar, line, scatter — no charting library dependency
- Animated entrance: bars grow from baseline, lines draw via `stroke-dashoffset`
- Tooltip: absolutely positioned `<div>`, follows cursor, fades in/out
- Axis labels via SVG `<text>` elements
- Scrollytelling: `IntersectionObserver` triggers animation on scroll-into-view

### 9.4 `cursor-fx.md`
- Cursor position tracked as normalized `{x: 0..1, y: 0..1}` relative to viewport
- Magnetic effect: `lerp()` function smooths element toward cursor
- Orbital system: elements orbit cursor position via trigonometry in `rAF` loop
- Parallax: multiple depth layers move at different speeds relative to cursor
- Auto-pilot: when no pointer, elements animate on a sine/cosine path

---

## 10. Output & Delivery

```
output/
└── <artifact-name>.html    # Self-contained, ready to open in any browser
```

Claude also publishes a Claude Artifact immediately after writing the file,
so the user sees a live preview in chat without needing to open a file.

---

## 11. GitHub Repository Setup

```
Repo:     huseny80/huseny-create
License:  MIT
Topics:   claude-code, claude-skill, interactive, artifacts, creative-coding
```

Install command users will run:
```
install this skill huseny80/huseny-create
```

---

## 12. Success Criteria

- `/huseny-create` with no prompt → pitches 3 concepts within one response
- `/huseny-create "a solar system that follows my cursor"` → generates directly,
  no back-and-forth
- Every generated artifact opens in a browser without errors
- Light and dark themes both render correctly
- File exists at `output/<name>.html` after every successful generation
- Claude Artifact is published in the same response as the file write
