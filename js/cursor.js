(function () {
  var enableQuery = window.matchMedia("(hover: hover) and (pointer: fine) and (min-width: 900px)");
  var reduceQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
  var el = null;
  var label = null;
  var raf = 0;
  var last = 0;
  var x = 0;
  var y = 0;
  var tx = 0;
  var ty = 0;
  var shown = false;
  var active = false;
  var TEXT_SELECTOR = "p, li, td, th, dd, dt, h1, h2, h3, a, button, figcaption, .chip";

  function pad(n) {
    return String(Math.max(0, Math.round(n))).padStart(4, "0");
  }

  function create() {
    el = document.createElement("div");
    el.className = "cursor-readout";
    el.setAttribute("aria-hidden", "true");
    el.innerHTML = '<svg class="cursor-cross" viewBox="0 0 14 14" width="14" height="14" focusable="false"><path d="M7 0V5M7 9V14M0 7H5M9 7H14" fill="none" stroke="currentColor" stroke-width="1.2"/></svg><span class="cursor-label">X 0000 Y 0000</span>';
    label = el.querySelector(".cursor-label");
    document.body.appendChild(el);
  }

  function place() {
    el.style.transform = "translate3d(" + x.toFixed(1) + "px," + y.toFixed(1) + "px,0)";
  }

  function tick(now) {
    var dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    var k = 1 - Math.exp(-dt * 24);
    x += (tx - x) * k;
    y += (ty - y) * k;
    place();
    if (Math.abs(tx - x) < 0.1 && Math.abs(ty - y) < 0.1) {
      x = tx;
      y = ty;
      place();
      raf = 0;
      return;
    }
    raf = requestAnimationFrame(tick);
  }

  function onMove(e) {
    if (e.pointerType && e.pointerType !== "mouse" && e.pointerType !== "pen") return;
    tx = e.clientX;
    ty = e.clientY;
    label.textContent = "X " + pad(tx) + " Y " + pad(ty);
    el.classList.toggle("over-text", !!(e.target && e.target.closest && e.target.closest(TEXT_SELECTOR)));
    el.classList.toggle("flip-x", tx > window.innerWidth - 150);
    el.classList.toggle("flip-y", ty > window.innerHeight - 40);
    if (!shown) {
      x = tx;
      y = ty;
      place();
      shown = true;
      el.classList.add("on");
    }
    if (reduceQuery.matches) {
      x = tx;
      y = ty;
      place();
      return;
    }
    if (!raf) {
      last = performance.now();
      raf = requestAnimationFrame(tick);
    }
  }

  function hide() {
    if (!el) return;
    shown = false;
    el.classList.remove("on");
  }

  function onOut(e) {
    if (!e.relatedTarget) hide();
  }

  function enable() {
    if (active) return;
    active = true;
    if (!el) create();
    document.addEventListener("pointermove", onMove, { passive: true });
    document.addEventListener("mouseout", onOut);
    window.addEventListener("blur", hide);
  }

  function disable() {
    if (!active) return;
    active = false;
    document.removeEventListener("pointermove", onMove);
    document.removeEventListener("mouseout", onOut);
    window.removeEventListener("blur", hide);
    if (raf) cancelAnimationFrame(raf);
    raf = 0;
    if (el && el.parentNode) el.parentNode.removeChild(el);
    el = null;
    label = null;
    shown = false;
  }

  function sync() {
    if (enableQuery.matches) enable();
    else disable();
  }

  if (enableQuery.addEventListener) enableQuery.addEventListener("change", sync);
  else if (enableQuery.addListener) enableQuery.addListener(sync);
  sync();
})();
