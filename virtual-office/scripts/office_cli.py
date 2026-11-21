"""
Office CLI — command-line management interface for the Virtual Office.

Commands:
  status                       show all employees' current status
  run <emp_id> <task_id>       trigger a task immediately
  logs [--tail N]              tail the task runner log
  outputs [--emp emp_id]       list recent task output files
  meet                         move idle employees to the meeting room
  reset                        reset all employees to idle
"""
import argparse, json, os, sys, subprocess, time
from pathlib import Path
from datetime import datetime
import urllib.request, urllib.error

from dotenv import load_dotenv

load_dotenv()

OFFICE_DIR = Path(os.getenv("OFFICE_DIR", Path(__file__).parent.parent))
STATE_PORT  = int(os.getenv("STATE_PORT", "5050"))
API_BASE    = f"http://localhost:{STATE_PORT}/api"

# ── ANSI helpers ──────────────────────────────────────────────────────────────

GREEN  = "\033[0;32m"
YELLOW = "\033[1;33m"
RED    = "\033[0;31m"
CYAN   = "\033[0;36m"
BOLD   = "\033[1m"
RESET  = "\033[0m"

STATUS_COLOR = {
    "idle":    GREEN,
    "working": YELLOW,
    "offline": RED,
    "meeting": CYAN,
}

def colored(text: str, color: str) -> str:
    return f"{color}{text}{RESET}" if sys.stdout.isatty() else text


# ── HTTP helpers ──────────────────────────────────────────────────────────────

def api_get(path: str) -> dict:
    url = f"{API_BASE}{path}"
    try:
        with urllib.request.urlopen(url, timeout=5) as r:
            return json.loads(r.read())
    except urllib.error.URLError:
        print(colored(f"✗  Cannot reach state server at {url}", RED))
        print(colored("   Run ./start.sh first.", YELLOW))
        sys.exit(1)


def api_post(path: str, payload: dict) -> dict:
    url = f"{API_BASE}{path}"
    data = json.dumps(payload).encode()
    req  = urllib.request.Request(url, data=data,
                                  headers={"Content-Type": "application/json"},
                                  method="POST")
    try:
        with urllib.request.urlopen(req, timeout=5) as r:
            return json.loads(r.read())
    except urllib.error.URLError as e:
        print(colored(f"✗  POST {url} failed: {e}", RED))
        sys.exit(1)


# ── Commands ──────────────────────────────────────────────────────────────────

def cmd_status(_args):
    """Show all employees' current status."""
    data = api_get("/state")
    employees = data.get("employees", {})

    if not employees:
        print(colored("No employees found in office state.", YELLOW))
        return

    col_w = [20, 22, 10, 25]
    header = (
        f"{'Employee':<{col_w[0]}} {'Role':<{col_w[1]}} {'Status':<{col_w[2]}} {'Current Task':<{col_w[3]}}"
    )
    sep = "─" * sum(col_w) + "─" * (len(col_w) - 1)

    print(f"\n{colored(BOLD + 'Virtual Office — Status', BOLD, )}")
    print(colored(sep, CYAN))
    print(colored(header, BOLD))
    print(colored(sep, CYAN))

    for emp_id, emp in sorted(employees.items()):
        name        = emp.get("name", emp_id)
        role        = emp.get("role", "")
        status      = emp.get("status", "offline")
        current     = emp.get("current_task", "") or ""
        status_col  = STATUS_COLOR.get(status, RESET)

        print(
            f"{name:<{col_w[0]}} "
            f"{role[:col_w[1]-1]:<{col_w[1]}} "
            f"{colored(f'{status:<{col_w[2]}}', status_col)} "
            f"{current[:col_w[3]-1]}"
        )

    print(colored(sep, CYAN))

    ts = data.get("last_updated", "")
    if ts:
        print(f"  Last updated: {ts}\n")


def cmd_run(args):
    """Trigger a task immediately via task_runner.py."""
    runner_script = OFFICE_DIR / "scripts" / "task_runner.py"
    if not runner_script.exists():
        print(colored(f"✗  task_runner.py not found at {runner_script}", RED))
        sys.exit(1)

    print(colored(f"▶  Running {args.emp_id} / {args.task_id} …", CYAN))
    result = subprocess.run(
        [sys.executable, str(runner_script), args.emp_id, args.task_id],
        capture_output=False,
    )
    if result.returncode != 0:
        print(colored(f"✗  Task exited with code {result.returncode}", RED))
        sys.exit(result.returncode)
    print(colored("✓  Task finished.", GREEN))


