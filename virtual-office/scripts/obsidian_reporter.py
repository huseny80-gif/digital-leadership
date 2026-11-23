"""
Obsidian Reporter — watches the tasks/ directory and converts new task output
files into formatted Obsidian Markdown notes saved to the configured vault.
"""
import os, json, time, logging
from datetime import datetime
from pathlib import Path
from dotenv import load_dotenv
from watchdog.observers import Observer
from watchdog.events import FileSystemEventHandler

load_dotenv()

OFFICE_DIR   = Path(os.getenv("OFFICE_DIR", Path.home() / "virtual-office"))
TASKS_DIR    = OFFICE_DIR / "tasks"
LOGS_DIR     = OFFICE_DIR / "logs"
VAULT_DIR    = Path(os.getenv("OBSIDIAN_VAULT", Path.home() / "ObsidianVault"))
NOTES_SUBDIR = os.getenv("OBSIDIAN_NOTES_DIR", "Virtual Office / Reports")
LOGS_DIR.mkdir(exist_ok=True)

logging.basicConfig(
    filename=LOGS_DIR / "obsidian_reporter.log",
    level=logging.INFO,
    format="%(asctime)s [REPORTER] %(message)s"
)

EMP_FILE = OFFICE_DIR / "config" / "employees.json"


# ── Helpers ───────────────────────────────────────────────────────────────────

def load_employee_names() -> dict[str, str]:
    try:
        with open(EMP_FILE, "r", encoding="utf-8") as f:
            cfg = json.load(f)
        names = {}
        for dept in cfg.get("departments", {}).values():
            for emp in dept.get("employees", []):
                names[emp["id"]] = emp.get("name", emp["id"])
        if cfg.get("supervisor"):
            sv = cfg["supervisor"]
            names[sv["id"]] = sv.get("name", sv["id"])
        return names
    except Exception:
        return {}


def parse_task_filename(filename: str) -> dict | None:
    """Parse '<emp_id>_<task_id>_<YYYYMMDD_HHMMSS>.md' into parts."""
    stem = Path(filename).stem
    parts = stem.split("_")
    if len(parts) < 4:
        return None
    # emp_001_task_morning_report_20250601_090000
    # Find timestamp at end: last two parts are YYYYMMDD and HHMMSS
    date_str = parts[-2]
    time_str = parts[-1]
    if not (len(date_str) == 8 and len(time_str) == 6 and date_str.isdigit() and time_str.isdigit()):
        return None
    task_parts = parts[1:-2]
    emp_id = parts[0]
    task_id = "_".join(task_parts)
    try:
        ts = datetime.strptime(f"{date_str}_{time_str}", "%Y%m%d_%H%M%S")
    except ValueError:
        return None
    return {"emp_id": emp_id, "task_id": task_id, "timestamp": ts}


def build_note(meta: dict, content: str, emp_names: dict) -> str:
    emp_id    = meta["emp_id"]
    task_id   = meta["task_id"]
    ts        = meta["timestamp"]
    emp_name  = emp_names.get(emp_id, emp_id)
    date_tag  = ts.strftime("%Y-%m-%d")
    time_tag  = ts.strftime("%H:%M:%S")

    frontmatter = (
        "---\n"
        f"employee: {emp_name}\n"
        f"emp_id: {emp_id}\n"
        f"task: {task_id}\n"
        f"date: {date_tag}\n"
        f"time: {time_tag}\n"
        f"tags: [virtual-office, task-report, {emp_id}]\n"
        "---\n\n"
    )

    header = (
        f"# {task_id.replace('_', ' ').title()}\n\n"
        f"> **الموظف:** {emp_name} (`{emp_id}`)  \n"
        f"> **المهمة:** `{task_id}`  \n"
        f"> **التاريخ:** {date_tag} — {time_tag}\n\n"
        "---\n\n"
    )

    return frontmatter + header + content.strip() + "\n"


def save_note(meta: dict, note_content: str):
    target_dir = VAULT_DIR / NOTES_SUBDIR / meta["emp_id"]
    target_dir.mkdir(parents=True, exist_ok=True)

    date_prefix = meta["timestamp"].strftime("%Y-%m-%d_%H%M%S")
    note_name   = f"{date_prefix}_{meta['task_id']}.md"
    note_path   = target_dir / note_name

    note_path.write_text(note_content, encoding="utf-8")
    logging.info(f"Note saved: {note_path}")
    print(f"📝 Note saved → {note_path}")
    return note_path


# ── Watcher ───────────────────────────────────────────────────────────────────

class TaskOutputWatcher(FileSystemEventHandler):
    def __init__(self):
        self._emp_names = load_employee_names()

    def on_created(self, event):
        if event.is_directory:
            return
        path = Path(event.src_path)
        if path.suffix != ".md":
            return
        time.sleep(0.5)  # wait for write to complete
        self._process(path)

    def _process(self, path: Path):
        meta = parse_task_filename(path.name)
        if not meta:
            logging.warning(f"Could not parse filename: {path.name}")
            return
        try:
            content = path.read_text(encoding="utf-8")
        except Exception as e:
            logging.error(f"Could not read {path.name}: {e}")
            return

        note = build_note(meta, content, self._emp_names)
        save_note(meta, note)


# ── Backfill existing files ───────────────────────────────────────────────────

def backfill():
    """Process any .md files already in tasks/ that haven't been noted yet."""
    emp_names = load_employee_names()
    noted_dir = VAULT_DIR / NOTES_SUBDIR
    count = 0
    for path in sorted(TASKS_DIR.glob("*.md")):
        meta = parse_task_filename(path.name)
        if not meta:
            continue
        # Skip if note already exists
        expected = noted_dir / meta["emp_id"] / f"{meta['timestamp'].strftime('%Y-%m-%d_%H%M%S')}_{meta['task_id']}.md"
        if expected.exists():
            continue
        content = path.read_text(encoding="utf-8")
        note = build_note(meta, content, emp_names)
        save_note(meta, note)
        count += 1
    if count:
        logging.info(f"Backfill: {count} notes created")
        print(f"✅ Backfill: {count} ملاحظات تم إنشاؤها")
    else:
        print("✅ لا ملفات جديدة للمعالجة")


# ── Entry point ───────────────────────────────────────────────────────────────

if __name__ == "__main__":
    import sys

    if not VAULT_DIR.exists():
        print(f"⚠️  Obsidian vault not found at: {VAULT_DIR}")
        print("    Set OBSIDIAN_VAULT in your .env file and try again.")
        sys.exit(1)

    logging.info("Obsidian Reporter started")
    print(f"📒 Obsidian Reporter يعمل — يراقب {TASKS_DIR}")
    print(f"   Vault: {VAULT_DIR / NOTES_SUBDIR}")

    backfill()

    observer = Observer()
    watcher  = TaskOutputWatcher()
    observer.schedule(watcher, str(TASKS_DIR), recursive=False)
    observer.start()

    try:
        while True:
            time.sleep(10)
    except KeyboardInterrupt:
        observer.stop()
    observer.join()
    logging.info("Obsidian Reporter stopped")
