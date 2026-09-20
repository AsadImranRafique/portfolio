(function () {
  var root = document.documentElement;
  var reduceQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
  var NEUTRAL = [139, 156, 255];
  var DURATION = 900;
  var accent = { rgb: NEUTRAL.slice() };
  var tween = 0;
  var currentTarget = null;
  window.Accent = accent;

  function parseRgb(value) {
    var parts = String(value).trim().split(/[\s,\/]+/).map(Number);
    if (parts.length < 3 || parts.slice(0, 3).some(isNaN)) return NEUTRAL.slice();
    return parts.slice(0, 3);
  }

  function apply(rgb) {
    var r = Math.round(rgb[0]);
    var g = Math.round(rgb[1]);
    var b = Math.round(rgb[2]);
    root.style.setProperty("--live-accent-rgb", r + " " + g + " " + b);
    root.style.setProperty("--live-accent", "rgb(" + r + "," + g + "," + b + ")");
  }

  function setAccent(target) {
    if (tween) cancelAnimationFrame(tween);
    tween = 0;
    if (reduceQuery.matches) {
      accent.rgb = target.slice();
      apply(accent.rgb);
      window.dispatchEvent(new Event("accentchange"));
      return;
    }
    var from = accent.rgb.slice();
    var t0 = performance.now();
    function step(now) {
      var k = Math.min(1, (now - t0) / DURATION);
      var e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
      accent.rgb = [
        from[0] + (target[0] - from[0]) * e,
        from[1] + (target[1] - from[1]) * e,
        from[2] + (target[2] - from[2]) * e
      ];
      apply(accent.rgb);
      tween = k < 1 ? requestAnimationFrame(step) : 0;
    }
    tween = requestAnimationFrame(step);
  }

  var navLinks = Array.prototype.slice.call(document.querySelectorAll(".nav-links a[data-nav]"));

  function setNav(id) {
    navLinks.forEach(function (a) {
      if (a.dataset.nav === id) a.setAttribute("aria-current", "location");
      else a.removeAttribute("aria-current");
    });
  }

  function activate(el) {
    if (el === currentTarget) return;
    currentTarget = el;
    setAccent(parseRgb(getComputedStyle(el).getPropertyValue("--accent-rgb")));
    setNav(el.dataset.nav || el.id || "");
  }

  var tracked = Array.prototype.slice.call(document.querySelectorAll("[data-track]"));
  if ("IntersectionObserver" in window) {
    var trackObserver = new IntersectionObserver(function (entries) {
      var hit = null;
      entries.forEach(function (entry) {
        if (entry.isIntersecting) hit = entry.target;
      });
      if (hit) activate(hit);
    }, { rootMargin: "-55% 0px -40% 0px", threshold: 0 });
    tracked.forEach(function (el) {
      trackObserver.observe(el);
    });
  }

  var menuBtn = document.querySelector(".menu-btn");
  var menu = document.getElementById("nav-links");

  function setMenu(open) {
    menu.classList.toggle("open", open);
    menuBtn.setAttribute("aria-expanded", open ? "true" : "false");
    menuBtn.textContent = open ? "Close" : "Menu";
  }

  if (menuBtn && menu) {
    menuBtn.addEventListener("click", function () {
      setMenu(!menu.classList.contains("open"));
    });
    menu.addEventListener("click", function (e) {
      if (e.target.closest("a")) setMenu(false);
    });
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && menu.classList.contains("open")) {
        setMenu(false);
        menuBtn.focus();
      }
    });
    window.matchMedia("(min-width: 900px)").addEventListener("change", function (e) {
      if (e.matches) setMenu(false);
    });
  }

  if ("IntersectionObserver" in window && !reduceQuery.matches) {
    root.classList.add("js-reveal");
    var revealObserver = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          entry.target.classList.add("in");
          revealObserver.unobserve(entry.target);
        }
      });
    }, { rootMargin: "0px 0px -6% 0px", threshold: 0.06 });
    document.querySelectorAll(".reveal").forEach(function (el) {
      revealObserver.observe(el);
    });
  }

  var order = ["cm", "jetson", "rff", "stm", "exp", "edu"];
  var labels = { cm: "01", jetson: "02", rff: "03", stm: "04", exp: "Experience", edu: "Education" };
  var skillMap = {};
  document.querySelectorAll(".project").forEach(function (project) {
    var key = project.dataset.project;
    (project.dataset.skills || "").split(/\s+/).forEach(function (skill) {
      if (!skill) return;
      if (!skillMap[skill]) skillMap[skill] = [];
      if (skillMap[skill].indexOf(key) === -1) skillMap[skill].push(key);
    });
  });

  var legendItems = Array.prototype.slice.call(document.querySelectorAll(".tk-legend li"));
  var projectEls = Array.prototype.slice.call(document.querySelectorAll(".project"));
  var rowEls = Array.prototype.slice.call(document.querySelectorAll(".row[data-hl]"));

  function tokens(value) {
    return (value || "").split(/\s+/).filter(Boolean);
  }

  function highlight(keys, rows) {
    legendItems.forEach(function (li) {
      var on = keys.indexOf(li.dataset.project) !== -1;
      li.classList.toggle("on", on);
      li.classList.toggle("off", !on);
    });
    projectEls.forEach(function (el) {
      var on = keys.indexOf(el.dataset.project) !== -1;
      el.classList.toggle("tk-hl", on);
      el.classList.toggle("tk-dim", !on);
    });
    rowEls.forEach(function (el) {
      var on = rows.indexOf(el.dataset.hl) !== -1;
      el.classList.toggle("tk-hl", on);
      el.classList.toggle("tk-dim", !on);
    });
  }

  function clearHighlight() {
    legendItems.forEach(function (li) {
      li.classList.remove("on", "off");
    });
    projectEls.concat(rowEls).forEach(function (el) {
      el.classList.remove("tk-hl", "tk-dim");
    });
  }

  var touchQuery = window.matchMedia("(hover: none), (pointer: coarse)");
  var toolkitEl = document.getElementById("toolkit");
  var headNote = toolkitEl ? toolkitEl.querySelector(".head-note") : null;
  var headNoteDesktop = headNote ? headNote.textContent : "";
  var headNoteTouch = "Tap a chip to highlight the projects, roles and education behind it.";
  var activeChip = null;

  function deactivateChip() {
    if (activeChip) activeChip.classList.remove("is-active");
    activeChip = null;
    if (toolkitEl) toolkitEl.classList.remove("tk-active");
    clearHighlight();
  }

  function syncTouchMode() {
    deactivateChip();
    if (headNote) headNote.textContent = touchQuery.matches ? headNoteTouch : headNoteDesktop;
  }

  document.addEventListener("click", function (e) {
    if (activeChip && !(e.target.closest && e.target.closest(".chip"))) deactivateChip();
  });

  if (touchQuery.addEventListener) touchQuery.addEventListener("change", syncTouchMode);
  else if (touchQuery.addListener) touchQuery.addListener(syncTouchMode);
  syncTouchMode();

  document.querySelectorAll(".chip[data-skill]").forEach(function (chip) {
    var found = [];
    tokens(chip.dataset.skill).forEach(function (skill) {
      (skillMap[skill] || []).forEach(function (k) {
        if (found.indexOf(k) === -1) found.push(k);
      });
    });
    tokens(chip.dataset.extra).forEach(function (k) {
      if (found.indexOf(k) === -1) found.push(k);
    });
    var keys = order.filter(function (k) {
      return found.indexOf(k) !== -1;
    });
    var rows = tokens(chip.dataset.rows);
    chip.dataset.projects = keys.join(" ");
    if (keys.length) {
      var dots = document.createElement("span");
      dots.className = "dots";
      dots.setAttribute("aria-hidden", "true");
      keys.forEach(function (k) {
        var dot = document.createElement("span");
        dot.className = "dot";
        dot.dataset.project = k;
        dots.appendChild(dot);
      });
      chip.appendChild(dots);
      var note = document.createElement("span");
      note.className = "sr-only";
      note.textContent = " Used in " + keys.map(function (k) { return /^\d/.test(labels[k]) ? "project " + labels[k] : labels[k]; }).join(", ");
      chip.appendChild(note);
    }
    chip.addEventListener("mouseenter", function () {
      if (!touchQuery.matches) highlight(keys, rows);
    });
    chip.addEventListener("mouseleave", function () {
      if (!touchQuery.matches) clearHighlight();
    });
    chip.addEventListener("focus", function () {
      if (!touchQuery.matches) highlight(keys, rows);
    });
    chip.addEventListener("blur", function () {
      if (!touchQuery.matches) clearHighlight();
    });
    chip.addEventListener("click", function () {
      if (!touchQuery.matches) return;
      if (activeChip === chip) {
        deactivateChip();
        return;
      }
      deactivateChip();
      activeChip = chip;
      chip.classList.add("is-active");
      if (toolkitEl) toolkitEl.classList.add("tk-active");
      highlight(keys, rows);
    });
  });

  var tkGrid = document.querySelector(".tk-grid");
  if (tkGrid) {
    var tkGroups = Array.prototype.slice.call(tkGrid.querySelectorAll(".tk-group"));
    var tkColumns = [[0, 2], [1, 4], [3, 5]];
    var tkQuery = window.matchMedia("(min-width: 900px)");
    var arrangeToolkit = function () {
      var frag = document.createDocumentFragment();
      if (tkQuery.matches) {
        tkColumns.forEach(function (indices) {
          var col = document.createElement("div");
          col.className = "tk-col";
          indices.forEach(function (i) {
            col.appendChild(tkGroups[i]);
          });
          frag.appendChild(col);
        });
        tkGrid.classList.add("cols");
      } else {
        tkGroups.forEach(function (g) {
          frag.appendChild(g);
        });
        tkGrid.classList.remove("cols");
      }
      while (tkGrid.firstChild) tkGrid.removeChild(tkGrid.firstChild);
      tkGrid.appendChild(frag);
    };
    if (tkGroups.length === 6) {
      arrangeToolkit();
      if (tkQuery.addEventListener) tkQuery.addEventListener("change", arrangeToolkit);
      else if (tkQuery.addListener) tkQuery.addListener(arrangeToolkit);
    }
  }

  var progressFill = document.querySelector(".scroll-progress-fill");
  if (progressFill) {
    var progressPending = false;
    var updateProgress = function () {
      progressPending = false;
      var max = document.documentElement.scrollHeight - window.innerHeight;
      var p = max > 0 ? Math.min(1, Math.max(0, window.scrollY / max)) : 0;
      progressFill.style.transform = "scaleX(" + p + ")";
    };
    var requestProgress = function () {
      if (progressPending) return;
      progressPending = true;
      requestAnimationFrame(updateProgress);
    };
    window.addEventListener("scroll", requestProgress, { passive: true });
    window.addEventListener("resize", requestProgress);
    window.addEventListener("load", requestProgress);
    updateProgress();
  }

  apply(accent.rgb);
})();
