# huseny-create Skill Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build and publish the `huseny-create` Claude Code custom skill — a hub + 4 template modules that generate self-contained interactive HTML artifacts via `/huseny-create`.

**Architecture:** A lean `SKILL.md` hub owns routing, workflow, design token contract, and the pre-delivery checklist. Four `templates/*.md` modules own artifact-type-specific generation rules and code patterns. Claude reads the hub on every invocation and loads the matching module based on intent classification.

**Tech Stack:** Markdown (SKILL.md + modules), HTML5, CSS custom properties, vanilla JS (no build step, no dependencies), Git, GitHub.

**Spec:** `docs/superpowers/specs/2026-10-26-huseny-create-skill-design.md`

## Global Constraints

- Zero external runtime dependencies — all JS/CSS inlined in generated artifacts
- Single `.html` output file per artifact, no build step required
- CSS custom properties for ALL colors — no hardcoded hex outside `:root`
- `requestAnimationFrame` only for animation — no `setInterval`/`setTimeout` loops
- `mousemove` tracked on `document`, not individual elements
- Mobile fallback: auto-pilot animation when no pointer device detected
- Adaptive theme: `prefers-color-scheme` dark + light both render without breaks
- Output path: `output/<kebab-slug>.html`
- Dual delivery: Claude Artifact published + `.html` written in same response

## Review Focus

- **Inline prompt with ambiguous type** — `/huseny-create "something cool"` should default to `cursor-fx`, not error or stall asking for clarification
- **No pointer device** — artifact should animate autonomously via sine/cosine path, not freeze or show a broken static layout
- **Dark mode layout breaks** — elements sized with `color`-dependent values (e.g., shadows, borders) must reflow correctly when `prefers-color-scheme` switches
- **Concept re-roll** — user says "none, try again" after pitch; hub must re-pitch 3 new concepts, not repeat the same ones
- **Very long inline prompt** — `/huseny-create "a force-directed graph of all React hooks with animated edges, tooltips, dark glassmorphism panels, magnetic cursor, and particle trail"` must produce one artifact, not stall or split into sub-tasks

---

## File Map

| File | Action | Responsibility |
|---|---|---|
| `SKILL.md` | Create | Hub: slash command, routing, workflow, design tokens, checklist |
| `templates/svg-diagrams.md` | Create | SVG artifact rules + generation patterns |
| `templates/css-3d.md` | Create | 3D CSS/WebGL rules + generation patterns |
| `templates/data-viz.md` | Create | Data viz rules + generation patterns |
| `templates/cursor-fx.md` | Create | Cursor-reactive rules + generation patterns |
| `README.md` | Create | Install guide, usage examples, screenshots placeholder |
| `.gitignore` | Create | Ignores `output/` directory |
| `output/.gitkeep` | Create | Keeps `output/` tracked while ignoring its contents |

---

### Task 1: Repository Scaffold

**Files:**
- Create: `.gitignore`
- Create: `output/.gitkeep`
- Create: `templates/` (empty directory via `.gitkeep`)

**Interfaces:**
- Produces: repo structure all subsequent tasks write into

- [ ] **Step 1: Initialize repo locally**

```bash
mkdir -p huseny-create/templates huseny-create/output
cd huseny-create
git init
```

- [ ] **Step 2: Write `.gitignore`**

```
output/*
!output/.gitkeep
.DS_Store
```

- [ ] **Step 3: Create placeholder files**

```bash
touch output/.gitkeep
touch templates/.gitkeep
```

- [ ] **Step 4: Verify structure**

```bash
find . -not -path './.git/*' | sort
```
Expected output:
```
.
./.gitignore
./output
./output/.gitkeep
./templates
./templates/.gitkeep
```

- [ ] **Step 5: Commit**

```bash
git add .gitignore output/.gitkeep templates/.gitkeep
git commit -m "chore: scaffold repo structure"
```

---

### Task 2: SKILL.md Hub

**Files:**
- Create: `SKILL.md`

**Interfaces:**
- Produces: the primary file Claude reads on `/huseny-create` invocation
- Consumes: nothing (self-contained orchestration document)

- [ ] **Step 1: Write the trigger block**

Top of `SKILL.md`:
```markdown
---
name: huseny-create
description: Generate self-contained interactive HTML artifacts — SVG diagrams,
  3D CSS/WebGL components, data visualizers, and cursor-reactive effects.
triggers:
  - /huseny-create
  - /huseny-create "<prompt>"
---
```

- [ ] **Step 2: Write the workflow section**

Include the full hybrid decision tree verbatim from spec §4.1:
- If inline prompt → classify → load template → generate → checklist → deliver
- If no prompt → ask one question → pitch 3 concepts → user picks → load template → generate → checklist → deliver
- "none, try again" re-pitch path must be explicit

