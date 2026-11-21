import json, time, schedule
from datetime import datetime
from pathlib import Path
import os

OFFICE_DIR = Path(os.getenv("OFFICE_DIR", Path.home() / "virtual-office"))
STATE_FILE = OFFICE_DIR / "state" / "office_state.json"
EMPLOYEES_FILE = OFFICE_DIR / "config" / "employees.json"

def read_json(path):
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)

def write_json(path, data):
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)

def infer_status(emp: dict, now: datetime) -> dict:
    sched = emp.get("schedule", {})
    work_days = sched.get("work_days", list(range(0, 5)))
    work_start, work_end = sched.get("work_hours", [9, 18])
    sleep_start, sleep_end = sched.get("sleep_time", [23, 7])

    weekday = now.weekday()
    hour = now.hour

    if sleep_start > sleep_end:
        is_sleeping = hour >= sleep_start or hour < sleep_end
    else:
        is_sleeping = sleep_start <= hour < sleep_end

    if is_sleeping:
        return {"status": "offline", "animation": "sleep", "location": "bedroom"}

    if weekday not in work_days:
        return {"status": "idle", "animation": "idle", "location": "desk"}

    if work_start <= hour < work_end:
        return {"status": "idle", "animation": "typing", "location": "desk"}

    return {"status": "idle", "animation": "idle", "location": "desk"}

def sync_schedules():
    employees = read_json(EMPLOYEES_FILE)
    state = read_json(STATE_FILE)
    now = datetime.now()

    for dept in employees.get("departments", {}).values():
        for emp in dept.get("employees", []):
            eid = emp["id"]
            if eid not in state:
                continue
            if state[eid].get("status") == "working":
                continue
            inferred = infer_status(emp, now)
            state[eid].update(inferred)

    write_json(STATE_FILE, state)
    print(f"[{now.strftime('%H:%M:%S')}] State synced.")

if __name__ == "__main__":
    sync_schedules()
    schedule.every(1).minutes.do(sync_schedules)
    while True:
        schedule.run_pending()
        time.sleep(10)
