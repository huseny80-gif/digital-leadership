/**
 * Visible cursor + click ripple, injected into every page (survives navigation), and
 * human-like mouse motion built on real Playwright mouse events, so hover states,
 * click handlers and the on-screen cursor all behave as they would for a person.
 */
export const CURSOR_INIT_SCRIPT = () => {
  const install = () => {
    if (document.getElementById("__wt_cursor")) return;
    const style = document.createElement("style");
    style.textContent = `
      #__wt_cursor{position:fixed;left:0;top:0;width:34px;height:34px;z-index:2147483647;pointer-events:none;
        transform:translate(-100px,-100px);filter:drop-shadow(0 4px 8px rgba(0,0,0,.45));transition:none}
      #__wt_cursor svg{width:100%;height:100%;display:block}
      .__wt_ripple{position:fixed;z-index:2147483646;pointer-events:none;width:14px;height:14px;margin:-7px 0 0 -7px;border-radius:50%;
        border:3px solid #d4a72c;background:rgba(47,169,173,.35);animation:__wt_ripple .75s ease-out forwards}
      @keyframes __wt_ripple{to{transform:scale(6);opacity:0}}`;
    style.textContent += "nextjs-portal,#__next-build-watcher,[data-nextjs-dev-tools-button]{display:none!important}";
    document.documentElement.appendChild(style);
    const cursor = document.createElement("div");
    cursor.id = "__wt_cursor";
    cursor.innerHTML = '<svg viewBox="0 0 24 24"><path d="M3 2l7.5 19 2.6-7.6L21 10.8z" fill="#fff" stroke="#073c40" stroke-width="1.6" stroke-linejoin="round"/></svg>';
    document.documentElement.appendChild(cursor);
    const move = e => { cursor.style.transform = `translate(${e.clientX - 3}px,${e.clientY - 2}px)`; window.__wtPos = { x: e.clientX, y: e.clientY }; };
    addEventListener("mousemove", move, true);
    addEventListener("mousedown", e => {
      const ripple = document.createElement("div");
      ripple.className = "__wt_ripple"; ripple.style.left = e.clientX + "px"; ripple.style.top = e.clientY + "px";
      document.documentElement.appendChild(ripple); setTimeout(() => ripple.remove(), 900);
      cursor.style.transform = `translate(${e.clientX - 3}px,${e.clientY - 2}px) scale(.82)`;
    }, true);
    addEventListener("mouseup", e => { cursor.style.transform = `translate(${e.clientX - 3}px,${e.clientY - 2}px)`; }, true);
    if (window.__wtPos) cursor.style.transform = `translate(${window.__wtPos.x - 3}px,${window.__wtPos.y - 2}px)`;
  };
  if (document.documentElement) install(); else document.addEventListener("DOMContentLoaded", install);
  // Frameworks may replace the document element's children; keep the cursor alive.
  new MutationObserver(() => install()).observe(document, { childList: true, subtree: false });
};

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const easeInOut = t => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

export class Mouse {
  constructor(page, speed = 1) { this.page = page; this.speed = speed; this.x = 140; this.y = 140; this.seed = 7; }
  setPage(page) { this.page = page; }
  wait(ms) { return sleep(ms / this.speed); }
  rand() { this.seed = (this.seed * 16807) % 2147483647; return this.seed / 2147483647; }

  /** Move along a gentle curve with ease-in-out timing (longer distances take longer). */
  async moveTo(x, y) {
    const { page } = this;
    const dx = x - this.x, dy = y - this.y, distance = Math.hypot(dx, dy);
    if (distance < 2) return;
    const duration = Math.min(1500, 350 + distance * 0.9) / this.speed;
    const bend = (this.rand() - 0.5) * Math.min(220, distance * 0.35);
    const nx = -dy / distance, ny = dx / distance;
    const c1 = { x: this.x + dx * 0.3 + nx * bend, y: this.y + dy * 0.3 + ny * bend };
    const c2 = { x: this.x + dx * 0.75 + nx * bend * 0.4, y: this.y + dy * 0.75 + ny * bend * 0.4 };
    const start = { x: this.x, y: this.y }, frames = Math.max(12, Math.round(duration / 16));
    for (let i = 1; i <= frames; i++) {
      const t = easeInOut(i / frames), u = 1 - t;
      const px = u ** 3 * start.x + 3 * u * u * t * c1.x + 3 * u * t * t * c2.x + t ** 3 * x;
      const py = u ** 3 * start.y + 3 * u * u * t * c1.y + 3 * u * t * t * c2.y + t ** 3 * y;
      await page.mouse.move(px, py);
      await sleep(duration / frames);
    }
    this.x = x; this.y = y;
  }

  /** Glide to an element, pause so the viewer sees it, then click. Returns the click point. */
  async clickLocator(locator) {
    await locator.scrollIntoViewIfNeeded({ timeout: 5000 });
    await this.wait(250);
    const box = await locator.boundingBox();
    if (!box) throw new Error("element has no box");
    const x = box.x + box.width * (0.35 + this.rand() * 0.3), y = box.y + box.height * (0.4 + this.rand() * 0.2);
    await this.moveTo(x, y);
    await this.wait(420);
    await this.page.mouse.down(); await this.wait(110); await this.page.mouse.up();
    return { x: Math.round(x), y: Math.round(y), box: { x: Math.round(box.x), y: Math.round(box.y), width: Math.round(box.width), height: Math.round(box.height) } };
  }

  /** Scroll with real wheel events in small eased steps so the motion is readable on video. */
  async scrollBy(total) {
    const steps = Math.max(8, Math.round(Math.abs(total) / 36)), sign = Math.sign(total);
    let sent = 0;
    for (let i = 1; i <= steps; i++) {
      const target = Math.round(total * easeInOut(i / steps)), delta = target - sent;
      sent = target;
      if (delta) await this.page.mouse.wheel(0, delta);
      await sleep(18 / this.speed);
    }
    return sign;
  }
}
