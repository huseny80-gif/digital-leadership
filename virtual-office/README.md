# 🏢 Virtual Office

A local 3D AI workforce simulator. Autonomous Claude-powered employees work at their desks in a Three.js scene while you watch from above.

---

## Architecture

```
virtual-office/
├── config/
│   └── employees.json        ← define employees, tasks, schedules
├── state/
│   └── office_state.json     ← live status (idle / working / offline)
├── scripts/
│   ├── state_server.py       ← Flask REST API  (port 5050)
│   ├── state_manager.py      ← state read/write helpers + --init
│   ├── task_runner.py        ← cron scheduler → Claude API
│   └── lion_supervisor.py    ← log watcher + email alerts
├── agents/
│   └── grok_bot.py           ← Playwright browser bot (runner: grok_bot)
├── scripts/
│   └── obsidian_reporter.py  ← task output → Obsidian Markdown notes
├── frontend/
│   └── index.html            ← Three.js 3D office (open in browser)
├── tasks/                    ← task output files (auto-created)
├── logs/                     ← service logs (auto-created)
├── start.sh                  ← one-command launcher
└── .env.example              ← copy → .env and fill in values
```

---

## Quick Start

### 1 — Prerequisites

| Requirement | Version |
|-------------|---------|
| Python      | 3.10 +  |
| pip         | any     |
| (optional) Obsidian | any — for the reporter |

### 2 — Clone & configure

```bash
git clone https://github.com/huseny80-gif/digital-leadership.git
cd digital-leadership/virtual-office

cp .env.example .env
# Edit .env — set ANTHROPIC_API_KEY and OFFICE_DIR at minimum
```

### 3 — Install dependencies

```bash
pip install flask flask-cors anthropic python-dotenv schedule watchdog playwright
python -m playwright install chromium   # only needed for the Grok bot
```

### 4 — Initialise state

```bash
python scripts/state_manager.py --init
```

### 5 — Launch everything

```bash
chmod +x start.sh
./start.sh
```

The script:
- Installs missing pip packages
- Starts the state API on `http://localhost:5050`
- Starts the task runner (cron-based Claude API calls)
- Starts Lion supervisor (log watcher + email alerts)
- Starts the Obsidian reporter if `OBSIDIAN_VAULT` exists
- Opens `frontend/index.html` in your default browser

Stop with **Ctrl+C** — all child processes are cleaned up automatically.

#### Flags

```bash
./start.sh --no-obsidian   # skip Obsidian reporter
./start.sh --no-grok       # skip Grok bot validation
```

---

## Configuration — `config/employees.json`

```jsonc
{
  "departments": {
    "engineering": {
      "employees": [
        {
          "id": "emp_001",
          "name": "أحمد",
          "role": "مهندس برمجيات",
          "tasks": [
            {
              "id": "task_morning_report",
              "runner": "claude",          // "claude" or "grok_bot"
              "trigger": { "type": "cron", "cron": "0 9 * * *" },
              "prompt_template": "أنت {{employee_name}}. اكتب تقرير الصباح...",
              "requires_approval": false
            }
          ]
        }
      ]
    }
  },
  "supervisor": {
    "id": "lion",
    "name": "Lion",
    "role": "مشرف"
  }
}
```

### Runner types

| `runner` | Description |
|----------|-------------|
| `claude` | Calls the Anthropic Messages API. Requires `ANTHROPIC_API_KEY`. |
| `grok_bot` | Opens Grok in a Chromium browser via Playwright and returns the response. |

---

## Services

