/* ==========================================================================
   IN KIND STUDIOS — premium interaction layer (behaviour)
   Custom difference-blend cursor, magnetic CTAs, scroll parallax in media.
   Desktop fine-pointer only; fully skipped under prefers-reduced-motion.
   ========================================================================== */

(function () {
  "use strict";

  var finePointer = window.matchMedia("(pointer: fine)").matches;
  var motionOK = !window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  document.addEventListener("DOMContentLoaded", function () {
    if (motionOK) initParallax();
    if (finePointer && motionOK) {
      initCursor();
      initMagnetic();
    }
  });

  /* ---------- custom cursor: dot + lerped ring, difference blend ---------- */

  function initCursor() {
    var docEl = document.documentElement;
    docEl.classList.add("has-cursor");

    var dot = document.createElement("div");
    dot.className = "cursor-dot";
    var ring = document.createElement("div");
    ring.className = "cursor-ring";
    var label = document.createElement("span");
    label.textContent = "view";
    ring.appendChild(label);
    document.body.appendChild(dot);
    document.body.appendChild(ring);

    var mx = -100, my = -100, rx = -100, ry = -100;

    window.addEventListener("mousemove", function (e) {
      mx = e.clientX;
      my = e.clientY;
      dot.style.transform = "translate(" + (mx - 3.5) + "px," + (my - 3.5) + "px)";
      docEl.classList.remove("cursor-away");
    }, { passive: true });

    document.addEventListener("mouseleave", function () {
      docEl.classList.add("cursor-away");
    });
    document.addEventListener("mouseenter", function () {
      docEl.classList.remove("cursor-away");
    });

    document.addEventListener("mousedown", function () { ring.classList.add("is-down"); });
    document.addEventListener("mouseup", function () { ring.classList.remove("is-down"); });

    /* hover states via delegation */
    document.addEventListener("mouseover", function (e) {
      var t = e.target;
      var view = t.closest && t.closest('[data-cursor="view"]');
      var link = t.closest && t.closest("a, button, input, .pill, .menu-btn");
      ring.classList.toggle("is-view", !!view);
      ring.classList.toggle("is-hover", !view && !!link);
    });

    (function loop() {
      requestAnimationFrame(loop);
      rx += (mx - rx) * 0.16;
      ry += (my - ry) * 0.16;
      var half = ring.offsetWidth / 2;
      ring.style.transform = "translate(" + (rx - half) + "px," + (ry - half) + "px)";
    })();
  }

  /* ---------- magnetic pull on pill CTAs (uses `translate`, not transform) ---------- */

  function initMagnetic() {
    document.querySelectorAll(".pill").forEach(function (pill) {
      pill.addEventListener("mousemove", function (e) {
        var r = pill.getBoundingClientRect();
        var dx = e.clientX - (r.left + r.width / 2);
        var dy = e.clientY - (r.top + r.height / 2);
        pill.style.translate = (dx * 0.18) + "px " + (dy * 0.3) + "px";
      });
      pill.addEventListener("mouseleave", function () {
        pill.style.translate = "0px 0px";
      });
    });
  }

  /* ---------- gentle scroll parallax inside media placeholders ---------- */

  function initParallax() {
    var items = [];
    document.querySelectorAll(
      ".project-card__media .ph, .pillar__media .ph, .team-card__media .ph"
    ).forEach(function (ph) {
      items.push({ ph: ph, box: ph.parentElement });
    });
    if (!items.length) return;

    var ticking = false;
    function update() {
      ticking = false;
      var vh = window.innerHeight;
      for (var i = 0; i < items.length; i++) {
        var r = items[i].box.getBoundingClientRect();
        if (r.bottom < -40 || r.top > vh + 40) continue;
        var ratio = (r.top + r.height / 2 - vh / 2) / vh; /* -0.5 .. 0.5 */
        var y = Math.max(-14, Math.min(14, ratio * -26));
        items[i].ph.style.setProperty("--py", y.toFixed(1) + "px");
      }
    }
    function onScroll() {
      if (!ticking) { ticking = true; requestAnimationFrame(update); }
    }
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll, { passive: true });
    update();
  }
})();
