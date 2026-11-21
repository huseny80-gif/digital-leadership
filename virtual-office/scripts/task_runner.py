"""
Task Runner — executes scheduled employee tasks via Claude API or Grok bot.
Reads employees.json, runs due tasks, saves output to tasks/, updates office_state.json.
"""
import json, os, time, schedule, logging
from datetime import datetime
from pathlib import Path
from dotenv import load_dotenv
import anthropic

load_dotenv()

OFFICE_DIR = Path(os.getenv("OFFICE_DIR", Path.home() / "virtual-office"))
STATE_FILE  = OFFICE_DIR / "state" / "office_state.json"
EMP_FILE    = OFFICE_DIR / "config" / "employees.json"
TASKS_DIR   = OFFICE_DIR / "tasks"
LOGS_DIR    = OFFICE_DIR / "logs"
TASKS_DIR.mkdir(exist_ok=True)
LOGS_DIR.mkdir(exist_ok=True)

logging.basicConfig(
    filename=LOGS_DIR / "task_runner.log",
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s"
)

client = anthropic.Anthropic(api_key=os.getenv("ANTHROPIC_API_KEY"))


# ── Helpers ───────────────────────────────────────────────────────────────────

def read_json(path):
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)

def write_json(path, data):
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)

def set_employee_state(emp_id: str, **kwargs):
    state = read_json(STATE_FILE)
    if emp_id in state:
        state[emp_id].update(kwargs)
        write_json(STATE_FILE, state)

def save_task_output(emp_id: str, task_id: str, content: str):
    ts = datetime.now().strftime("%Y%m%d_%H%M%S")
    out_path = TASKS_DIR / f"{emp_id}_{task_id}_{ts}.md"
    out_path.write_text(content, encoding="utf-8")
    logging.info(f"Saved output: {out_path.name}")
    return str(out_path)


# ── Claude runner ─────────────────────────────────────────────────────────────

def run_claude(emp_name: str, prompt: str, model: str = "claude-sonnet-4-6") -> str:
    response = client.messages.create(
        model=model,
        max_tokens=2048,
        messages=[{"role": "user", "content": prompt}]
    )
    return response.content[0].text


# ── Approval gate ─────────────────────────────────────────────────────────────

def request_approval(emp_id: str, task_id: str, message: str) -> bool:
    """Write approval request to state; block until approved or timeout (60s)."""
    state = read_json(STATE_FILE)
    if emp_id in state:
        state[emp_id]["pending_approval"] = {
            "task_id": task_id,
            "message": message,
            "approved": None,
            "requested_at": datetime.now().isoformat()
        }
        write_json(STATE_FILE, state)

    logging.info(f"Approval requested: {emp_id}/{task_id} — {message}")
    print(f"\n⚠️  موافقة مطلوبة [{emp_id}/{task_id}]\n   {message}\n   اكتب 'yes' للموافقة أو اضغط Enter للرفض: ", end="", flush=True)

    import select, sys
    ready = select.select([sys.stdin], [], [], 60)[0]
    answer = sys.stdin.readline().strip().lower() if ready else ""

    state = read_json(STATE_FILE)
    if emp_id in state and "pending_approval" in state[emp_id]:
        state[emp_id].pop("pending_approval", None)
        write_json(STATE_FILE, state)

    return answer == "yes"


# ── Task executor ─────────────────────────────────────────────────────────────

def execute_task(emp: dict, task: dict):
    emp_id   = emp["id"]
    emp_name = emp.get("name", emp_id)
    task_id  = task["id"]
    runner   = task.get("runner", "claude")
    prompt   = task.get("prompt_template", "").replace("{{employee_name}}", emp_name)

    logging.info(f"Starting task {emp_id}/{task_id} via {runner}")

    # Approval gate
    if task.get("requires_approval"):
        msg = task.get("approval_message", f"تنفيذ مهمة {task_id} لـ {emp_name}؟")
        if not request_approval(emp_id, task_id, msg):
            logging.info(f"Task {task_id} rejected by user")
            return

    # Mark working
    set_employee_state(emp_id, status="working", current_task=task_id, animation="typing")

    try:
        if runner == "claude":
            output = run_claude(emp_name, prompt)
        elif runner == "grok_bot":
            output = f"[Grok bot placeholder]\nالمهمة: {task_id}\nالموظف: {emp_name}\n\n{prompt}"
            logging.warning(f"grok_bot not implemented — placeholder used for {task_id}")
        else:
            output = f"[Unknown runner: {runner}]"

        out_path = save_task_output(emp_id, task_id, output)
        logging.info(f"Task {task_id} completed → {out_path}")

    except Exception as e:
        logging.error(f"Task {task_id} failed: {e}")
    finally:
        set_employee_state(emp_id, status="idle", current_task=None, animation="idle")


# ── Scheduler setup ───────────────────────────────────────────────────────────

def register_tasks():
    employees_cfg = read_json(EMP_FILE)
    registered = 0

    for dept_name, dept in employees_cfg.get("departments", {}).items():
        for emp in dept.get("employees", []):
            for task in emp.get("tasks", []):
                trigger = task.get("trigger", {})
                if trigger.get("type") != "cron":
                    continue
                cron = trigger.get("cron", "")
                # Parse simple "minute hour * * *" crons
                parts = cron.split()
                if len(parts) != 5:
                    continue
                minute, hour = parts[0], parts[1]
                if minute.isdigit() and hour.isdigit():
                    run_time = f"{int(hour):02d}:{int(minute):02d}"
                    schedule.every().day.at(run_time).do(execute_task, emp, task)
                    logging.info(f"Scheduled {emp['id']}/{task['id']} at {run_time}")
                    registered += 1

    logging.info(f"Total scheduled tasks: {registered}")
    print(f"✅ {registered} مهمة مجدولة. جاري الانتظار...")


# ── On-demand runner ──────────────────────────────────────────────────────────

def run_task_now(emp_id: str, task_id: str):
    """Call this to trigger a task immediately (for testing or manual runs)."""
    employees_cfg = read_json(EMP_FILE)
    for dept in employees_cfg.get("departments", {}).values():
        for emp in dept.get("employees", []):
            if emp["id"] != emp_id:
                continue
            for task in emp.get("tasks", []):
                if task["id"] == task_id:
                    execute_task(emp, task)
                    return
    print(f"❌ لم يُعثر على {emp_id}/{task_id}")


# ── Entry point ───────────────────────────────────────────────────────────────

if __name__ == "__main__":
    import sys
    if len(sys.argv) == 3:
        # Manual: python task_runner.py emp_001 task_morning_report
        run_task_now(sys.argv[1], sys.argv[2])
    else:
        register_tasks()
        while True:
            schedule.run_pending()
            time.sleep(30)