### State API — `scripts/state_server.py`

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/state` | GET | Full office state JSON |
| `/api/state/<emp_id>` | GET | Single employee state |
| `/api/state/<emp_id>` | POST | Update employee state |
| `/api/employees` | GET | employees.json contents |

### Task Runner — `scripts/task_runner.py`

Reads all `cron`-triggered tasks from `employees.json` and schedules them with the `schedule` library. Supports manual runs:

```bash
python scripts/task_runner.py emp_001 task_morning_report
```

### Lion Supervisor — `scripts/lion_supervisor.py`

Watches `logs/task_runner.log` for `[ERROR]` lines. After `SUPERVISOR_THRESHOLD` (default 3) consecutive failures for the same task it sends an email alert via SMTP. Also detects employees stuck in `working` status for more than 30 minutes.

Configure SMTP in `.env`:
```
NOTIFICATION_EMAIL=you@example.com
SMTP_USER=you@gmail.com
SMTP_PASS=your-app-password
```

### Obsidian Reporter — `scripts/obsidian_reporter.py`

Watches `tasks/` for new `.md` output files. Converts each one to an Obsidian note with YAML frontmatter and saves it to:

```
$OBSIDIAN_VAULT/$OBSIDIAN_NOTES_DIR/<emp_id>/<date>_<task_id>.md
```

Runs `backfill()` on startup to process any existing files the reporter hasn't seen yet.

### Grok Bot — `agents/grok_bot.py`

Playwright-based browser automation for tasks with `runner: "grok_bot"`. Navigates to `GROK_URL`, submits the prompt, waits for the streaming response to stabilise, and returns the text.

Manual test:
```bash
python agents/grok_bot.py "What is the weather in Riyadh today?"
python agents/grok_bot.py emp_001 task_morning_report
```

---

## 3D Frontend

Open `frontend/index.html` directly in a browser (no server required). It polls `http://localhost:5050/api/state` every 5 seconds and updates:

- **Avatar animations** — idle sway, typing bob, sleep lean
- **Status dots** — green (idle), amber pulse (working), grey (offline)
- **Meeting button** — gathers idle employees at the conference table

Controls: orbit with mouse drag, zoom with scroll, **Reset Camera** button returns to default view.

---

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `OFFICE_DIR` | `~/virtual-office` | Absolute path to this directory |
| `ANTHROPIC_API_KEY` | — | **Required** for Claude tasks |
| `OBSIDIAN_VAULT` | `~/ObsidianVault` | Obsidian vault root |
| `OBSIDIAN_NOTES_DIR` | `Virtual Office / Reports` | Sub-folder inside vault |
| `GROK_URL` | `https://grok.com` | URL the Grok bot navigates to |
| `GROK_HEADLESS` | `true` | Set `false` to watch the browser |
| `GROK_TIMEOUT_MS` | `60000` | Playwright navigation timeout |
| `CHROMIUM_PATH` | *(auto)* | Custom Chromium binary path |
| `NOTIFICATION_EMAIL` | — | Alert recipient |
| `SMTP_HOST` | `smtp.gmail.com` | SMTP server |
| `SMTP_PORT` | `587` | SMTP port |
| `SMTP_USER` | — | SMTP login |
| `SMTP_PASS` | — | SMTP password / App Password |
| `SUPERVISOR_THRESHOLD` | `3` | Failures before Lion alerts |
| `STATE_PORT` | `5050` | Flask API port |

---

## Logs

| File | Service |
|------|---------|
| `logs/task_runner.log` | Task execution events |
| `logs/lion.log` | Lion supervisor events |
| `logs/grok_bot.log` | Grok browser bot events |
| `logs/obsidian_reporter.log` | Note creation events |
| `logs/state_server.py.out` | Flask stdout |
| `logs/virtual_office.pids` | Running PIDs (deleted on stop) |

---

## Troubleshooting

**Frontend shows "غير متصل"**  
→ Make sure `state_server.py` is running: `curl http://localhost:5050/api/state`

**Tasks not running**  
→ Check `logs/task_runner.log`. Verify `ANTHROPIC_API_KEY` is set and cron expressions are valid (`minute hour * * *`).

**Grok bot fails**  
→ Set `GROK_HEADLESS=false` in `.env` to watch the browser. The UI selectors may need updating if Grok's interface changed.

**Obsidian notes not appearing**  
→ Confirm `OBSIDIAN_VAULT` points to an existing directory. Run `python scripts/obsidian_reporter.py` manually to see errors.

**Email alerts not sending**  
→ Gmail requires an [App Password](https://myaccount.google.com/apppasswords). Set `SMTP_PASS` to that 16-character password, not your Gmail password.