- [ ] **Step 3: Write the concept pitch format**

Include the exact format from spec §4.2 with placeholder `[Name]` and `[One-line description]` tokens. Add the instruction: "Never repeat concepts from a prior pitch in the same session."

- [ ] **Step 4: Write the intent classification table**

| Type | Keywords / Signals |
|---|---|
| `svg-diagrams` | graph, network, nodes, flow, force, connections, tree |
| `css-3d` | card, glass, 3D, depth, perspective, frosted, layered |
| `data-viz` | chart, data, metrics, stats, bars, lines, numbers, dashboard |
| `cursor-fx` | cursor, mouse, magnetic, parallax, orbit, reactive, follow |

Include: "When ambiguous, default to `cursor-fx`."

- [ ] **Step 5: Write the design token contract**

Paste the full CSS block from spec §6 verbatim — both `:root` (light) and `@media (prefers-color-scheme: dark)` blocks. Add: "Claude must paste this token block verbatim into every generated artifact. No hardcoded hex values outside `:root`."

- [ ] **Step 6: Write the mandatory technical constraints section**

Copy the constraint table from spec §7 verbatim.

- [ ] **Step 7: Write the pre-delivery checklist**

Copy all 5 checklist items from spec §5 verbatim. Add the instruction: "Do not publish the Artifact or write the file until all 5 pass. Fix first, then deliver."

- [ ] **Step 8: Write the template loading instruction**

```markdown
## Loading Template Modules

After classifying intent, read the matching template file before generating:

- `svg-diagrams` → load `templates/svg-diagrams.md`
- `css-3d`        → load `templates/css-3d.md`
- `data-viz`      → load `templates/data-viz.md`
- `cursor-fx`     → load `templates/cursor-fx.md`

Apply the module's rules on top of the hub's global constraints.
```

- [ ] **Step 9: Verify SKILL.md completeness**

Read through and confirm all 7 sections are present:
1. Trigger block
2. Hybrid workflow decision tree (including re-roll path)
3. Concept pitch format
4. Intent classification table
5. Design token contract (full CSS)
6. Mandatory technical constraints
7. Pre-delivery checklist + template loading instruction

- [ ] **Step 10: Commit**

```bash
git add SKILL.md
git commit -m "feat: add SKILL.md hub with workflow, design tokens, and checklist"
```

---

### Task 3: `templates/svg-diagrams.md`

**Files:**
- Create: `templates/svg-diagrams.md`

**Interfaces:**
- Consumed by: SKILL.md hub when intent classifies as `svg-diagrams`
- Produces: generation rules + code patterns Claude applies during artifact creation

- [ ] **Step 1: Write the module header**

```markdown
# SVG Diagrams — Template Module

Loaded by the huseny-create hub when intent is `svg-diagrams`.
Apply these rules on top of all hub global constraints.
```

- [ ] **Step 2: Write the structure rules**

- SVG `<g>` grouping: one `<g>` per node, one `<g>` for all edges
- Node positions stored as JS array `[{id, x, y, label}]` — no D3 dependency
- Edge/link rendering: `<path>` with quadratic Bezier curve (`Q` command)
- All SVG elements created via `document.createElementNS('http://www.w3.org/2000/svg', tag)`

- [ ] **Step 3: Write the animation patterns**

- Node pulse: CSS `@keyframes pulse { 0%,100%{r:8} 50%{r:11} }` applied via class
- Hover highlight: connected nodes get class `active`, unconnected get class `dimmed`
- Edge draw-on: `stroke-dashoffset` animation from full length to 0 on mount

- [ ] **Step 4: Write the cursor interaction pattern**

```javascript
// Skeleton — implementer fills the force logic
document.addEventListener('mousemove', e => {
  const mx = e.clientX, my = e.clientY;
  nodes.forEach(n => {
    const dx = mx - n.x, dy = my - n.y;
    const dist = Math.hypot(dx, dy);
    // apply gentle attraction if dist < 200
  });
});
```

- [ ] **Step 5: Write the mobile auto-pilot rule**

"If `window.matchMedia('(pointer: none)').matches`, run nodes on a slow sine/cosine drift loop instead of tracking cursor."

- [ ] **Step 6: Commit**

```bash
git add templates/svg-diagrams.md
git commit -m "feat: add svg-diagrams template module"
```

---

### Task 4: `templates/css-3d.md`

**Files:**
- Create: `templates/css-3d.md`

**Interfaces:**
- Consumed by: SKILL.md hub when intent classifies as `css-3d`

- [ ] **Step 1: Write the module header** (same pattern as Task 3 Step 1)

- [ ] **Step 2: Write the 3D CSS rules**

