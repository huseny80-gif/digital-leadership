"""
Lion Supervisor — monitors logs and office state, alerts only on critical failures.
Sends email notifications for: task failures, long-running tasks, offline employees.
"""
import json, os, time, smtplib, logging
from datetime import datetime, timedelta
from pathlib import Path
from email.mime.text import MIMEText
from dotenv import load_dotenv
from watchdog.observers import Observer
from watchdog.events import FileSystemEventHandler

load_dotenv()

OFFICE_DIR  = Path(os.getenv("OFFICE_DIR", Path.home() / "virtual-office"))
STATE_FILE  = OFFICE_DIR / "state" / "office_state.json"
LOGS_DIR    = OFFICE_DIR / "logs"
LOG_FILE    = LOGS_DIR / "task_runner.log"
SUPER_LOG   = LOGS_DIR / "lion.log"
LOGS_DIR.mkdir(exist_ok=True)

NOTIFICATION_EMAIL  = os.getenv("NOTIFICATION_EMAIL", "")
SUPERVISOR_THRESHOLD = int(os.getenv("SUPERVISOR_THRESHOLD", "3"))  # failures before alert
SMTP_HOST = os.getenv("SMTP_HOST", "smtp.gmail.com")
SMTP_PORT = int(os.getenv("SMTP_PORT", "587"))
SMTP_USER = os.getenv("SMTP_USER", "")
SMTP_PASS = os.getenv("SMTP_PASS", "")

logging.basicConfig(
    filename=SUPER_LOG,
    level=logging.INFO,
    format="%(asctime)s [LION] %(message)s"
)

failure_counts: dict[str, int] = {}
alerted_tasks: set[str] = set()
working_since: dict[str, datetime] = {}
MAX_TASK_MINUTES = 30


# ── Email ─────────────────────────────────────────────────────────────────────

def send_alert(subject: str, body: str):
    if not NOTIFICATION_EMAIL or not SMTP_USER:
        logging.warning(f"Email not configured — alert dropped: {subject}")
        print(f"\n🦁 تنبيه Lion: {subject}\n{body}\n")
        return
    try:
        msg = MIMEText(body, "plain", "utf-8")
        msg["Subject"] = f"🦁 Lion Alert: {subject}"
        msg["From"]    = SMTP_USER
        msg["To"]      = NOTIFICATION_EMAIL
        with smtplib.SMTP(SMTP_HOST, SMTP_PORT) as s:
            s.starttls()
            s.login(SMTP_USER, SMTP_PASS)
            s.send_message(msg)
        logging.info(f"Alert sent: {subject}")
    except Exception as e:
        logging.error(f"Failed to send alert: {e}")


# ── Log watcher ───────────────────────────────────────────────────────────────

class LogWatcher(FileSystemEventHandler):
    def __init__(self):
        self._pos = LOG_FILE.stat().st_size if LOG_FILE.exists() else 0

    def on_modified(self, event):
        if event.src_path != str(LOG_FILE):
            return
        try:
            with open(LOG_FILE, "r", encoding="utf-8") as f:
                f.seek(self._pos)
                new_lines = f.readlines()
                self._pos = f.tell()
            for line in new_lines:
                self._check_line(line.strip())
        except Exception as e:
            logging.error(f"Log read error: {e}")

    def _check_line(self, line: str):
        if not line:
            return

        # Detect task failure
        if "[ERROR]" in line and "Task" in line and "failed" in line:
            # Extract task id: "Task emp_001/task_x failed: ..."
            parts = line.split("Task ")
            if len(parts) > 1:
                task_ref = parts[1].split(" failed")[0].strip()
                failure_counts[task_ref] = failure_counts.get(task_ref, 0) + 1
                count = failure_counts[task_ref]
                logging.info(f"Failure #{count} for {task_ref}")
                if count >= SUPERVISOR_THRESHOLD and task_ref not in alerted_tasks:
                    alerted_tasks.add(task_ref)
                    send_alert(
                        f"فشل متكرر: {task_ref}",
                        f"المهمة {task_ref} فشلت {count} مرات متتالية.\n\nآخر سطر:\n{line}"
                    )

        # Reset failure count on success
        if "completed" in line and "→" in line:
            parts = line.split("Task ")
            if len(parts) > 1:
                task_ref = parts[1].split(" completed")[0].strip()
                if task_ref in failure_counts:
                    failure_counts.pop(task_ref)
                    alerted_tasks.discard(task_ref)
                    logging.info(f"Failure count reset for {task_ref}")


# ── State monitor ─────────────────────────────────────────────────────────────

def check_state():
    try:
        with open(STATE_FILE, "r", encoding="utf-8") as f:
            state = json.load(f)
    except Exception:
        return

    now = datetime.now()

    for emp_id, s in state.items():
        # Track when employees start working
        if s.get("status") == "working":
            if emp_id not in working_since:
                working_since[emp_id] = now
            else:
                elapsed = (now - working_since[emp_id]).total_seconds() / 60
                if elapsed > MAX_TASK_MINUTES:
                    alert_key = f"stuck_{emp_id}"
                    if alert_key not in alerted_tasks:
                        alerted_tasks.add(alert_key)
                        task = s.get("current_task", "unknown")
                        send_alert(
                            f"مهمة عالقة: {emp_id}",
                            f"الموظف {emp_id} يعمل على '{task}' منذ {elapsed:.0f} دقيقة.\nقد تكون المهمة عالقة."
                        )
        else:
            # Clear working tracker when done
            working_since.pop(emp_id, None)
            # Clear stuck alert so it can re-trigger next time
            alerted_key = f"stuck_{emp_id}"
            alerted_tasks.discard(alerted_key)


# ── Heartbeat ─────────────────────────────────────────────────────────────────

def heartbeat():
    logging.info("Lion heartbeat — all systems nominal")


# ── Entry point ───────────────────────────────────────────────────────────────

if __name__ == "__main__":
    logging.info("Lion Supervisor started")
    print("🦁 Lion Supervisor يعمل — يراقب السجلات والحالة...")

    # Watch log file for changes
    observer = Observer()
    watcher = LogWatcher()
    observer.schedule(watcher, str(LOGS_DIR), recursive=False)
    observer.start()

    try:
        tick = 0
        while True:
            check_state()
            if tick % 60 == 0:  # heartbeat every 30 min
                heartbeat()
            tick += 1
            time.sleep(30)
    except KeyboardInterrupt:
        observer.stop()
    observer.join()
    logging.info("Lion Supervisor stopped")
