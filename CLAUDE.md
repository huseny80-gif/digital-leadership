# Project Rules & Token Optimization

## Model & Efficiency Rules
- **Default Model:** Always use `Sonnet` as the primary working model for daily tasks.
- **Advisor Mode:** Use `Opus` exclusively as an advisor (`/advisor opus`) for complex architectural planning or persistent errors.
- **Effort Level:** Set and maintain `/effort low` by default for simple tasks (such as renaming files, minor text edits, or quick checks) to preserve weekly token limits.

---

## Project Overview
**digital-leadership** — interactive HTML canvas documentary and digital-leadership course platform.

Key deliverables:
- `sv7-documentary.html` — cinematic 24-hour SV7 seismic party manager documentary (Canvas 2D, 11 scenes)
- `/frontend` — course UI (if present)
- `/backend` — API layer (if present)

---

## Workflow Guidelines

### Git
- Branch: `claude/upbeat-brahmagupta-l7xnkk` for all Claude-driven changes
- Always `git status` before any destructive git command
- Commit messages end with `Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>`

### Code Style
- HTML artifacts: dark-first single-theme, CSS tokens on `:root`, Google Fonts CDN only
- Canvas scenes: `draw(t)` signature, `requestAnimationFrame` loop, painter's algorithm depth
- No inline secrets; no hardcoded user data

### Skills Available
- `/add-lecture` — register a new lecture into the course
- `/apple-design` — apply Apple HIG design principles
- `/code-review` — review a diff or PR for correctness bugs
- `/startup-hook-skill` — set up a SessionStart dependency hook

### Token-Saving Habits
- Use `/effort low` for file edits, renames, quick checks
- Prefer `edits:` on Artifact republish over full rewrites when change is small
- Read only the lines needed; avoid re-reading already-known files