- Container: `perspective: 1000px` on parent
- Card: `transform-style: preserve-3d` + `transition: transform var(--transition)`
- Depth layers: child elements use `translateZ(Npx)` in increments of 20px
- GPU hint: `will-change: transform` on any element animated via `rAF`

- [ ] **Step 3: Write the glassmorphism pattern**

```css
.glass {
  background: var(--bg-surface);
  backdrop-filter: blur(12px) saturate(180%);
  border: 1px solid var(--border);
  box-shadow: 0 8px 32px var(--accent-glow);
  border-radius: var(--radius);
}
```

- [ ] **Step 4: Write the cursor depth-shift pattern**

```javascript
// Skeleton — implementer fills tilt math
document.addEventListener('mousemove', e => {
  const rect = card.getBoundingClientRect();
  const cx = (e.clientX - rect.left) / rect.width - 0.5;   // -0.5..0.5
  const cy = (e.clientY - rect.top)  / rect.height - 0.5;
  card.style.transform = `rotateY(${cx * 20}deg) rotateX(${-cy * 20}deg)`;
});
```

- [ ] **Step 5: Write the mobile auto-pilot rule**

"If no pointer device, animate a slow continuous rotation: `rotateY` oscillates ±10deg on a 4s sine cycle via `rAF`."

- [ ] **Step 6: Commit**

```bash
git add templates/css-3d.md
git commit -m "feat: add css-3d template module"
```

---

### Task 5: `templates/data-viz.md`

**Files:**
- Create: `templates/data-viz.md`

**Interfaces:**
- Consumed by: SKILL.md hub when intent classifies as `data-viz`

- [ ] **Step 1: Write the module header**

- [ ] **Step 2: Write the SVG-only chart rules**

- No charting library — all SVG elements by hand
- Bars: `<rect>` elements, `y` and `height` computed from value scale
- Lines: `<polyline>` with `points` attribute built from value array
- Scatter: `<circle>` elements, `cx`/`cy` from x/y value scale

- [ ] **Step 3: Write the animated entrance patterns**

- Bar chart: bars start at `height=0` and animate to full height via CSS transition on mount
- Line chart: `stroke-dasharray` = total path length; `stroke-dashoffset` animates 0 → length → 0
- Trigger: `IntersectionObserver` fires animation when chart enters viewport

- [ ] **Step 4: Write the tooltip pattern**

```javascript
// Skeleton
const tip = document.getElementById('tooltip');
el.addEventListener('mouseenter', e => {
  tip.textContent = `${label}: ${value}`;
  tip.style.opacity = '1';
});
el.addEventListener('mousemove', e => {
  tip.style.left = `${e.clientX + 12}px`;
  tip.style.top  = `${e.clientY - 24}px`;
});
el.addEventListener('mouseleave', () => tip.style.opacity = '0');
```

Tooltip element: `position: fixed`, `pointer-events: none`, transitions `opacity`.

- [ ] **Step 5: Write the axis label rules**

- X axis: `<text>` elements at each tick, `text-anchor: middle`, `fill: var(--fg-muted)`
- Y axis: `<text>` elements, `text-anchor: end`, `fill: var(--fg-muted)`
- No axis lines — use subtle `var(--border)` grid lines behind bars/lines

- [ ] **Step 6: Commit**

```bash
git add templates/data-viz.md
git commit -m "feat: add data-viz template module"
```

---

### Task 6: `templates/cursor-fx.md`

**Files:**
- Create: `templates/cursor-fx.md`

**Interfaces:**
- Consumed by: SKILL.md hub when intent classifies as `cursor-fx` (also the default fallback)

- [ ] **Step 1: Write the module header**

Add: "This is the default module — loaded when intent is ambiguous."

- [ ] **Step 2: Write the normalized cursor tracking pattern**

```javascript
let mx = 0.5, my = 0.5; // normalized 0..1
document.addEventListener('mousemove', e => {
  mx = e.clientX / window.innerWidth;
  my = e.clientY / window.innerHeight;
});
```

All cursor-reactive math must use `mx`/`my` — not raw pixel values — for viewport independence.

- [ ] **Step 3: Write the lerp utility**

```javascript
const lerp = (a, b, t) => a + (b - a) * t;
// Usage in rAF loop:
el._x = lerp(el._x ?? mx, mx, 0.08);
el._y = lerp(el._y ?? my, my, 0.08);
```

- [ ] **Step 4: Write the magnetic effect pattern**

```javascript
// Skeleton — implementer fills threshold + strength
const THRESHOLD = 0.15; // normalized distance
const STRENGTH = 60;    // pixels
// In rAF: if dist(el_center, cursor) < THRESHOLD, shift el toward cursor
```

- [ ] **Step 5: Write the orbital system pattern**

