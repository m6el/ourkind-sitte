/* ==========================================================================
   IN KIND STUDIOS — 3D scroll-driven opening sequence (v3, photoreal)
   Assembled camera → exploded view (pure cinematography, no labels) →
   reassemble + dolly into the eyepiece → HTML viewfinder logo reveal →
   shutter blink → hero. HDRI lighting, DOF/bloom/vignette/CA post chain.
   Runs only when <html> carries .intro-3d; failures degrade gracefully:
   post stack unavailable → plain render; HDRI fails → synthetic softboxes;
   anything fatal → static SVG fallback. three.js + GSAP lazy-loaded.
   ========================================================================== */

(function () {
  "use strict";

  var docEl = document.documentElement;
  if (!docEl.classList.contains("intro-3d")) return;

  var THREE_SRC = "https://unpkg.com/three@0.147.0/build/three.min.js";
  var EX = "https://unpkg.com/three@0.147.0/examples/js/";
  var GSAP_SRC = "https://unpkg.com/gsap@3.12.5/dist/gsap.min.js";
  var ST_SRC = "https://unpkg.com/gsap@3.12.5/dist/ScrollTrigger.min.js";
  var HDRI_URL = "https://dl.polyhaven.org/file/ph-assets/HDRIs/hdr/1k/studio_small_08_1k.hdr";

  function loadScript(src) {
    return new Promise(function (resolve, reject) {
      var s = document.createElement("script");
      s.src = src;
      s.onload = resolve;
      s.onerror = function () { reject(new Error("load failed: " + src)); };
      document.head.appendChild(s);
    });
  }
  function tryLoad(src) { return loadScript(src).catch(function () { }); }

  function toStatic() {
    docEl.classList.remove("intro-3d");
    docEl.classList.add("intro-static");
  }

  loadScript(THREE_SRC)
    .then(function () {
      return Promise.all([loadScript(GSAP_SRC), tryLoad(EX + "loaders/RGBELoader.js")]);
    })
    .then(function () { return loadScript(ST_SRC); })
    .then(function () {
      /* post-processing stack: parse-order matters (Pass.js first), but a
         failure here must never kill the intro — we just skip the composer */
      return Promise.all([
        "postprocessing/Pass.js", "shaders/CopyShader.js",
        "shaders/LuminosityHighPassShader.js", "shaders/BokehShader.js"
      ].map(function (f) { return loadScript(EX + f); }))
        .then(function () {
          return Promise.all([
            "postprocessing/EffectComposer.js", "postprocessing/RenderPass.js",
            "postprocessing/ShaderPass.js", "postprocessing/MaskPass.js",
            "postprocessing/UnrealBloomPass.js", "postprocessing/BokehPass.js"
          ].map(function (f) { return loadScript(EX + f); }));
        })
        .then(function () { return true; })
        .catch(function () { console.warn("[intro3d] post stack unavailable — rendering direct"); return false; });
    })
    .then(function (postOK) {
      try { init(postOK); } catch (err) { console.error("[intro3d]", err); toStatic(); }
    })
    .catch(toStatic);

  /* ---------- final pass: ACES + vignette + edge CA + sRGB ----------
     r147 applies no tone mapping when rendering into a render target, so
     the composer path does ACES here (same Narkowicz fit we invert for the
     backdrop). Direct (no-composer) path keeps renderer-side ACES instead. */
  var FinalShader = {
    uniforms: {
      tDiffuse: { value: null },
      exposure: { value: 1.0 },
      caAmount: { value: 0.0016 },
      vigStrength: { value: 0.27 }
    },
    vertexShader:
      "varying vec2 vUv;" +
      "void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }",
    fragmentShader:
      "uniform sampler2D tDiffuse; uniform float exposure; uniform float caAmount; uniform float vigStrength; varying vec2 vUv;" +
      "vec3 aces(vec3 x){ return clamp((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14), 0.0, 1.0); }" +
      "vec3 lin2srgb(vec3 c){ return mix(c * 12.92, 1.055 * pow(c, vec3(1.0/2.4)) - 0.055, step(vec3(0.0031308), c)); }" +
      "void main(){" +
      "  vec2 d = vUv - 0.5;" +
      "  float r2 = dot(d, d);" +
      "  float ca = caAmount * r2 * r2 * 8.0;" + /* quartic falloff: extreme edges only */
      "  vec2 off = d * ca;" +
      "  float cr = texture2D(tDiffuse, vUv + off).r;" +
      "  float cg = texture2D(tDiffuse, vUv).g;" +
      "  float cb = texture2D(tDiffuse, vUv - off).b;" +
      "  vec3 col = aces(vec3(cr, cg, cb) * exposure);" +
      "  col *= 1.0 - vigStrength * smoothstep(0.25, 0.95, r2 * 2.0);" +
      "  gl_FragColor = vec4(lin2srgb(col), 1.0);" +
      "}"
  };

  /* numeric inverse of the ACES fit above (per channel) */
  function invAces(v) {
    v = Math.min(v, 0.999);
    var A = 2.51 - v * 2.43, B = 0.03 - v * 0.59, C = -v * 0.14;
    return (-B + Math.sqrt(B * B - 4 * A * C)) / (2 * A);
  }
  function srgbToLin(c) {
    return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  }

  /* ====================================================================== */

  function init(postOK) {
    gsap.registerPlugin(ScrollTrigger);

    var stage = document.getElementById("intro-stage");
    var scroller = document.getElementById("intro-scroller");
    var ACCENT = 0xc9824c;

    /* ---------- renderer ---------- */
    var renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, preserveDrawingBuffer: true });
    var PR = Math.min(window.devicePixelRatio || 1, 1.5);
    renderer.setPixelRatio(PR);
    renderer.setSize(stage.clientWidth, stage.clientHeight);
    renderer.outputEncoding = THREE.sRGBEncoding;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.0;
    renderer.physicallyCorrectLights = true;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    stage.insertBefore(renderer.domElement, stage.firstChild);

    var scene = new THREE.Scene();

    /* telephoto perspective: ~100mm-equivalent narrow FOV, flat product look */
    var cam3 = new THREE.PerspectiveCamera(20, stage.clientWidth / stage.clientHeight, 0.08, 120);
    cam3.position.set(0, 0.4, 15);

    /* ---------- spotlit-cyclorama backdrop ----------
       Deep charcoal with a faint radial lift behind the camera. Computed in
       a float shader (no 8-bit banding) with colors pre-compensated through
       the inverse ACES fit in composer mode so output hits the target hex. */
    var bgMat = new THREE.ShaderMaterial({
      uniforms: {
        cCenter: { value: new THREE.Vector3() },
        cEdge: { value: new THREE.Vector3() }
      },
      vertexShader:
        "varying vec2 vUv;" +
        "void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }",
      fragmentShader:
        "varying vec2 vUv; uniform vec3 cCenter; uniform vec3 cEdge;" +
        "void main(){" +
        "  float d = distance(vUv, vec2(0.5, 0.46));" +
        "  float t = smoothstep(0.05, 0.45, d);" +
        "  gl_FragColor = vec4(mix(cCenter, cEdge, t), 1.0);" +
        "}"
    });
    var BG_CENTER = [0x20 / 255, 0x1e / 255, 0x1b / 255]; /* faint warm lift */
    var BG_EDGE = [0x07 / 255, 0x07 / 255, 0x07 / 255];   /* near-black frame edges */
    var fadeMat = null; /* floor fade material, registered below */
    function setBackdropMode(composerMode) {
      function conv(arr) {
        return composerMode
          ? arr.map(function (v) { return invAces(srgbToLin(v)); })
          : arr.slice();
      }
      var c = conv(BG_CENTER), e = conv(BG_EDGE);
      bgMat.uniforms.cCenter.value.set(c[0], c[1], c[2]);
      bgMat.uniforms.cEdge.value.set(e[0], e[1], e[2]);
      if (fadeMat) {
        var f = conv([8 / 255, 8 / 255, 8 / 255]);
        fadeMat.uniforms.cFloor.value.set(f[0], f[1], f[2]);
      }
    }
    setBackdropMode(false);
    var backdrop = new THREE.Mesh(new THREE.PlaneGeometry(52, 30), bgMat);
    backdrop.position.set(0, 0, -40);
    scene.add(backdrop);

    /* ---------- synthetic dark-studio environment (instant; HDRI replaces it) ---------- */
    function buildSyntheticEnv() {
      var env = new THREE.Scene();
      var hull = new THREE.Mesh(
        new THREE.SphereGeometry(30, 16, 16),
        new THREE.MeshBasicMaterial({ color: new THREE.Color(0.015, 0.014, 0.013), side: THREE.BackSide })
      );
      env.add(hull);
      function softbox(w, h, color, intensity, x, y, z) {
        var m = new THREE.Mesh(
          new THREE.PlaneGeometry(w, h),
          new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(intensity), side: THREE.DoubleSide })
        );
        m.position.set(x, y, z);
        m.lookAt(0, 0, 0);
        env.add(m);
      }
      softbox(10, 6, 0xfff2e2, 3.2, 0.5, 8, 2.5);  /* big soft overhead key */
      softbox(6, 1.5, 0xdfe8ff, 2.6, -6, 3, -7);   /* cool rim strip, back-left */
      softbox(6, 1.5, 0xe6edff, 2.2, 6, 3.5, -7);  /* cool rim strip, back-right */
      softbox(6, 3, 0xffe3c8, 0.5, 0, 1, 9);       /* faint warm front fill */
      var pmrem = new THREE.PMREMGenerator(renderer);
      scene.environment = pmrem.fromScene(env, 0.04).texture;
      pmrem.dispose();
    }
    buildSyntheticEnv();

    /* ---------- direct lights: centered dramatic rig (key casts the only shadow) ---------- */
    var key = new THREE.DirectionalLight(0xfff2e2, 0.85);
    key.position.set(0.5, 8, 3.5); /* large soft overhead, slightly forward */
    key.castShadow = true;
    key.shadow.mapSize.set(1024, 1024);
    key.shadow.camera.left = -6; key.shadow.camera.right = 6;
    key.shadow.camera.top = 6; key.shadow.camera.bottom = -6;
    key.shadow.camera.near = 1; key.shadow.camera.far = 25;
    key.shadow.radius = 6;
    key.shadow.bias = -0.0008;
    scene.add(key);
    /* the rims carve the silhouette out of the black — they carry the shape */
    var rimL = new THREE.DirectionalLight(0xdfe8ff, 1.15);
    rimL.position.set(-5, 3, -6);
    scene.add(rimL);
    var rimR = new THREE.DirectionalLight(0xe6edff, 1.0);
    rimR.position.set(5, 3.5, -6);
    scene.add(rimR);
    var fillF = new THREE.DirectionalLight(0xffe3c8, 0.1);
    fillF.position.set(0, 0.5, 9);
    scene.add(fillF);
    var amb = new THREE.AmbientLight(0xe8e2d6, 0.02);
    scene.add(amb);

    /* ---------- scene graph: parallax > spin > float > parts ---------- */
    var parallax = new THREE.Group();
    var spin = new THREE.Group();
    var float_ = new THREE.Group();
    scene.add(parallax);
    parallax.add(spin);
    spin.add(float_);
    spin.rotation.set(0.05, -0.35, 0);

    var model = window.buildInKindCamera(THREE, ACCENT);
    var PARTS = model.parts;
    PARTS.forEach(function (p) { float_.add(p.obj); });

    function setEnvIntensity(scale) {
      /* dark set: metals + glass are the jewelry; satin panels read via highlights */
      var perMat = {
        metal: 0.85, metalDark: 0.7, screw: 0.85, glass: 0.7, lcd: 0.7,
        body: 0.18, rubber: 0.12, ring: 0.25, dark: 0.14, accent: 0.6,
        innerGlass: 0.18, white: 0.32, coatA: 0.7, coatB: 0.7
      };
      Object.keys(model.mats).forEach(function (k) {
        var m = model.mats[k];
        if ("envMapIntensity" in m) m.envMapIntensity = (perMat[k] || 0.5) * scale;
      });
      /* hood petals carry their own material */
      float_.traverse(function (o) {
        if (o.isMesh && o.material && o.material.envMapIntensity === 1 &&
            Object.keys(model.mats).every(function (k) { return model.mats[k] !== o.material; })) {
          o.material.envMapIntensity = 0.22 * scale;
        }
      });
      /* keep reflection clone materials in step */
      refMatCache.forEach(function (m, src) {
        if ("envMapIntensity" in m) m.envMapIntensity = src.envMapIntensity;
      });
    }

    /* ---------- real studio HDRI (reflections/lighting only) ---------- */
    (function loadHDRI() {
      if (!THREE.RGBELoader) return;
      new THREE.RGBELoader().load(HDRI_URL, function (tex) {
        tex.mapping = THREE.EquirectangularReflectionMapping;
        var pmrem = new THREE.PMREMGenerator(renderer);
        scene.environment = pmrem.fromEquirectangular(tex).texture;
        pmrem.dispose();
        tex.dispose();
        window.__hdriLoaded = true;
        setEnvIntensity(1.0);
        /* rebalance the direct rig against the HDRI's contribution */
        key.intensity = 0.62; rimL.intensity = 0.92; rimR.intensity = 0.78;
        fillF.intensity = 0.08; amb.intensity = 0;
      }, undefined, function () {
        console.warn("[intro3d] HDRI unavailable — keeping synthetic studio env");
      });
    })();

    /* shadow-catcher */
    var FLOOR_Y = -1.48;
    var floorMat = new THREE.ShadowMaterial({ opacity: 0.45 });
    var floor = new THREE.Mesh(new THREE.PlaneGeometry(40, 40), floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = FLOOR_Y;
    floor.receiveShadow = true;
    scene.add(floor);

    /* ---------- product-table reflection: mirrored clone, synced per frame ---------- */
    var refMatCache = new Map();
    var mirror = new THREE.Group();
    mirror.scale.y = -1;
    mirror.position.y = FLOOR_Y * 2;
    var refParallax = new THREE.Group();
    var refSpin = new THREE.Group();
    var refFloat = new THREE.Group();
    mirror.add(refParallax);
    refParallax.add(refSpin);
    refSpin.add(refFloat);
    var refParts = PARTS.map(function (p) {
      var c = p.obj.clone(true);
      c.traverse(function (o) {
        o.castShadow = false;
        o.receiveShadow = false;
        if (o.isMesh && o.material) {
          var m = refMatCache.get(o.material);
          if (!m) {
            m = o.material.clone();
            m.transparent = true;
            m.opacity = 0.11;
            m.side = THREE.DoubleSide; /* mirrored winding */
            m.depthWrite = false;
            refMatCache.set(o.material, m);
          }
          o.material = m;
        }
      });
      c.renderOrder = 1;
      refFloat.add(c);
      return c;
    });
    scene.add(mirror);
    setEnvIntensity(1.0);

    /* radial fade so the reflection dies quickly with distance — computed in
       a float shader (an 8-bit texture gradient bands badly at grazing angles) */
    fadeMat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      uniforms: { cFloor: { value: new THREE.Vector3() } },
      vertexShader:
        "varying vec2 vUv;" +
        "void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }",
      fragmentShader:
        "varying vec2 vUv; uniform vec3 cFloor;" +
        "void main(){" +
        "  float d = distance(vUv, vec2(0.5));" +
        "  float a = mix(0.22, 1.0, smoothstep(0.05, 0.42, d));" +
        "  gl_FragColor = vec4(cFloor, a);" +
        "}"
    });
    var fade = new THREE.Mesh(new THREE.PlaneGeometry(60, 60), fadeMat);
    fade.rotation.x = -Math.PI / 2;
    fade.position.y = FLOOR_Y - 0.005;
    fade.renderOrder = 2;
    scene.add(fade);

    /* faint key-light glow cone — one additive quad, effectively free */
    (function () {
      var gc = document.createElement("canvas");
      gc.width = 256; gc.height = 256;
      var gctx = gc.getContext("2d");
      var gg = gctx.createRadialGradient(128, 96, 8, 128, 110, 150);
      gg.addColorStop(0, "rgba(255,242,226,0.55)");
      gg.addColorStop(0.5, "rgba(255,242,226,0.12)");
      gg.addColorStop(1, "rgba(255,242,226,0)");
      gctx.fillStyle = gg;
      gctx.fillRect(0, 0, 256, 256);
      var glow = new THREE.Mesh(
        new THREE.PlaneGeometry(18, 14),
        new THREE.MeshBasicMaterial({
          map: new THREE.CanvasTexture(gc), transparent: true, opacity: 0.028,
          blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false
        })
      );
      glow.position.set(0.5, 5.5, -12);
      scene.add(glow);
    })();

    /* ---------- post-processing chain ---------- */
    var composer = null, bokehPass = null, bloomPass = null, finalPass = null;
    var dof = { focus: 13.6, aperture: 0.00008, maxblur: 0.005 };
    if (postOK) {
      try {
        var w = stage.clientWidth, h = stage.clientHeight;
        /* HalfFloat target keeps HDR highlights alive through the chain */
        var rt = new THREE.WebGLRenderTarget(w * PR, h * PR, { type: THREE.HalfFloatType });
        composer = new THREE.EffectComposer(renderer, rt);
        composer.setPixelRatio(PR);
        composer.setSize(w, h);
        composer.addPass(new THREE.RenderPass(scene, cam3));
        bokehPass = new THREE.BokehPass(scene, cam3, {
          focus: dof.focus, aperture: dof.aperture, maxblur: dof.maxblur, width: w, height: h
        });
        composer.addPass(bokehPass);
        /* threshold above the brightest backdrop values — only true glints bloom */
        bloomPass = new THREE.UnrealBloomPass(new THREE.Vector2(w, h), 0.12, 0.5, 1.6);
        composer.addPass(bloomPass);
        finalPass = new THREE.ShaderPass(FinalShader);
        finalPass.renderToScreen = true;
        composer.addPass(finalPass);
        /* composer path: tone mapping lives in the final pass */
        renderer.toneMapping = THREE.NoToneMapping;
        setBackdropMode(true); /* pre-compensate gradient through inverse ACES */
      } catch (e) {
        console.warn("[intro3d] composer init failed — rendering direct", e);
        composer = null; bokehPass = null; bloomPass = null; finalPass = null;
        renderer.toneMapping = THREE.ACESFilmicToneMapping;
        setBackdropMode(false);
      }
    }

    /* ---------- camera lookAt target (origin → eyepiece during dolly) ---------- */
    var lookTarget = new THREE.Vector3(0, 0, 0);

    /* ---------- the scrubbed master timeline, 0–100 ≙ 350vh ---------- */
    var tl = gsap.timeline({
      defaults: { ease: "power2.inOut" },
      scrollTrigger: {
        trigger: scroller,
        start: "top top",
        end: "bottom bottom",
        scrub: 0.6
      }
    });

    /* phase 1 · 0–15 — assembled hero shot, slow rotation */
    tl.to(spin.rotation, { y: 0.5, x: 0.1, duration: 15, ease: "none" }, 0);
    tl.to("#intro-hint", { opacity: 0, duration: 4, ease: "none" }, 2);

    /* phase 2 · 15–55 — exploded view, pure cinematography */
    PARTS.forEach(function (p, pi) {
      tl.to(p.obj.position, {
        x: p.home.x + p.out.x, y: p.home.y + p.out.y, z: p.home.z + p.out.z,
        duration: 26, ease: "power3.inOut"
      }, 15 + p.lag);
      if (p.spinZ) {
        tl.to(p.obj.rotation, { z: p.spinZ, duration: 26, ease: "power3.inOut" }, 15 + p.lag);
      } else if (p.out.lengthSq() > 0.001) {
        /* slight stagger of rotations so glints ripple across rings + details */
        tl.to(p.obj.rotation, {
          z: pi % 2 ? 0.1 : -0.085, duration: 26, ease: "power3.inOut"
        }, 15 + p.lag);
      }
    });
    tl.to(cam3.position, { z: 22.2, y: 0.9, duration: 28 }, 15);
    tl.to(lookTarget, { z: 1.55, duration: 28 }, 15); /* pan to the spread's center of mass */
    tl.to(dof, { focus: 20.6, aperture: 0.00019, maxblur: 0.009, duration: 28 }, 15);
    tl.to(spin.rotation, { y: 0.55, x: 0.06, duration: 28 }, 15);
    tl.to(floorMat, { opacity: 0.1, duration: 20, ease: "none" }, 17);
    tl.to(model.mats.lcd, { emissiveIntensity: 0.45, duration: 12, ease: "none" }, 28);

    /* phase 3 · 55–75 — reassemble while turning away; dolly to the eyepiece */
    tl.to(model.mats.lcd, { emissiveIntensity: 0, duration: 8, ease: "none" }, 55);
    PARTS.forEach(function (p) {
      tl.to(p.obj.position, {
        x: p.home.x, y: p.home.y, z: p.home.z,
        duration: 14, ease: "power2.inOut"
      }, 55 + p.lag * 0.35);
      if (p.spinZ || p.out.lengthSq() > 0.001) {
        tl.to(p.obj.rotation, { z: 0, duration: 14, ease: "power2.inOut" }, 55 + p.lag * 0.35);
      }
    });
    tl.to(spin.rotation, { y: Math.PI, x: 0, duration: 17 }, 56);
    tl.to(cam3.position, { z: 7.5, y: 0.7, duration: 13 }, 56);
    tl.to(dof, { focus: 6.4, aperture: 0.00008, maxblur: 0.005, duration: 13 }, 56);
    tl.to(lookTarget, { x: 0, y: 0.68, z: 0.95, duration: 12 }, 58);
    tl.to(cam3.position, { z: 2.04, y: 0.71, duration: 9, ease: "power2.in" }, 69);
    /* telephoto close-up: focus rides the eyepiece, falloff goes creamy */
    tl.to(dof, { focus: 1.12, aperture: 0.00048, maxblur: 0.014, duration: 9, ease: "power2.in" }, 69);
    tl.to(floorMat, { opacity: 0, duration: 8, ease: "none" }, 62);
    tl.to(renderer, { toneMappingExposure: 0.18, duration: 9, ease: "none" }, 68);

    /* phase 4 · 74–80 — pass through the eyepiece into near-black */
    tl.to("#intro-vf", { opacity: 1, duration: 5, ease: "none" }, 74);

    /* phase 5 · 80–95 — inside the viewfinder (crisp HTML overlay) */
    tl.fromTo(".vf__frame, .vf__readout",
      { opacity: 0 }, { opacity: 1, duration: 4, ease: "none" }, 80);
    tl.fromTo("#vf-brackets",
      { opacity: 0, scale: 1.65 },
      { opacity: 1, scale: 1, duration: 8, ease: "power3.out" }, 80.5);
    tl.fromTo("#vf-wordmark",
      { opacity: 0, filter: "blur(16px)" },
      { opacity: 1, filter: "blur(0px)", duration: 6, ease: "power3.out" }, 84);
    tl.fromTo("#vf-rec", { opacity: 0 }, { opacity: 1, duration: 1.2, ease: "none" }, 90);
    tl.to("#vf-rec", { opacity: 0, duration: 1.2, ease: "none" }, 92.5);

    /* phase 6 · 95–100 — shutter blink, content clears, unpin into the hero */
    tl.to(".vf__frame, .vf__readout, #vf-brackets, #vf-wordmark",
      { opacity: 0, duration: 2, ease: "none" }, 95);
    tl.fromTo("#vf-blade-top", { yPercent: -101 }, { yPercent: 0, duration: 2.4, ease: "power2.in" }, 95);
    tl.fromTo("#vf-blade-bottom", { yPercent: 101 }, { yPercent: 0, duration: 2.4, ease: "power2.in" }, 95);
    tl.to("#vf-blade-top", { yPercent: -101, duration: 2.4, ease: "power2.out" }, 97.6);
    tl.to("#vf-blade-bottom", { yPercent: 101, duration: 2.4, ease: "power2.out" }, 97.6);
    tl.to({}, { duration: 0.01 }, 99.99);

    window.__introTl = tl; /* QA handle */
    window.__introDebug = { spin: spin, cam3: cam3, renderer: renderer, parts: PARTS, composer: composer, dof: dof };

    setupHeroEntrance();

    /* ---------- mouse parallax (desktop only by mode) ---------- */
    var mx = 0, my = 0;
    window.addEventListener("mousemove", function (e) {
      mx = (e.clientX / window.innerWidth) * 2 - 1;
      my = (e.clientY / window.innerHeight) * 2 - 1;
    }, { passive: true });

    /* ---------- render loop with staged FPS watchdog ---------- */
    var running = true;
    new IntersectionObserver(function (entries) {
      running = entries[0].isIntersecting;
    }).observe(scroller);

    /* degrade order (never the HDRI): CA off → DOF off → bloom off */
    var degradeStep = 0;
    function degrade() {
      degradeStep++;
      if (degradeStep === 1 && finalPass) finalPass.uniforms.caAmount.value = 0;
      else if (degradeStep === 2 && bokehPass) bokehPass.enabled = false;
      else if (degradeStep === 3 && bloomPass) bloomPass.enabled = false;
      console.info("[intro3d] perf degrade step " + degradeStep);
    }
    var fpsFrames = 0, fpsAccum = 0, watchUntil = performance.now() + 12000;
    function watchFps(dt, now) {
      if (degradeStep >= 3 || now > watchUntil || !composer) return;
      fpsAccum += dt; fpsFrames++;
      if (fpsFrames >= 60) {
        if (fpsAccum / fpsFrames > 20) degrade(); /* < ~50fps sustained */
        fpsFrames = 0; fpsAccum = 0;
      }
    }

    var lastT = performance.now();
    function frame(t) {
      requestAnimationFrame(frame);
      if (!running) { lastT = t; return; }
      var dt = t - lastT; lastT = t;
      watchFps(dt, t);
      var sec = t * 0.001;
      var amp = 1 - Math.min(1, tl.progress() / 0.5);
      float_.rotation.z = Math.sin(sec * 0.6) * 0.01 * amp;
      float_.position.y = Math.sin(sec * 0.8) * 0.045 * amp;
      var tiltAmp = 1 - Math.min(1, Math.max(0, (tl.progress() - 0.6) / 0.12));
      parallax.rotation.y += ((mx * 0.06 * tiltAmp) - parallax.rotation.y) * 0.05;
      parallax.rotation.x += ((my * 0.04 * tiltAmp) - parallax.rotation.x) * 0.05;
      cam3.lookAt(lookTarget);
      /* sync the floor reflection to the live hierarchy */
      refParallax.rotation.copy(parallax.rotation);
      refSpin.rotation.copy(spin.rotation);
      refFloat.rotation.copy(float_.rotation);
      refFloat.position.copy(float_.position);
      for (var ri = 0; ri < PARTS.length; ri++) {
        refParts[ri].position.copy(PARTS[ri].obj.position);
        refParts[ri].rotation.copy(PARTS[ri].obj.rotation);
      }
      if (composer) {
        if (bokehPass && bokehPass.enabled) {
          bokehPass.uniforms.focus.value = dof.focus;
          bokehPass.uniforms.aperture.value = dof.aperture;
          bokehPass.uniforms.maxblur.value = dof.maxblur;
        }
        finalPass.uniforms.exposure.value = renderer.toneMappingExposure;
        composer.render();
      } else {
        renderer.render(scene, cam3);
      }
    }
    requestAnimationFrame(frame);

    window.addEventListener("resize", function () {
      var w = stage.clientWidth, h = stage.clientHeight;
      renderer.setSize(w, h);
      cam3.aspect = w / h;
      cam3.updateProjectionMatrix();
      if (composer) composer.setSize(w, h);
    });
  }

  /* ======================================================================
     HERO ENTRANCE — showreel fades up from black, headline rises word by
     word behind overflow masks, nav + CTA last.
     ====================================================================== */

  function setupHeroEntrance() {
    var h1 = document.querySelector(".hero__headline");
    if (!h1 || h1.dataset.split) return;
    h1.dataset.split = "1";

    var words = [];
    Array.prototype.slice.call(h1.childNodes).forEach(function (n) {
      if (n.nodeType === 3) {
        n.textContent.split(/\s+/).forEach(function (w) { if (w) words.push(w); });
      } else if (n.nodeType === 1) {
        words.push(n.outerHTML);
      }
    });
    h1.innerHTML = words.map(function (w) {
      return '<span class="hw"><span class="hw__i">' + w + "</span></span>";
    }).join(" ");

    var cover = document.createElement("div");
    cover.className = "hero__cover";
    document.querySelector(".hero__media").appendChild(cover);

    var heroTl = gsap.timeline({ paused: true, defaults: { ease: "power3.out" } });
    window.__heroTl = heroTl; /* QA handle */
    heroTl.to(cover, { opacity: 0, duration: 1.5, ease: "power2.inOut" }, 0)
      .fromTo(".hw__i", { yPercent: 115 }, { yPercent: 0, duration: 0.9, stagger: 0.05 }, 0.25)
      .fromTo(".hero .site-header", { opacity: 0 }, { opacity: 1, duration: 0.8, ease: "power2.out" }, 1.0)
      .fromTo(".hero__foot", { opacity: 0, y: 24 }, { opacity: 1, y: 0, duration: 0.8 }, 1.1);

    ScrollTrigger.create({
      trigger: "#hero",
      start: "top 70%",
      onEnter: function () { heroTl.play(); },
      onLeaveBack: function () { heroTl.reverse(); }
    });
  }
})();
