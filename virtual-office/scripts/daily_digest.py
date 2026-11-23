"""
Daily Digest — summarise today's task outputs and email a report.

Usage:
  python scripts/daily_digest.py              # digest for today
  python scripts/daily_digest.py --date 2024-11-05  # specific date
  python scripts/daily_digest.py --dry-run    # print HTML, skip email
"""
import argparse, json, logging, os, smtplib, sys
from datetime import date, datetime
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from pathlib import Path

import anthropic
from dotenv import load_dotenv

load_dotenv()

OFFICE_DIR = Path(os.getenv("OFFICE_DIR", Path(__file__).parent.parent))
TASKS_DIR  = OFFICE_DIR / "tasks"
LOGS_DIR   = OFFICE_DIR / "logs"
LOGS_DIR.mkdir(exist_ok=True)

logging.basicConfig(
    filename=LOGS_DIR / "daily_digest.log",
    level=logging.INFO,
    format="%(asctime)s [DIGEST] %(message)s",
)

ANTHROPIC_API_KEY    = os.getenv("ANTHROPIC_API_KEY", "")
NOTIFICATION_EMAIL   = os.getenv("NOTIFICATION_EMAIL", "")
SMTP_HOST            = os.getenv("SMTP_HOST", "smtp.gmail.com")
SMTP_PORT            = int(os.getenv("SMTP_PORT", "587"))
SMTP_USER            = os.getenv("SMTP_USER", "")
SMTP_PASS            = os.getenv("SMTP_PASS", "")

MAX_CONTENT_CHARS = 3000   # per file, to stay within context budget


# ── File helpers ──────────────────────────────────────────────────────────────

def files_for_date(target: date) -> list[Path]:
    prefix = target.strftime("%Y%m%d")
    return sorted(TASKS_DIR.glob(f"{prefix}_*.md"), key=lambda p: p.stat().st_mtime)


def parse_filename(path: Path) -> tuple[str, str]:
    """Return (emp_id, task_id) from <date>_<emp_id>_<task_id>_<time>.md"""
    parts = path.stem.split("_")
    if len(parts) >= 4:
        return parts[1], parts[2]
    return path.stem, ""


def truncate(text: str, limit: int = MAX_CONTENT_CHARS) -> str:
    if len(text) <= limit:
        return text
    return text[:limit] + f"\n\n… [مقتطع — {len(text) - limit} حرف إضافي]"


# ── Claude summarisation ──────────────────────────────────────────────────────

def summarise_outputs(entries: list[dict]) -> str:
    """Send all task entries to Claude and return a concise Arabic summary."""
    if not entries:
        return "لا توجد مهام مكتملة اليوم."

    if not ANTHROPIC_API_KEY:
        return "⚠️  ANTHROPIC_API_KEY غير محدد — تم تخطي التلخيص."

    client = anthropic.Anthropic(api_key=ANTHROPIC_API_KEY)

    prompt_parts = ["أنت مساعد تنفيذي. فيما يلي مخرجات مهام الموظفين لهذا اليوم:\n"]
    for e in entries:
        prompt_parts.append(
            f"### {e['emp_id']} / {e['task_id']}\n{e['content']}\n"
        )
    prompt_parts.append(
        "\nاكتب تقرير ملخص تنفيذي باللغة العربية (200-300 كلمة)، يشمل:\n"
        "1. أبرز الإنجازات\n"
        "2. أي مخاوف أو مشكلات\n"
        "3. توصيات للخطوات التالية"
    )

    message = client.messages.create(
        model="claude-sonnet-4-6",
        max_tokens=600,
        messages=[{"role": "user", "content": "\n".join(prompt_parts)}],
    )
    return message.content[0].text.strip()


# ── HTML rendering ────────────────────────────────────────────────────────────