```javascript
// Skeleton
elements.forEach((el, i) => {
  const angle = (Date.now() / 1000) * speed + (i / elements.length) * Math.PI * 2;
  const ox = Math.cos(angle) * radius;
  const oy = Math.sin(angle) * radius;
  // offset from cursor position: mx * vw + ox, my * vh + oy
});
```

- [ ] **Step 6: Write the parallax depth pattern**

- Multiple `.layer` divs with `data-depth="0.1"` through `data-depth="0.9"`
- In `rAF`: `translateX = (mx - 0.5) * depth * maxShift`, same for Y
- Deeper layers move more; foreground layers move less

- [ ] **Step 7: Write the mobile auto-pilot rule**

"If no pointer device, run `mx` and `my` as `0.5 + 0.4 * Math.sin(t)` and `0.5 + 0.4 * Math.cos(t * 0.7)` in the `rAF` loop — all cursor math runs unchanged."

- [ ] **Step 8: Commit**

```bash
git add templates/cursor-fx.md
git commit -m "feat: add cursor-fx template module (default fallback)"
```

---

### Task 7: README.md

**Files:**
- Create: `README.md`

**Interfaces:**
- Consumed by: GitHub repo visitors + Claude Code install command

- [ ] **Step 1: Write the install section**

```markdown
## Install

```
install this skill huseny80/huseny-create
```
```

- [ ] **Step 2: Write the usage section**

```markdown
## Usage

```bash
# With inline prompt — generates directly
/huseny-create "a particle solar system that follows my cursor"

# Without prompt — pitches 3 concepts, you pick
/huseny-create
```

Output: `output/<artifact-name>.html` + Claude Artifact preview in chat.
```

- [ ] **Step 3: Write the artifact types section**

Brief table: Type | Example prompt | What it produces (one line each).

- [ ] **Step 4: Write the design rules section**

One paragraph: adaptive light/dark, zero dependencies, self-contained `.html`, mobile auto-pilot.

- [ ] **Step 5: Commit**

```bash
git add README.md
git commit -m "docs: add README with install and usage guide"
```

---

### Task 8: End-to-End Validation

**Files:**
- Create: `output/` (artifacts generated during validation — gitignored)

**Interfaces:**
- Consumes: all files created in Tasks 1–7

- [ ] **Step 1: Validate direct-prompt path — cursor-fx**

Run: `/huseny-create "a magnetic field where dots follow the cursor"`
Expected: artifact generated without asking questions; file at `output/magnetic-field.html`; Claude Artifact published.

- [ ] **Step 2: Run 5-point checklist on cursor-fx artifact**

Open `output/magnetic-field.html` in browser:
- [ ] No network requests in DevTools Network tab
- [ ] Dark mode renders correctly (toggle OS theme or DevTools emulate)
- [ ] Cursor movement animates elements
- [ ] No console errors
- [ ] Claude Artifact visible in chat

- [ ] **Step 3: Validate no-prompt path — concept pitch**

Run: `/huseny-create` (no prompt)
Expected: Claude asks one clarifying question OR pitches 3 named concepts directly.

- [ ] **Step 4: Validate re-roll path**

After concept pitch, respond: `none, try again`
Expected: 3 new concept names (none identical to prior pitch).

- [ ] **Step 5: Validate svg-diagrams type**

Run: `/huseny-create "a network graph of programming languages and their influences"`
Expected: SVG-based artifact; force/node layout visible; hover highlights connected nodes.

- [ ] **Step 6: Validate css-3d type**

Run: `/huseny-create "a glassmorphism card that tilts toward my cursor"`
Expected: perspective tilt on mousemove; glass blur effect visible; both themes render.

- [ ] **Step 7: Validate data-viz type**

Run: `/huseny-create "an animated bar chart of the top 5 programming languages by popularity"`
Expected: bars animate in on load; tooltip shows on hover; axes labeled.

- [ ] **Step 8: Validate ambiguous prompt defaults to cursor-fx**

Run: `/huseny-create "something beautiful and interactive"`
Expected: generates a cursor-fx artifact (not an error, not a clarifying question).

- [ ] **Step 9: Push to GitHub and verify install**

```bash
git remote add origin https://github.com/huseny80/huseny-create.git
git push -u origin main
```

Then in a fresh Claude Code session:
```
install this skill huseny80/huseny-create
```
Expected: skill appears in `/huseny-create` command list.

---

## Task Summary

| Task | Deliverable | Gate |
|---|---|---|
| 1 | Repo scaffold | Structure verified |
| 2 | `SKILL.md` hub | All 7 sections present |
| 3 | `templates/svg-diagrams.md` | Module written |
| 4 | `templates/css-3d.md` | Module written |
| 5 | `templates/data-viz.md` | Module written |
| 6 | `templates/cursor-fx.md` | Module written |
| 7 | `README.md` | Install + usage documented |
| 8 | End-to-end validation | All 4 artifact types generate + pass checklist |