def cmd_logs(args):
    """Tail the task runner log."""
    log_file = OFFICE_DIR / "logs" / "task_runner.log"
    if not log_file.exists():
        print(colored(f"✗  Log file not found: {log_file}", RED))
        print(colored("   Has the task runner been started?", YELLOW))
        sys.exit(1)

    tail_n = getattr(args, "tail", 40)
    print(colored(f"  {log_file}  (last {tail_n} lines)\n", CYAN))

    lines = log_file.read_text(encoding="utf-8").splitlines()
    for line in lines[-tail_n:]:
        if "[ERROR]" in line:
            print(colored(line, RED))
        elif "[WARN]" in line or "WARNING" in line:
            print(colored(line, YELLOW))
        else:
            print(line)


def cmd_outputs(args):
    """List recent task output files."""
    tasks_dir = OFFICE_DIR / "tasks"
    tasks_dir.mkdir(exist_ok=True)

    emp_filter = getattr(args, "emp", None)
    files = sorted(tasks_dir.glob("*.md"), key=lambda p: p.stat().st_mtime, reverse=True)

    if emp_filter:
        files = [f for f in files if f.name.startswith(emp_filter)]

    if not files:
        print(colored("No task output files found.", YELLOW))
        return

    print(colored(f"\n  Task Outputs  ({len(files)} files)\n", BOLD))
    for path in files[:30]:
        mtime = datetime.fromtimestamp(path.stat().st_mtime).strftime("%Y-%m-%d %H:%M")
        size  = path.stat().st_size
        print(f"  {mtime}  {path.name:<55}  {size:>6} B")
    print()


def cmd_meet(args):
    """Move all idle employees to 'meeting' status."""
    state   = api_get("/state")
    empls   = state.get("employees", {})
    moved   = []

    for emp_id, emp in empls.items():
        if emp.get("status") == "idle":
            api_post(f"/state/{emp_id}", {"status": "meeting", "current_task": "اجتماع"})
            moved.append(emp.get("name", emp_id))

    if moved:
        print(colored(f"📢  Meeting started for: {', '.join(moved)}", CYAN))
    else:
        print(colored("No idle employees to call to a meeting.", YELLOW))


def cmd_reset(args):
    """Reset all employees to idle (or offline for missing ones)."""
    state = api_get("/state")
    empls = state.get("employees", {})

    for emp_id in empls:
        api_post(f"/state/{emp_id}", {"status": "idle", "current_task": ""})
        print(colored(f"  ↺  {emp_id} → idle", GREEN))

    if empls:
        print(colored(f"\n✓  {len(empls)} employee(s) reset to idle.", GREEN))
    else:
        print(colored("No employees found.", YELLOW))


# ── Colour helper fix (unused arg) ───────────────────────────────────────────

def colored(text: str, *colors) -> str:  # noqa: F811 — redefine for multi-color
    if not sys.stdout.isatty():
        return text
    prefix = "".join(c for c in colors if isinstance(c, str) and c.startswith("\033"))
    return f"{prefix}{text}{RESET}"


# ── Entry point ───────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(
        prog="office_cli",
        description="Virtual Office management CLI",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=(
            "examples:\n"
            "  python scripts/office_cli.py status\n"
            "  python scripts/office_cli.py run emp_001 task_morning_report\n"
            "  python scripts/office_cli.py logs --tail 20\n"
            "  python scripts/office_cli.py outputs --emp emp_001\n"
            "  python scripts/office_cli.py meet\n"
            "  python scripts/office_cli.py reset\n"
        ),
    )
    sub = parser.add_subparsers(dest="command", required=True)

    # status
    sub.add_parser("status", help="show all employees' current status")

    # run
    p_run = sub.add_parser("run", help="trigger a task immediately")
    p_run.add_argument("emp_id",  help="employee id, e.g. emp_001")
    p_run.add_argument("task_id", help="task id, e.g. task_morning_report")

    # logs
    p_logs = sub.add_parser("logs", help="tail the task runner log")
    p_logs.add_argument("--tail", type=int, default=40, metavar="N",
                        help="number of lines to show (default: 40)")

    # outputs
    p_out = sub.add_parser("outputs", help="list recent task output files")
    p_out.add_argument("--emp", metavar="emp_id",
                       help="filter by employee id")

    # meet
    sub.add_parser("meet", help="move idle employees to the meeting room")

    # reset
    sub.add_parser("reset", help="reset all employees to idle")

    args = parser.parse_args()

    dispatch = {
        "status":  cmd_status,
        "run":     cmd_run,
        "logs":    cmd_logs,
        "outputs": cmd_outputs,
        "meet":    cmd_meet,
        "reset":   cmd_reset,
    }
    dispatch[args.command](args)


if __name__ == "__main__":
    main()
