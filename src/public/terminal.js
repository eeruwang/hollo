/* Hollo (eeruwang fork) — terminal shell scripts
 * Live clock + keyboard navigation.  The peek drawer and reaction toggles
 * are wired up in later passes once the per-page markup lands.
 */
(() => {
  if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
    document.documentElement.classList.add("rm");
  }

  // ---------- live clock (HH:MM, refreshed every 15s) ----------
  const pad = (n) => String(n).padStart(2, "0");
  const tick = () => {
    const d = new Date();
    const s = `${pad(d.getHours())}:${pad(d.getMinutes())}`;
    document.querySelectorAll("[data-clock]").forEach((el) => {
      el.textContent = s;
    });
  };
  tick();
  setInterval(tick, 15_000);

  // ---------- j/k vertical selection across .entry / .notif rows ----------
  const page = document.querySelector(".page");
  const selectableSelector = ".entry, .notif";
  let selectedIndex = -1;

  function rows() {
    return Array.from(document.querySelectorAll(selectableSelector));
  }
  function applySelection(idx, list) {
    list.forEach((el, i) => el.classList.toggle("sel", i === idx));
    const el = list[idx];
    if (el == null) return;
    el.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }
  function move(delta) {
    const list = rows();
    if (list.length === 0) return;
    if (selectedIndex < 0) {
      selectedIndex = delta > 0 ? 0 : list.length - 1;
    } else {
      selectedIndex = (selectedIndex + delta + list.length) % list.length;
    }
    applySelection(selectedIndex, list);
  }

  document.addEventListener("keydown", (ev) => {
    if (ev.metaKey || ev.ctrlKey || ev.altKey) return;
    const target = ev.target;
    if (
      target instanceof HTMLElement &&
      (target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.isContentEditable)
    ) {
      return;
    }
    switch (ev.key) {
      case "j":
      case "ArrowDown":
        ev.preventDefault();
        move(+1);
        return;
      case "k":
      case "ArrowUp":
        ev.preventDefault();
        move(-1);
        return;
      case "Enter": {
        const list = rows();
        const el = list[selectedIndex];
        const link = el?.querySelector("a[href]");
        if (link instanceof HTMLAnchorElement) {
          ev.preventDefault();
          link.click();
        }
        return;
      }
      case "c": {
        const compose = document.querySelector(".rail a.cta");
        if (compose instanceof HTMLAnchorElement) {
          ev.preventDefault();
          compose.click();
        }
        return;
      }
      case ",": {
        ev.preventDefault();
        const settings = document.querySelector('.rail a[href="/settings"]');
        if (settings instanceof HTMLAnchorElement) settings.click();
        return;
      }
      default:
        return;
    }
  });

  // Restore the saved selection when navigating back.
  window.addEventListener("pageshow", () => {
    const list = rows();
    if (selectedIndex >= 0 && selectedIndex < list.length) {
      applySelection(selectedIndex, list);
    }
  });
})();
