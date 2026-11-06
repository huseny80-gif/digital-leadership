"""
Grok Bot — Playwright-based browser automation agent.
Handles tasks with runner: "grok_bot" in employees.json.
Navigates to a URL, extracts or submits content, returns text output.
"""
import os, json, logging, asyncio
from datetime import datetime
from pathlib import Path
from dotenv import load_dotenv
from playwright.async_api import async_playwright, TimeoutError as PWTimeout

load_dotenv()

OFFICE_DIR = Path(os.getenv("OFFICE_DIR", Path.home() / "virtual-office"))
LOGS_DIR   = OFFICE_DIR / "logs"
TASKS_DIR  = OFFICE_DIR / "tasks"
LOGS_DIR.mkdir(exist_ok=True)
TASKS_DIR.mkdir(exist_ok=True)

logging.basicConfig(
    filename=LOGS_DIR / "grok_bot.log",
    level=logging.INFO,
    format="%(asctime)s [GROK] %(message)s"
)

GROK_URL      = os.getenv("GROK_URL", "https://grok.com")
HEADLESS      = os.getenv("GROK_HEADLESS", "true").lower() == "true"
TIMEOUT_MS    = int(os.getenv("GROK_TIMEOUT_MS", "60000"))


# ── Browser session ───────────────────────────────────────────────────────────

async def ask_grok(prompt: str) -> str:
    """Open Grok in a browser, submit the prompt, return the response text."""
    async with async_playwright() as pw:
        browser = await pw.chromium.launch(
            headless=HEADLESS,
            args=["--no-sandbox", "--disable-dev-shm-usage"],
            executable_path=os.getenv("CHROMIUM_PATH") or None,
        )
        ctx  = await browser.new_context()
        page = await ctx.new_page()

        logging.info(f"Navigating to {GROK_URL}")
        await page.goto(GROK_URL, wait_until="domcontentloaded", timeout=TIMEOUT_MS)

        # Wait for the prompt textarea (selector may need updating if Grok UI changes)
        textarea_selectors = [
            "textarea",
            '[data-testid="chat-input"]',
            '[placeholder*="Ask"]',
            '[aria-label*="message"]',
        ]
        textarea = None
        for sel in textarea_selectors:
            try:
                await page.wait_for_selector(sel, timeout=10000)
                textarea = page.locator(sel).first
                logging.info(f"Found input via selector: {sel}")
                break
            except PWTimeout:
                continue

        if textarea is None:
            raise RuntimeError("Could not find Grok prompt input field")

        await textarea.click()
        await textarea.fill(prompt)
        await page.keyboard.press("Enter")
        logging.info("Prompt submitted, waiting for response...")

        # Wait for response to appear — look for a new assistant message block
        response_selectors = [
            '[data-testid="bot-message"]',
            ".response-text",
            "[class*='assistant']",
            "[class*='message'][class*='bot']",
        ]
        response_el = None
        for sel in response_selectors:
            try:
                await page.wait_for_selector(sel, timeout=TIMEOUT_MS)
                response_el = page.locator(sel).last
                logging.info(f"Found response via selector: {sel}")
                break
            except PWTimeout:
                continue

        if response_el is None:
            # Fallback: take screenshot and return diagnostic message
            screenshot_path = LOGS_DIR / f"grok_fallback_{datetime.now().strftime('%Y%m%d_%H%M%S')}.png"
            await page.screenshot(path=str(screenshot_path))
            logging.warning(f"Response selector not found — screenshot saved to {screenshot_path}")
            await browser.close()
            return f"[Grok Bot: response selector not matched — see screenshot at {screenshot_path}]"

        # Wait for streaming to finish (text stops changing)
        prev_text = ""
        for _ in range(30):
            await asyncio.sleep(2)
            current_text = await response_el.inner_text()
            if current_text and current_text == prev_text:
                break
            prev_text = current_text

        result = await response_el.inner_text()
        await browser.close()
        logging.info(f"Response received ({len(result)} chars)")
        return result.strip()


# ── Sync wrapper ──────────────────────────────────────────────────────────────

def run_grok(prompt: str) -> str:
    return asyncio.run(ask_grok(prompt))


# ── Task file helpers ─────────────────────────────────────────────────────────

def save_output(emp_id: str, task_id: str, content: str) -> str:
    ts       = datetime.now().strftime("%Y%m%d_%H%M%S")
    out_path = TASKS_DIR / f"{emp_id}_{task_id}_{ts}.md"
    out_path.write_text(content, encoding="utf-8")
    logging.info(f"Saved output: {out_path.name}")
    return str(out_path)


# ── Entry point (manual / standalone) ────────────────────────────────────────

if __name__ == "__main__":
    import sys

    if len(sys.argv) < 2:
        print("Usage: python grok_bot.py 'your prompt here'")
        print("       python grok_bot.py emp_id task_id  (reads prompt from employees.json)")
        sys.exit(1)

    if len(sys.argv) == 3:
        # Read prompt from employees.json
        emp_id  = sys.argv[1]
        task_id = sys.argv[2]
        emp_file = OFFICE_DIR / "config" / "employees.json"
        with open(emp_file, "r", encoding="utf-8") as f:
            cfg = json.load(f)
        prompt = None
        emp_name = emp_id
        for dept in cfg.get("departments", {}).values():
            for emp in dept.get("employees", []):
                if emp["id"] != emp_id:
                    continue
                emp_name = emp.get("name", emp_id)
                for task in emp.get("tasks", []):
                    if task["id"] == task_id and task.get("runner") == "grok_bot":
                        prompt = task.get("prompt_template", "").replace("{{employee_name}}", emp_name)
                        break
        if not prompt:
            print(f"❌ Task {emp_id}/{task_id} with runner=grok_bot not found")
            sys.exit(1)
        print(f"🤖 Running Grok Bot for {emp_name} / {task_id}...")
        result = run_grok(prompt)
        path   = save_output(emp_id, task_id, result)
        print(f"✅ Output saved → {path}")
    else:
        # Direct prompt
        prompt = sys.argv[1]
        print(f"🤖 Sending to Grok: {prompt[:80]}...")
        result = run_grok(prompt)
        print("\n── Response ──────────────────────────────────")
        print(result)