def render_html(target: date, entries: list[dict], summary: str) -> str:
    date_str = target.strftime("%Y-%m-%d")

    rows_html = ""
    for e in entries:
        escaped = (
            e["content"]
            .replace("&", "&amp;")
            .replace("<", "&lt;")
            .replace(">", "&gt;")
        )
        rows_html += f"""
        <div class="task-card">
          <div class="task-header">
            <span class="badge">{e['emp_id']}</span>
            <span class="task-id">{e['task_id']}</span>
            <span class="ts">{e['timestamp']}</span>
          </div>
          <pre class="task-body">{escaped}</pre>
        </div>"""

    if not rows_html:
        rows_html = '<p class="no-tasks">لا توجد مهام مكتملة لهذا اليوم.</p>'

    summary_escaped = (
        summary
        .replace("&", "&amp;")
        .replace("<", "&lt;")
        .replace(">", "&gt;")
        .replace("\n", "<br>")
    )

    return f"""<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
<meta charset="UTF-8">
<title>ملخص المكتب الافتراضي — {date_str}</title>
<style>
  body {{ font-family: 'Segoe UI', Arial, sans-serif; background:#0f0f1a;
         color:#e0e0e0; margin:0; padding:24px; }}
  .container {{ max-width:800px; margin:0 auto; }}
  h1 {{ color:#7c9fff; border-bottom:1px solid #333; padding-bottom:12px; }}
  .meta {{ color:#888; font-size:13px; margin-bottom:24px; }}
  .summary-box {{ background:#1a2a4a; border-left:4px solid #7c3aed;
                  border-radius:8px; padding:16px; margin-bottom:28px;
                  line-height:1.8; }}
  .summary-box h2 {{ color:#a78bfa; margin:0 0 10px; }}
  .task-card {{ background:#1a1a2e; border:1px solid #2a2a4e;
                border-radius:8px; margin-bottom:16px; overflow:hidden; }}
  .task-header {{ background:#222240; padding:10px 14px;
                  display:flex; align-items:center; gap:10px; }}
  .badge {{ background:#7c3aed; color:#fff; border-radius:4px;
            padding:2px 8px; font-size:12px; font-weight:600; }}
  .task-id {{ color:#aaa; font-size:13px; flex:1; }}
  .ts {{ color:#666; font-size:12px; }}
  pre.task-body {{ margin:0; padding:14px; font-size:12px; line-height:1.6;
                   white-space:pre-wrap; color:#ccc; overflow-x:auto; }}
  .no-tasks {{ color:#666; font-style:italic; }}
  .footer {{ margin-top:32px; color:#555; font-size:12px;
             border-top:1px solid #222; padding-top:12px; }}
</style>
</head>
<body>
<div class="container">
  <h1>🏢 ملخص المكتب الافتراضي</h1>
  <p class="meta">التاريخ: {date_str} &nbsp;|&nbsp; عدد المهام: {len(entries)}</p>

  <div class="summary-box">
    <h2>📋 الملخص التنفيذي</h2>
    <p>{summary_escaped}</p>
  </div>

  <h2 style="color:#7c9fff;">📄 تفاصيل المهام</h2>
  {rows_html}

  <div class="footer">تم إنشاؤه تلقائيًا بواسطة Virtual Office Daily Digest</div>
</div>
</body>
</html>"""


# ── Email sending ─────────────────────────────────────────────────────────────

def send_email(html: str, target: date) -> None:
    if not all([NOTIFICATION_EMAIL, SMTP_USER, SMTP_PASS]):
        logging.warning("SMTP credentials missing — skipping email send")
        print("⚠️  بيانات SMTP غير مكتملة — تم حفظ الملف فقط")
        return

    subject = f"ملخص المكتب الافتراضي — {target.strftime('%Y-%m-%d')}"
    msg = MIMEMultipart("alternative")
    msg["Subject"] = subject
    msg["From"]    = SMTP_USER
    msg["To"]      = NOTIFICATION_EMAIL
    msg.attach(MIMEText(html, "html", "utf-8"))

    with smtplib.SMTP(SMTP_HOST, SMTP_PORT) as s:
        s.starttls()
        s.login(SMTP_USER, SMTP_PASS)
        s.sendmail(SMTP_USER, [NOTIFICATION_EMAIL], msg.as_string())

    logging.info(f"Digest email sent to {NOTIFICATION_EMAIL}")
    print(f"✅ تم إرسال البريد إلى {NOTIFICATION_EMAIL}")


# ── Entry point ───────────────────────────────────────────────────────────────

def main() -> None:
    parser = argparse.ArgumentParser(
        prog="daily_digest",
        description="Generate and email a daily digest of Virtual Office task outputs",
    )
    parser.add_argument(
        "--date", metavar="YYYY-MM-DD",
        help="target date (default: today)",
        default=None,
    )
    parser.add_argument(
        "--dry-run", action="store_true",
        help="print HTML to stdout and skip email",
    )
    args = parser.parse_args()

    target = (
        datetime.strptime(args.date, "%Y-%m-%d").date()
        if args.date
        else date.today()
    )

    logging.info(f"Generating digest for {target}")
    print(f"📅 توليد الملخص اليومي لتاريخ {target} …")

    files = files_for_date(target)
    if not files:
        print(f"⚠️  لا توجد ملفات مهام لتاريخ {target}")

    entries = []
    for path in files:
        emp_id, task_id = parse_filename(path)
        content = truncate(path.read_text(encoding="utf-8"))
        ts = datetime.fromtimestamp(path.stat().st_mtime).strftime("%H:%M")
        entries.append({"emp_id": emp_id, "task_id": task_id, "content": content, "timestamp": ts})
        logging.info(f"Loaded {path.name}")

    print(f"📄 {len(entries)} ملف مهمة — جاري التلخيص بـ Claude …")
    summary = summarise_outputs(entries)

    html = render_html(target, entries, summary)

    # Save HTML report locally
    out_dir = OFFICE_DIR / "logs"
    out_path = out_dir / f"digest_{target.strftime('%Y%m%d')}.html"
    out_path.write_text(html, encoding="utf-8")
    print(f"💾 تم حفظ التقرير: {out_path}")
    logging.info(f"Digest saved to {out_path}")

    if args.dry_run:
        print("\n── HTML ──────────────────────────────────────────────────────")
        print(html)
        return

    send_email(html, target)


if __name__ == "__main__":
    main()
