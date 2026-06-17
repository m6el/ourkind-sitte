/* ==========================================================================
   IN KIND STUDIOS — 3D scroll-driven opening sequence
   Stylized cinema camera built from three.js primitives, scrubbed by GSAP
   ScrollTrigger. Only runs when <html> carries .intro-3d (set by the inline
   mode script in the <head>); any failure demotes the page to the static SVG.
   ========================================================================== */

(function () {
  "use strict";

  var docEl = document.documentElement;
  if (!docEl.classList.contains("intro-3d")) return;

  var THREE_SRC = "https://unpkg.com/three@0.149.0/build/three.min.js";
  var GSAP_SRC = "https://unpkg.com/gsap@3.12.5/dist/gsap.min.js";
  var ST_SRC = "https://unpkg.com/gsap@3.12.5/dist/ScrollTrigger.min.js";

  function loadScript(src) {
    return new Promise(function (resolve, reject) {
      var s = document.createElement("script");
      s.src = src;
      s.onload = resolve;
      s.onerror = reject;
      document.head.appendChild(s);
    });
  }

  function toStatic() {
    docEl.classList.remove("intro-3d");
    docEl.classList.add("intro-static");
  }

  Promise.all([loadScript(THREE_SRC), loadScript(GSAP_SRC)])
    .then(function () { return loadScript(ST_SRC); })
    .then(function () {
      try { init(); } catch (err) { console.error("[intro3d]", err); toStatic(); }
    })
    .catch(toStatic);

  /* ======================================================================
     INIT
     ====================================================================== */

  function init() {
    gsap.registerPlugin(ScrollTrigger);

    var stage = document.getElementById("intro-stage");
    var scroller = document.getElementById("intro-scroller");
    var labelLayer = document.getElementById("intro-labels");

    /* ---------- palette (kept true to the site's CSS variables) ---------- */
    var COL = {
      creamA: 0xefe8d8,   // front body panel
      creamB: 0xe2dac6,   // back shell / handle
      charA: 0x2e2a24,    // lens barrels
      charB: 0x211e19,    // deep charcoal details
      accent: 0xc9824c    // shutter button + cable only
    };

    /* ---------- renderer / scene / camera ---------- */
    var renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, preserveDrawingBuffer: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
    renderer.setSize(stage.clientWidth, stage.clientHeight);
    stage.insertBefore(renderer.domElement, stage.firstChild);

    var scene = new THREE.Scene();
    var cam3 = new THREE.PerspectiveCamera(35, stage.clientWidth / stage.clientHeight, 0.1, 60);
    cam3.position.set(0, 0.15, 7);

    /* soft single key + generous ambient = gentle, flat, palette-true */
    scene.add(new THREE.AmbientLight(0xffffff, 0.8));
    var key = new THREE.DirectionalLight(0xfff6e8, 0.26);
    key.position.set(4, 6, 8);
    scene.add(key);
    var fill = new THREE.DirectionalLight(0xffffff, 0.08);
    fill.position.set(-5, -2, -4);
    scene.add(fill);

    /* ---------- toon materials ---------- */
    function gradientMap(stops) {
      var data = new Uint8Array(stops.length * 4);
      for (var i = 0; i < stops.length; i++) {
        var v = Math.round(stops[i] * 255);
        data[i * 4] = v; data[i * 4 + 1] = v; data[i * 4 + 2] = v; data[i * 4 + 3] = 255;
      }
      var tex = new THREE.DataTexture(data, stops.length, 1, THREE.RGBAFormat);
      tex.needsUpdate = true;
      tex.minFilter = tex.magFilter = THREE.NearestFilter;
      return tex;
    }
    var grad = gradientMap([0.55, 0.82, 1.0]);
    function toon(hex) { return new THREE.MeshToonMaterial({ color: hex, gradientMap: grad }); }

    var matCreamA = toon(COL.creamA);
    var matCreamB = toon(COL.creamB);
    var matCharA = toon(COL.charA);
    var matCharB = toon(COL.charB);
    var matAccent = toon(COL.accent);

    /* ---------- geometry helpers ---------- */
    function roundedBox(w, h, d, r) {
      var x = -w / 2, y = -h / 2;
      var shape = new THREE.Shape();
      shape.moveTo(x + r, y);
      shape.lineTo(x + w - r, y);
      shape.quadraticCurveTo(x + w, y, x + w, y + r);
      shape.lineTo(x + w, y + h - r);
      shape.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
      shape.lineTo(x + r, y + h);
      shape.quadraticCurveTo(x, y + h, x, y + h - r);
      shape.lineTo(x, y + r);
      shape.quadraticCurveTo(x, y, x + r, y);
      var depth = Math.max(0.05, d - 0.16);
      var geo = new THREE.ExtrudeGeometry(shape, {
        depth: depth, bevelEnabled: true, bevelThickness: 0.08,
        bevelSize: 0.08, bevelSegments: 3, curveSegments: 6
      });
      geo.translate(0, 0, -depth / 2);
      return geo;
    }

    function lensCyl(r, h, mat) {
      var geo = new THREE.CylinderGeometry(r, r, h, 40);
      geo.rotateX(Math.PI / 2);
      return new THREE.Mesh(geo, mat);
    }

    function ridgedRing(r, h) {
      var g = new THREE.Group();
      g.add(lensCyl(r, h, matCharB));
      var ridgeGeo = new THREE.BoxGeometry(0.05, 0.05, h * 0.72);
      for (var i = 0; i < 22; i++) {
        var a = (i / 22) * Math.PI * 2;
        var ridge = new THREE.Mesh(ridgeGeo, matCharA);
        ridge.position.set(Math.cos(a) * r, Math.sin(a) * r, 0);
        ridge.rotation.z = a;
        g.add(ridge);
      }
      return g;
    }

    /* ---------- scene graph: parallax > spin > float > parts ---------- */
    var parallax = new THREE.Group();
    var spin = new THREE.Group();      // scroll-driven rotation
    var float_ = new THREE.Group();    // time-based wobble
    scene.add(parallax);
    parallax.add(spin);
    spin.add(float_);
    spin.rotation.set(0.06, -0.25, 0);

    var PARTS = [];
    function part(obj, home, out, lag, opts) {
      obj.position.copy(home);
      float_.add(obj);
      var p = { obj: obj, home: home, out: out, lag: lag };
      if (opts) { p.spinZ = opts.spinZ; p.drift = opts.drift; p.dlag = opts.dlag || 0; }
      PARTS.push(p);
      return obj;
    }
    var V3 = function (x, y, z) { return new THREE.Vector3(x, y, z); };

    /* body shells */
    var backShell = part(
      new THREE.Mesh(roundedBox(3.0, 2.05, 0.75, 0.22), matCreamB),
      V3(0, 0, -0.42), V3(0, 0, -1.6), 3, { drift: V3(-2.6, 0, 0), dlag: 7 });

    var frontPanel = part(
      new THREE.Mesh(roundedBox(3.0, 2.05, 0.75, 0.22), matCreamA),
      V3(0, 0, 0.42), V3(0, 0, 1.15), 2, { drift: V3(3.2, -0.3, 0), dlag: 5 });

    /* sensor — the good stuff */
    var sensor = new THREE.Group();
    sensor.add(new THREE.Mesh(roundedBox(2.5, 1.62, 0.14, 0.1), matCharB));
    var sensorFace = new THREE.Mesh(
      new THREE.PlaneGeometry(2.24, 1.4),
      new THREE.MeshBasicMaterial({ map: makeSensorTexture(), toneMapped: false })
    );
    sensorFace.position.z = 0.13; /* proud of the frame's bevel so it reads */
    sensor.add(sensorFace);
    part(sensor, V3(0, 0, 0), V3(0, 0, 0.15), 4, null);

    /* lens stack (axis +Z) */
    var lensBase = part(lensCyl(0.62, 0.5, matCharA), V3(0, 0, 1.05), V3(0, 0, 1.0), 4, { drift: V3(2.5, 0.5, 0), dlag: 8 });
    var ring1 = part(ridgedRing(0.68, 0.26), V3(0, 0, 1.42), V3(0, 0, 1.6), 5, { drift: V3(-2.6, 0.3, 0), dlag: 6 });
    var lensMid = part(lensCyl(0.5, 0.5, matCharA), V3(0, 0, 1.78), V3(0, 0, 2.2), 6, { drift: V3(2.4, -0.4, 0), dlag: 4 });
    var ring2 = part(ridgedRing(0.56, 0.24), V3(0, 0, 2.14), V3(0, 0, 2.8), 7, { drift: V3(-2.5, -0.2, 0), dlag: 2 });

    var lensFront = new THREE.Group();
    lensFront.add(lensCyl(0.44, 0.4, matCharA));
    var glass = lensCyl(0.34, 0.07, matCharB);
    glass.position.z = 0.2;
    lensFront.add(glass);
    part(lensFront, V3(0, 0, 2.5), V3(0, 0, 3.4), 8, { drift: V3(2.6, 0.35, 0), dlag: 0 });

    /* top handle */
    var handle = new THREE.Group();
    var bar = new THREE.Mesh(roundedBox(1.4, 0.3, 0.5, 0.12), matCreamB);
    bar.position.set(0.3, 1.52, 0);
    handle.add(bar);
    [-0.25, 0.85].forEach(function (lx) {
      var leg = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.55, 0.42), matCreamB);
      leg.position.set(lx, 1.22, 0);
      handle.add(leg);
    });
    part(handle, V3(0, 0, -0.05), V3(0, 1.7, 0), 4, { drift: V3(0.6, 1.4, 0), dlag: 4 });

    /* viewfinder block + eyepiece */
    var viewfinder = new THREE.Group();
    var vfBody = new THREE.Mesh(roundedBox(0.55, 0.4, 0.85, 0.1), matCharA);
    viewfinder.add(vfBody);
    var eye = lensCyl(0.17, 0.16, matCharB);
    eye.position.z = -0.5;
    viewfinder.add(eye);
    part(viewfinder, V3(-0.85, 1.27, -0.4), V3(-0.35, 1.25, -0.85), 5, { drift: V3(-1.6, 0.9, 0), dlag: 6 });

    /* side dial */
    var dial = new THREE.Group();
    var dialGeo = new THREE.CylinderGeometry(0.3, 0.3, 0.2, 28);
    dialGeo.rotateZ(Math.PI / 2);
    dial.add(new THREE.Mesh(dialGeo, matCharA));
    var notchGeo = new THREE.BoxGeometry(0.05, 0.05, 0.05);
    for (var di = 0; di < 12; di++) {
      var da = (di / 12) * Math.PI * 2;
      var notch = new THREE.Mesh(notchGeo, matCharB);
      notch.position.set(0, Math.cos(da) * 0.3, Math.sin(da) * 0.3);
      dial.add(notch);
    }
    part(dial, V3(1.62, 0.35, 0.1), V3(1.8, 0.1, 0), 6, { drift: V3(2.0, -0.6, 0), dlag: 3 });

    /* shutter button — accent */
    var shutter = new THREE.Group();
    var shutterBtn = lensCyl(0.16, 0.12, matAccent);
    shutterBtn.rotation.x = 0;
    shutterBtn.geometry = new THREE.CylinderGeometry(0.16, 0.18, 0.14, 24);
    shutter.add(new THREE.Mesh(shutterBtn.geometry, matAccent));
    part(shutter, V3(1.35, 1.1, 0.42), V3(0.35, 2.1, 0), 7, { drift: V3(1.2, 1.6, 0), dlag: 2 });

    /* cable — accent */
    var cableCurve = new THREE.CatmullRomCurve3([
      V3(1.62, 0.28, 0.12), V3(1.96, -0.28, 0), V3(1.74, -0.8, -0.32), V3(1.36, -0.98, -0.6)
    ]);
    var cable = new THREE.Mesh(new THREE.TubeGeometry(cableCurve, 40, 0.045, 8), matAccent);
    part(cable, V3(0, 0, 0), V3(1.5, -0.55, -0.3), 6, { drift: V3(2.2, -1.3, 0), dlag: 5 });

    /* screws — 6, slotted, spiral out */
    var screwGeo = new THREE.CylinderGeometry(0.07, 0.07, 0.07, 16);
    screwGeo.rotateX(Math.PI / 2);
    var slotGeo = new THREE.BoxGeometry(0.1, 0.018, 0.03);
    [[-1.22, 0.72], [1.22, 0.72], [-1.22, -0.72], [1.22, -0.72], [0, 0.78], [0, -0.78]]
      .forEach(function (pos, i) {
        var s = new THREE.Group();
        s.add(new THREE.Mesh(screwGeo, matCharB));
        var slot = new THREE.Mesh(slotGeo, matCharA);
        slot.position.z = 0.036;
        slot.rotation.z = i * 0.7;
        s.add(slot);
        var dir = V3(pos[0], pos[1], 0).normalize();
        part(s, V3(pos[0], pos[1], 0.81),
          V3(dir.x * 0.95, dir.y * 0.95, 2.3), i, {
            spinZ: -Math.PI * 3,
            drift: V3(dir.x * 2.2, dir.y * 1.4, 0), dlag: i
          });
      });

    /* contact shadow */
    var shadowMat = new THREE.MeshBasicMaterial({
      map: makeShadowTexture(), transparent: true, opacity: 0.3, depthWrite: false
    });
    var shadow = new THREE.Mesh(new THREE.CircleGeometry(2.3, 40), shadowMat);
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.y = -1.7;
    scene.add(shadow);

    /* ---------- diagram labels ---------- */
    var LABELS = [
      { text: "lens", side: "right", parent: ring1, local: V3(0.8, 0.25, 0) },
      { text: "body", side: "left", parent: frontPanel, local: V3(-1.35, 0.5, 0.4) },
      { text: "viewfinder", side: "right", parent: viewfinder, local: V3(0.45, 0.3, 0) },
      { text: "the good stuff", side: "left", parent: sensor, local: V3(-1.15, -0.5, 0.12) }
    ].map(function (l) {
      var anchor = new THREE.Object3D();
      anchor.position.copy(l.local);
      l.parent.add(anchor);
      var el = document.createElement("div");
      el.className = "intro-label intro-label--" + l.side;
      var line = l.side === "right"
        ? '<svg width="40" height="40" viewBox="0 0 40 40" fill="none"><path d="M2 38 L34 8" stroke="#211e19" stroke-width="1.5"/></svg>'
        : '<svg width="40" height="40" viewBox="0 0 40 40" fill="none"><path d="M38 38 L6 8" stroke="#211e19" stroke-width="1.5"/></svg>';
      el.innerHTML = '<div class="intro-label__inner">' + line +
        '<span class="intro-label__text">' + l.text + "</span></div>";
      labelLayer.appendChild(el);
      return { anchor: anchor, el: el };
    });

    /* ---------- scrubbed timeline (0–100 ≙ 350vh of scroll) ---------- */
    var tl = gsap.timeline({
      defaults: { ease: "power2.inOut" },
      scrollTrigger: {
        trigger: scroller,
        start: "top top",
        end: "bottom bottom",
        scrub: 0.6
      }
    });

    /* phase 1 · 0–15 — assembled, slow turn */
    tl.to(spin.rotation, { y: 0.4, x: 0.08, duration: 15, ease: "none" }, 0);
    tl.to("#intro-hint", { opacity: 0, duration: 4, ease: "none" }, 2);

    /* phase 2 · 15–55 — exploded diagram */
    PARTS.forEach(function (p) {
      tl.to(p.obj.position, {
        x: p.home.x + p.out.x, y: p.home.y + p.out.y, z: p.home.z + p.out.z,
        duration: 26, ease: "power3.inOut"
      }, 15 + p.lag);
      if (p.spinZ) {
        tl.to(p.obj.rotation, { z: p.spinZ, duration: 26, ease: "power3.inOut" }, 15 + p.lag);
      }
    });
    tl.to(cam3.position, { z: 9.5, y: 0.3, duration: 28 }, 15);
    tl.to(spin.rotation, { y: 0.48, x: 0.05, duration: 28 }, 15);
    tl.to(shadowMat, { opacity: 0, duration: 18, ease: "none" }, 18);
    tl.to(shadow.scale, { x: 1.4, y: 1.4, z: 1.4, duration: 18 }, 18);
    tl.to(".intro-label", { opacity: 1, duration: 6, stagger: 1.6, ease: "none" }, 34);

    /* phase 3 · 55–85 — dolly through the parts to the sensor */
    tl.to(".intro-label", { opacity: 0, duration: 5, ease: "none" }, 55);
    tl.to(spin.rotation, { y: 0, x: 0, duration: 18 }, 55);
    tl.to(cam3.position, { z: 2.1, y: 0, duration: 30 }, 55);
    PARTS.forEach(function (p) {
      if (!p.drift) return;
      tl.to(p.obj.position, {
        x: "+=" + p.drift.x, y: "+=" + p.drift.y, z: "+=" + p.drift.z,
        duration: 15, ease: "power2.inOut"
      }, 55 + p.dlag);
    });

    /* phase 4 · 85–100 — sensor fills frame, hold a beat, cross-fade out */
    tl.to(stage, { opacity: 0, duration: 8, ease: "none" }, 91);
    tl.to({}, { duration: 1 }, 99); /* keeps timeline length at 100 */

    window.__introTl = tl; /* handle for QA tooling */

    /* ---------- mouse parallax (desktop only by mode) ---------- */
    var mx = 0, my = 0;
    window.addEventListener("mousemove", function (e) {
      mx = (e.clientX / window.innerWidth) * 2 - 1;
      my = (e.clientY / window.innerHeight) * 2 - 1;
    }, { passive: true });

    /* ---------- render loop (paused when intro is off-screen) ---------- */
    var running = true;
    new IntersectionObserver(function (entries) {
      running = entries[0].isIntersecting;
    }).observe(scroller);

    var pv = new THREE.Vector3();
    function updateLabels() {
      var w = stage.clientWidth, h = stage.clientHeight;
      LABELS.forEach(function (l) {
        pv.setFromMatrixPosition(l.anchor.matrixWorld).project(cam3);
        if (pv.z > 1) { l.el.style.visibility = "hidden"; return; }
        l.el.style.visibility = "visible";
        l.el.style.transform = "translate(" + ((pv.x * 0.5 + 0.5) * w).toFixed(1) +
          "px, " + ((-pv.y * 0.5 + 0.5) * h).toFixed(1) + "px)";
      });
    }

    function frame(t) {
      requestAnimationFrame(frame);
      if (!running) return;
      var sec = t * 0.001;
      /* gentle idle wobble, damped to zero by the time the dolly starts */
      var amp = 1 - Math.min(1, tl.progress() / 0.5);
      float_.rotation.z = Math.sin(sec * 0.6) * 0.012 * amp;
      float_.position.y = Math.sin(sec * 0.8) * 0.05 * amp;
      /* mouse tilt, a few degrees, layered on top of the scrub */
      parallax.rotation.y += ((mx * 0.07) - parallax.rotation.y) * 0.05;
      parallax.rotation.x += ((my * 0.045) - parallax.rotation.x) * 0.05;
      cam3.lookAt(0, 0, 0.2);
      updateLabels();
      renderer.render(scene, cam3);
    }
    requestAnimationFrame(frame);

    window.addEventListener("resize", function () {
      renderer.setSize(stage.clientWidth, stage.clientHeight);
      cam3.aspect = stage.clientWidth / stage.clientHeight;
      cam3.updateProjectionMatrix();
    });

    /* ====================================================================
       textures
       ==================================================================== */

    /* sensor face: linen plate, charcoal circuit traces, etched wordmark */
    function makeSensorTexture() {
      var c = document.createElement("canvas");
      c.width = 1024; c.height = 640;
      var ctx = c.getContext("2d");
      var tex = new THREE.CanvasTexture(c);
      tex.anisotropy = 4;

      var seed = 7;
      function rnd() { seed = (seed * 16807) % 2147483647; return seed / 2147483647; }

      function draw() {
        ctx.clearRect(0, 0, 1024, 640);
        ctx.fillStyle = "#e9e2d1";
        ctx.fillRect(0, 0, 1024, 640);
        /* frame inset */
        ctx.strokeStyle = "rgba(33,30,25,0.25)";
        ctx.lineWidth = 3;
        ctx.strokeRect(26, 26, 972, 588);

        /* circuit traces: orthogonal walks from the edges, pads at the end */
        var keep = { x: 200, y: 220, w: 624, h: 200 }; /* wordmark keep-out */
        function inKeep(x, y) {
          return x > keep.x && x < keep.x + keep.w && y > keep.y && y < keep.y + keep.h;
        }
        ctx.lineWidth = 3;
        ctx.lineCap = "round";
        ctx.strokeStyle = "rgba(33,30,25,0.16)";
        for (var i = 0; i < 30; i++) {
          var edge = Math.floor(rnd() * 4);
          var x = edge === 0 ? 40 : edge === 1 ? 984 : 80 + rnd() * 860;
          var y = edge === 2 ? 50 : edge === 3 ? 590 : 70 + rnd() * 500;
          var horiz = edge < 2;
          ctx.beginPath();
          ctx.moveTo(x, y);
          var steps = 2 + Math.floor(rnd() * 3);
          for (var s = 0; s < steps; s++) {
            var len = 40 + rnd() * 130;
            var nx = x, ny = y;
            if (horiz) nx += (x < 512 ? 1 : -1) * len;
            else ny += (y < 320 ? 1 : -1) * len;
            if (inKeep(nx, ny) || nx < 40 || nx > 984 || ny < 46 || ny > 594) break;
            ctx.lineTo(nx, ny);
            x = nx; y = ny; horiz = !horiz;
          }
          ctx.stroke();
          ctx.fillStyle = "rgba(33,30,25,0.22)";
          ctx.beginPath();
          ctx.arc(x, y, 6, 0, Math.PI * 2);
          ctx.fill();
        }

        /* etched wordmark */
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        try { ctx.letterSpacing = "8px"; } catch (e) { /* older browsers */ }
        ctx.fillStyle = "rgba(255,252,244,0.8)";
        ctx.font = "600 96px Archivo, 'Helvetica Neue', sans-serif";
        ctx.fillText("IN KIND", 514, 288); /* highlight pass = etched feel */
        ctx.fillStyle = "#211e19";
        ctx.fillText("IN KIND", 512, 285);
        try { ctx.letterSpacing = "22px"; } catch (e) { }
        ctx.font = "500 36px Archivo, 'Helvetica Neue', sans-serif";
        ctx.fillStyle = "rgba(33,30,25,0.85)";
        ctx.fillText("STUDIOS", 522, 376);
        tex.needsUpdate = true;
      }

      draw();
      if (document.fonts && document.fonts.load) {
        Promise.all([
          document.fonts.load('600 96px "Archivo"'),
          document.fonts.load('500 36px "Archivo"')
        ]).then(draw).catch(function () { });
      }
      return tex;
    }

    /* soft radial contact shadow */
    function makeShadowTexture() {
      var c = document.createElement("canvas");
      c.width = c.height = 256;
      var ctx = c.getContext("2d");
      var g = ctx.createRadialGradient(128, 128, 10, 128, 128, 128);
      g.addColorStop(0, "rgba(33,30,25,0.55)");
      g.addColorStop(0.55, "rgba(33,30,25,0.18)");
      g.addColorStop(1, "rgba(33,30,25,0)");
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, 256, 256);
      return new THREE.CanvasTexture(c);
    }
  }
})();
