/**
 * The selected tab's underline and the pressed segment's background slide
 * to the new choice instead of jumping. Every `.tabs` and `.segmented` on the
 * page gets it: this measures the chosen button and hands its place to CSS
 * (--ind-l, --ind-r, --ind-w), which draws and animates the indicator.
 * Without this script the buttons keep their own static marks.
 */
const CONTAINERS = '.segmented, .tabs';
const CHOSEN = '[aria-pressed="true"], [aria-selected="true"]';

function place(el: HTMLElement) {
  const chosen = [...el.querySelectorAll<HTMLElement>(CHOSEN)].find((b) => b.closest(CONTAINERS) === el);
  if (!chosen || !chosen.offsetWidth) {
    el.removeAttribute('data-ind');
    return;
  }
  const tabs = el.classList.contains('tabs');
  const inset = tabs ? 4 : 0;
  const l = chosen.offsetLeft + inset;
  const w = chosen.offsetWidth - inset * 2;
  el.style.setProperty('--ind-l', `${l}px`);
  el.style.setProperty('--ind-r', `${Math.max(0, el.clientWidth - l - w)}px`);
  el.style.setProperty('--ind-w', `${w / 100}`);
  if (!el.hasAttribute('data-ind')) {
    // the first place is set without sliding in from the left edge
    el.setAttribute('data-ind', '');
    requestAnimationFrame(() => requestAnimationFrame(() => el.setAttribute('data-ind', 'ready')));
  }
}

export function installIndicators(root: HTMLElement = document.body) {
  let queued = false;
  const sizes = new ResizeObserver(() => schedule());
  const seen = new WeakSet<HTMLElement>();
  const update = () => {
    queued = false;
    for (const el of root.querySelectorAll<HTMLElement>(CONTAINERS)) {
      if (!seen.has(el)) {
        seen.add(el);
        sizes.observe(el);
      }
      place(el);
    }
  };
  const schedule = () => {
    if (queued) return;
    queued = true;
    requestAnimationFrame(update);
  };
  new MutationObserver(schedule).observe(root, { subtree: true, childList: true, attributes: true, attributeFilter: ['aria-pressed', 'aria-selected', 'class'] });
  window.addEventListener('resize', schedule);
  document.fonts?.ready.then(schedule);
  schedule();
}
