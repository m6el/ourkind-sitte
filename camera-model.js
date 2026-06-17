/* ==========================================================================
   IN KIND STUDIOS — procedural film camera model
   A generic pro 35mm-style SLR body + telephoto lens, built entirely from
   three.js primitives as SEPARATE parts so the intro can explode/reassemble.
   Exposes window.buildInKindCamera(THREE, accentHex) -> { parts, mats, refs }
   Every part record: { obj, home:Vector3, out:Vector3 (explode offset), lag,
   spinZ? } — positions are in camera-model local space, lens axis = +Z.
   ========================================================================== */

window.buildInKindCamera = function (THREE, ACCENT) {
  "use strict";

  /* ---------- procedural imperfection maps (no image files) ---------- */
  function noiseCanvas(size, base, vari, blotches) {
    var c = document.createElement("canvas");
    c.width = c.height = size;
    var ctx = c.getContext("2d");
    ctx.fillStyle = "rgb(" + base + "," + base + "," + base + ")";
    ctx.fillRect(0, 0, size, size);
    /* low-frequency blotches: uneven satin sheen */
    for (var i = 0; i < blotches; i++) {
      var v = Math.round(base + (Math.random() * 2 - 1) * vari);
      ctx.fillStyle = "rgba(" + v + "," + v + "," + v + ",0.16)";
      ctx.beginPath();
      ctx.arc(Math.random() * size, Math.random() * size, 8 + Math.random() * 42, 0, 6.2832);
      ctx.fill();
    }
    /* fine grain */
    var img = ctx.getImageData(0, 0, size, size), d = img.data;
    for (var p = 0; p < d.length; p += 4) {
      var n = (Math.random() * 2 - 1) * vari * 0.55;
      d[p] += n; d[p + 1] += n; d[p + 2] += n;
    }
    ctx.putImageData(img, 0, 0);
    return c;
  }

  var roughTex = new THREE.CanvasTexture(noiseCanvas(256, 212, 26, 46));
  roughTex.wrapS = roughTex.wrapT = THREE.RepeatWrapping;
  roughTex.repeat.set(2, 2);

  var rubberBump = new THREE.CanvasTexture(noiseCanvas(128, 128, 64, 0));
  rubberBump.wrapS = rubberBump.wrapT = THREE.RepeatWrapping;
  rubberBump.repeat.set(4, 4);

  /* ---------- materials (all MeshPhysicalMaterial, dark-field studio PBR) ---------- */
  var mats = {
    body: new THREE.MeshPhysicalMaterial({ color: 0x0d0d0d, roughness: 0.5, roughnessMap: roughTex, metalness: 0.12, clearcoat: 0.3, clearcoatRoughness: 0.32 }),
    rubber: new THREE.MeshPhysicalMaterial({ color: 0x101010, roughness: 0.85, metalness: 0.05, bumpMap: rubberBump, bumpScale: 0.0035 }),
    ring: new THREE.MeshPhysicalMaterial({ color: 0x0e0e0e, roughness: 0.45, roughnessMap: roughTex, metalness: 0.2, clearcoat: 0.25, clearcoatRoughness: 0.25 }),
    metal: new THREE.MeshPhysicalMaterial({ color: 0xc9c9c9, roughness: 0.25, metalness: 1.0 }),
    metalDark: new THREE.MeshPhysicalMaterial({ color: 0x4f4f4f, roughness: 0.3, metalness: 1.0 }),
    dark: new THREE.MeshPhysicalMaterial({ color: 0x070707, roughness: 0.6, metalness: 0.1 }),
    accent: new THREE.MeshPhysicalMaterial({ color: ACCENT, roughness: 0.3, metalness: 0.0, clearcoat: 0.7, clearcoatRoughness: 0.15 }),
    white: new THREE.MeshPhysicalMaterial({ color: 0xdedacf, roughness: 0.5, metalness: 0.0 }),
    coatA: new THREE.MeshPhysicalMaterial({ color: 0x241032, roughness: 0.08, metalness: 0, clearcoat: 1.0, clearcoatRoughness: 0.08 }),
    coatB: new THREE.MeshPhysicalMaterial({ color: 0x0e2a1c, roughness: 0.08, metalness: 0, clearcoat: 1.0, clearcoatRoughness: 0.08 }),
    glass: new THREE.MeshPhysicalMaterial({
      color: 0xe9eeff, roughness: 0.07, metalness: 0, transmission: 1.0, ior: 1.5,
      thickness: 0.35, specularIntensity: 1.0,
      iridescence: 0.4, iridescenceIOR: 1.32, iridescenceThicknessRange: [120, 480]
    }),
    innerGlass: new THREE.MeshPhysicalMaterial({ color: 0x0d0b1a, roughness: 0.08, metalness: 0, clearcoat: 1.0, clearcoatRoughness: 0.08 }),
    lcd: new THREE.MeshPhysicalMaterial({ color: 0x0e0e0e, roughness: 0.1, metalness: 0, clearcoat: 0.8, emissive: 0xf5f0e4, emissiveIntensity: 0 }),
    screw: new THREE.MeshPhysicalMaterial({ color: 0xb8b8b8, roughness: 0.25, metalness: 1.0 })
  };

  /* fine white tick marks: axial dashes standing just proud of a barrel */
  function tickRing(parent, r, zOff, count, every4Longer) {
    var short_ = new THREE.BoxGeometry(0.012, 0.012, 0.045);
    var long_ = new THREE.BoxGeometry(0.012, 0.012, 0.075);
    for (var i = 0; i < count; i++) {
      var a = (i / count) * Math.PI * 2;
      var tick = new THREE.Mesh(every4Longer && i % 4 === 0 ? long_ : short_, mats.white);
      tick.position.set(Math.cos(a) * (r + 0.004), Math.sin(a) * (r + 0.004), zOff);
      tick.rotation.z = a;
      parent.add(tick);
    }
  }

  var V3 = function (x, y, z) { return new THREE.Vector3(x, y, z); };
  var parts = [];
  var refs = {};

  function addPart(obj, home, out, lag, opts) {
    obj.position.copy(home);
    var p = { obj: obj, home: home, out: out, lag: lag };
    if (opts && opts.spinZ) p.spinZ = opts.spinZ;
    parts.push(p);
    return obj;
  }

  /* ---------- geometry helpers ---------- */
  function roundedBox(w, h, d, r) {
    var x = -w / 2, y = -h / 2;
    var s = new THREE.Shape();
    s.moveTo(x + r, y);
    s.lineTo(x + w - r, y);
    s.quadraticCurveTo(x + w, y, x + w, y + r);
    s.lineTo(x + w, y + h - r);
    s.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    s.lineTo(x + r, y + h);
    s.quadraticCurveTo(x, y + h, x, y + h - r);
    s.lineTo(x, y + r);
    s.quadraticCurveTo(x, y, x + r, y);
    var depth = Math.max(0.04, d - 0.14);
    var geo = new THREE.ExtrudeGeometry(s, {
      depth: depth, bevelEnabled: true, bevelThickness: 0.07,
      bevelSize: 0.07, bevelSegments: 4, curveSegments: 10
    });
    geo.translate(0, 0, -depth / 2);
    return geo;
  }

  function zCyl(rTop, rBottom, h, mat, seg) {
    /* cylinder whose axis runs along +Z (lens axis); rTop = FRONT radius */
    var geo = new THREE.CylinderGeometry(rTop, rBottom, h, seg || 64);
    geo.rotateX(Math.PI / 2);
    return new THREE.Mesh(geo, mat);
  }

  function knurled(r, h, count, mat) {
    /* glossy ring + real knurling bars + engraved concentric face grooves */
    var g = new THREE.Group();
    g.add(zCyl(r, r, h, mat, 64));
    var bar = new THREE.BoxGeometry(0.045, 0.045, h * 0.78);
    for (var i = 0; i < count; i++) {
      var a = (i / count) * Math.PI * 2;
      var m = new THREE.Mesh(bar, mat);
      m.position.set(Math.cos(a) * r, Math.sin(a) * r, 0);
      m.rotation.z = a;
      g.add(m);
    }
    /* fine concentric grooves on the front face */
    [0.55, 0.74].forEach(function (f) {
      var groove = new THREE.Mesh(new THREE.TorusGeometry(r * f, 0.007, 8, 72), mats.dark);
      groove.position.z = h / 2 + 0.002;
      g.add(groove);
    });
    return g;
  }

  /* ======================================================================
     BODY
     ====================================================================== */

  /* main shell */
  var bodyCore = new THREE.Mesh(roundedBox(3.4, 2.2, 1.0, 0.2), mats.body);
  bodyCore.castShadow = true;
  addPart(bodyCore, V3(0, 0, 0.05), V3(0, 0, 0), 2, null);
  refs.bodyCore = bodyCore;

  /* panel-gap groove where the back panel meets the shell */
  var gapTop = new THREE.Mesh(new THREE.BoxGeometry(3.36, 0.022, 0.022), mats.dark);
  gapTop.position.set(0, 1.08, -0.46);
  bodyCore.add(gapTop);
  [-1.69, 1.69].forEach(function (gx) {
    var gapSide = new THREE.Mesh(new THREE.BoxGeometry(0.022, 2.12, 0.022), mats.dark);
    gapSide.position.set(gx, 0, -0.46);
    bodyCore.add(gapSide);
  });

  /* thin inset panel seams on the front */
  [-0.95, 0.95].forEach(function (sx) {
    var seam = new THREE.Mesh(new THREE.BoxGeometry(0.018, 1.7, 0.02), mats.dark);
    seam.position.set(sx, 0, 0.62);
    bodyCore.add(seam.clone());
    seam.position.set(sx, 0, -0.52);
  });

  /* back panel */
  var backPanel = new THREE.Mesh(roundedBox(3.3, 2.1, 0.3, 0.18), mats.body);
  backPanel.castShadow = true;
  addPart(backPanel, V3(0, 0, -0.6), V3(0, 0, -1.5), 6, null); /* lags after the eyepiece so they never phase */

  /* eyepiece: raised rubber surround + dark glass — the finale target */
  var eyepiece = new THREE.Group();
  var surround = new THREE.Mesh(roundedBox(0.95, 0.7, 0.22, 0.14), mats.rubber);
  eyepiece.add(surround);
  var surround2 = new THREE.Mesh(roundedBox(0.7, 0.48, 0.3, 0.1), mats.rubber);
  surround2.position.z = -0.02;
  eyepiece.add(surround2);
  var eyeGlass = new THREE.Mesh(new THREE.PlaneGeometry(0.46, 0.32), mats.innerGlass);
  eyeGlass.rotation.y = Math.PI;
  eyeGlass.position.z = -0.18;
  eyepiece.add(eyeGlass);
  addPart(eyepiece, V3(0, 0.68, -0.86), V3(0, 0, -2.2), 3, null); /* detaches first, leads the back panel out */
  refs.eyepiece = eyepiece;

  /* pentaprism hump (house-profile extrusion) + hot shoe */
  var pp = new THREE.Shape();
  pp.moveTo(-0.62, 0); pp.lineTo(0.62, 0); pp.lineTo(0.62, 0.18);
  pp.lineTo(0.3, 0.56); pp.lineTo(-0.3, 0.56); pp.lineTo(-0.62, 0.18);
  pp.lineTo(-0.62, 0);
  var prismGeo = new THREE.ExtrudeGeometry(pp, {
    depth: 0.8, bevelEnabled: true, bevelThickness: 0.05, bevelSize: 0.05, bevelSegments: 3
  });
  prismGeo.translate(0, 0, -0.4);
  var pentaprism = new THREE.Group();
  var prismMesh = new THREE.Mesh(prismGeo, mats.body);
  prismMesh.castShadow = true;
  pentaprism.add(prismMesh);
  /* hot-shoe plate: base + two rails */
  var shoeBase = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.035, 0.44), mats.metal);
  shoeBase.position.set(0, 0.63, -0.02);
  pentaprism.add(shoeBase);
  [-0.2, 0.2].forEach(function (rx) {
    var rail = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.05, 0.44), mats.metal);
    rail.position.set(rx, 0.67, -0.02);
    pentaprism.add(rail);
  });
  addPart(pentaprism, V3(0, 1.06, 0.02), V3(0, 1.6, 0), 4, null);

  /* right-hand grip, bulged forward, rubber */
  var grip = new THREE.Group();
  var gripMain = new THREE.Mesh(roundedBox(0.72, 2.06, 1.3, 0.3), mats.rubber);
  gripMain.castShadow = true;
  grip.add(gripMain);
  var gripBulge = new THREE.Mesh(roundedBox(0.5, 1.7, 0.6, 0.24), mats.rubber);
  gripBulge.position.set(0.06, -0.1, 0.5);
  grip.add(gripBulge);
  addPart(grip, V3(1.56, 0, 0.16), V3(1.5, 0, 0.3), 3, null);

  /* recessed shutter button on the grip top — accent enamel in a metal well */
  var shutterBtn = new THREE.Group();
  var well = zCyl(0.17, 0.17, 0.07, mats.metalDark, 32);
  well.rotation.x = Math.PI / 2;
  shutterBtn.add(well);
  var btn = new THREE.Mesh(new THREE.CylinderGeometry(0.115, 0.125, 0.09, 32), mats.accent);
  btn.position.y = 0.045;
  shutterBtn.add(btn);
  shutterBtn.rotation.x = 0.28; /* angled toward the shooter's finger */
  addPart(shutterBtn, V3(1.56, 1.07, 0.5), V3(0.4, 1.9, 0.1), 8, null);
  refs.shutterBtn = shutterBtn;

  /* top-deck LCD: metal bezel + dark glass with a faint cream glow */
  var lcd = new THREE.Group();
  var bezel = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.07, 0.56), mats.metalDark);
  lcd.add(bezel);
  var lcdGlass = new THREE.Mesh(new THREE.BoxGeometry(0.68, 0.025, 0.44), mats.lcd);
  lcdGlass.position.y = 0.035;
  lcd.add(lcdGlass);
  addPart(lcd, V3(0.78, 1.12, -0.12), V3(0.2, 1.0, 0), 6, null);

  /* knurled mode dial, metal cap edge */
  var modeDial = new THREE.Group();
  var dialBody = knurled(0.34, 0.2, 30, mats.ring);
  dialBody.rotation.x = Math.PI / 2;
  modeDial.add(dialBody);
  var dialCap = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.045, 48), mats.metal);
  dialCap.position.y = 0.11;
  modeDial.add(dialCap);
  var dialMark = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.02, 0.12), mats.dark);
  dialMark.position.set(0, 0.135, 0.18);
  modeDial.add(dialMark);
  addPart(modeDial, V3(-1.18, 1.16, -0.06), V3(-0.25, 1.25, 0), 5, null);

  /* small wind-on lever next to the dial */
  var lever = new THREE.Group();
  var pivot = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.09, 32), mats.metalDark);
  lever.add(pivot);
  var arm = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.035, 0.1), mats.body);
  arm.position.set(0.2, 0.03, 0.06);
  arm.rotation.y = -0.45;
  lever.add(arm);
  addPart(lever, V3(-0.52, 1.14, -0.18), V3(0.1, 0.9, 0), 7, null);

  /* strap lugs at both ends */
  [-1.0, 1.0].forEach(function (side, i) {
    var lug = new THREE.Group();
    var ring = new THREE.Mesh(new THREE.TorusGeometry(0.09, 0.035, 16, 32), mats.metal);
    ring.rotation.y = Math.PI / 2;
    lug.add(ring);
    addPart(lug, V3(side * 1.74, 0.55, 0.05), V3(side * 0.9, 0.25, 0), 6 + i, null);
  });

  /* base plate + tripod screw */
  var basePlate = new THREE.Group();
  var plate = new THREE.Mesh(roundedBox(3.34, 0.16, 1.02, 0.07), mats.metalDark);
  plate.rotation.x = 0; /* extrusion faces +Z; flip flat */
  /* re-orient: build flat box instead for the plate */
  basePlate.remove(plate);
  var plateFlat = new THREE.Mesh(new THREE.BoxGeometry(3.3, 0.14, 1.0), mats.metalDark);
  basePlate.add(plateFlat);
  var tripodRing = new THREE.Mesh(new THREE.TorusGeometry(0.13, 0.03, 16, 40), mats.metal);
  tripodRing.rotation.x = Math.PI / 2;
  tripodRing.position.y = -0.07;
  basePlate.add(tripodRing);
  var tripodSocket = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.03, 32), mats.dark);
  tripodSocket.position.y = -0.07;
  basePlate.add(tripodSocket);
  addPart(basePlate, V3(0, -1.16, 0), V3(0, -1.1, 0), 4, null);

  /* lens mount: metal ring + bayonet notches + dark throat */
  var mount = new THREE.Group();
  var mountRing = zCyl(0.8, 0.8, 0.16, mats.metal, 72);
  mount.add(mountRing);
  var throat = zCyl(0.6, 0.6, 0.18, mats.dark, 48);
  throat.position.z = -0.01;
  mount.add(throat);
  for (var bi = 0; bi < 3; bi++) {
    var ba = bi * (Math.PI * 2 / 3) + 0.5;
    var notch = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.05, 0.05), mats.dark);
    notch.position.set(Math.cos(ba) * 0.69, Math.sin(ba) * 0.69, 0.07);
    notch.rotation.z = ba + Math.PI / 2;
    mount.add(notch);
  }
  addPart(mount, V3(0, -0.05, 0.62), V3(0, 0, 0.7), 4, null); /* same lag as sec1: gap only ever grows */

  /* self-timer light */
  var timer = zCyl(0.055, 0.055, 0.06, mats.accent, 24);
  addPart(timer, V3(1.05, -0.55, 0.62), V3(0.2, -0.3, 0.7), 8, null);

  /* ======================================================================
     TELEPHOTO LENS (axis +Z off the mount)
     ====================================================================== */

  var sec1 = zCyl(0.72, 0.74, 0.5, mats.body, 64);
  sec1.castShadow = true;
  /* panel-gap groove at the barrel junction */
  var sec1Gap = zCyl(0.706, 0.706, 0.024, mats.dark, 64);
  sec1Gap.position.z = 0.24;
  sec1.add(sec1Gap);
  tickRing(sec1, 0.72, -0.16, 18, false); /* aperture-ring tick marks */
  addPart(sec1, V3(0, -0.05, 0.98), V3(0, 0, 1.0), 4, null);

  var ring1 = knurled(0.78, 0.55, 44, mats.ring);
  ring1.children[0].castShadow = true;
  addPart(ring1, V3(0, -0.05, 1.52), V3(0, 0, 1.6), 5, null);
  refs.ring1 = ring1;

  /* mid section with distance-scale window */
  var sec2 = new THREE.Group();
  var sec2Barrel = zCyl(0.68, 0.7, 0.48, mats.body, 64);
  sec2Barrel.castShadow = true;
  sec2.add(sec2Barrel);
  var sec2Gap = zCyl(0.667, 0.667, 0.024, mats.dark, 64);
  sec2Gap.position.z = -0.22;
  sec2.add(sec2Gap);
  var winBezel = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.1, 0.22), mats.metalDark);
  winBezel.position.set(0, 0.65, 0);
  sec2.add(winBezel);
  var winGlass = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.04, 0.16), mats.lcd);
  winGlass.position.set(0, 0.7, 0);
  sec2.add(winGlass);
  tickRing(sec2, 0.68, 0.17, 28, true); /* focus distance-scale marks */
  addPart(sec2, V3(0, -0.05, 2.02), V3(0, 0, 2.2), 6, null);

  var ring2 = knurled(0.8, 0.6, 48, mats.ring);
  ring2.children[0].castShadow = true;
  tickRing(ring2, 0.8, -0.26, 36, false); /* finer second scale row */
  addPart(ring2, V3(0, -0.05, 2.6), V3(0, 0, 2.85), 7, null);

  /* front barrel, slight flare, with accent stripe ring */
  var sec3 = new THREE.Group();
  var sec3Barrel = zCyl(0.75, 0.7, 0.5, mats.body, 64);
  sec3Barrel.castShadow = true;
  sec3.add(sec3Barrel);
  var stripe = zCyl(0.755, 0.755, 0.07, mats.accent, 64);
  stripe.position.z = 0.17;
  sec3.add(stripe);
  /* thin off-white inset ring line */
  var whiteLine = new THREE.Mesh(new THREE.TorusGeometry(0.728, 0.0045, 8, 96), mats.white);
  whiteLine.position.z = -0.08;
  sec3.add(whiteLine);
  addPart(sec3, V3(0, -0.05, 3.12), V3(0, 0, 3.5), 8, null);

  /* tripod collar ring */
  var collar = new THREE.Group();
  var collarRing = new THREE.Mesh(new THREE.TorusGeometry(0.78, 0.055, 20, 72), mats.metalDark);
  collar.add(collarRing);
  addPart(collar, V3(0, -0.05, 1.98), V3(0, -0.55, 1.7), 6, null);

  /* scalloped lens hood: alternating long/short flared petals */
  var hood = new THREE.Group();
  for (var hp = 0; hp < 8; hp++) {
    var long_ = hp % 2 === 0;
    var hLen = long_ ? 0.42 : 0.28;
    var theta = long_ ? 0.95 : 0.72;
    var petalGeo = new THREE.CylinderGeometry(0.92, 0.78, hLen, 24, 1, true,
      hp * (Math.PI / 4) - theta / 2, theta);
    petalGeo.rotateX(Math.PI / 2);
    petalGeo.translate(0, 0, hLen / 2);
    var petal = new THREE.Mesh(petalGeo, new THREE.MeshPhysicalMaterial({
      color: 0x161616, roughness: 0.65, metalness: 0.1, side: THREE.DoubleSide
    }));
    hood.add(petal);
  }
  /* annular base ring — open center so the glass cell nests/passes through */
  var hoodBase = new THREE.Mesh(new THREE.TorusGeometry(0.76, 0.05, 14, 72), mats.body);
  hood.add(hoodBase);
  addPart(hood, V3(0, -0.05, 3.42), V3(0, 0, 4.3), 9, null);

  /* front glass element: curved meniscus (lathe), iridescent coating,
     with a thin recessed dark retaining ring around it */
  var glassFront = new THREE.Group();
  var glassPts = [];
  (function () {
    var R = 0.555, N = 14, t, r;
    for (var gi = 0; gi <= N; gi++) {          /* back face: shallow concave */
      t = gi / N; r = R * t;
      glassPts.push(new THREE.Vector2(r, -0.024 - 0.018 * t * t));
    }
    for (var gj = N; gj >= 0; gj--) {          /* front face: convex bulge */
      t = gj / N; r = R * t;
      glassPts.push(new THREE.Vector2(r, 0.018 + 0.095 * Math.sqrt(Math.max(0, 1 - t * t))));
    }
  })();
  var glassGeo = new THREE.LatheGeometry(glassPts, 64);
  glassGeo.rotateX(Math.PI / 2);
  glassFront.add(new THREE.Mesh(glassGeo, mats.glass));
  var retainer = new THREE.Mesh(new THREE.TorusGeometry(0.585, 0.016, 12, 72), mats.dark);
  retainer.position.z = 0.01;
  glassFront.add(retainer);
  /* dark inner element rides closest behind the meniscus — keeps the glass
     reading near-black; tinted coatings sit deeper for subtle color hints */
  var glassInner = zCyl(0.46, 0.46, 0.04, mats.innerGlass, 64);
  glassInner.position.z = -0.07;
  glassFront.add(glassInner);
  /* lag matches sec3 so the cell can never be overtaken by the barrel */
  addPart(glassFront, V3(0, -0.05, 3.58), V3(0, 0, 3.95), 8, null);
  refs.glassFront = glassFront;

  /* ======================================================================
     SCREWS — 6, slotted, spiral out
     ====================================================================== */
  var screwGeo = new THREE.CylinderGeometry(0.06, 0.06, 0.06, 24);
  screwGeo.rotateX(Math.PI / 2);
  var slotGeo = new THREE.BoxGeometry(0.085, 0.016, 0.025);
  [[-1.5, 0.92, 0.63], [-1.5, -0.92, 0.63], [0.5, 0.92, 0.63], [0.5, -0.92, 0.63],
   [-0.66, -0.75, 0.72], [0.66, 0.65, 0.72]].forEach(function (pos, i) {
    var s = new THREE.Group();
    s.add(new THREE.Mesh(screwGeo, mats.screw));
    var slot = new THREE.Mesh(slotGeo, mats.dark);
    slot.position.z = 0.032;
    slot.rotation.z = i * 0.8;
    s.add(slot);
    var dir = V3(pos[0], pos[1], 0).normalize();
    addPart(s, V3(pos[0], pos[1], pos[2]),
      V3(dir.x * 0.8, dir.y * 0.8, 2.4), i, { spinZ: -Math.PI * 3 });
  });

  /* ======================================================================
     FINE DETAIL PASS — generic pro-SLR controls + optics. Everything here
     is a CHILD of an existing exploding part: explode paths are unchanged
     and nothing can phase through anything new.
     ====================================================================== */
  (function detailPass() {
    function yCyl(r, h, mat, seg) {
      return new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, seg || 24), mat);
    }
    function port(parent, x, y, z) {
      var rimT = new THREE.Mesh(new THREE.TorusGeometry(0.068, 0.022, 10, 28), mats.metalDark);
      rimT.position.set(x, y, z);
      parent.add(rimT);
      var cap = zCyl(0.052, 0.052, 0.035, mats.dark, 20);
      cap.position.set(x, y, z);
      parent.add(cap);
    }
    /* front of body: lens release, DOF preview, two sync ports */
    var rel = zCyl(0.09, 0.09, 0.07, mats.metalDark, 24);
    rel.position.set(-1.0, -0.32, 0.62);
    bodyCore.add(rel);
    var relCap = zCyl(0.058, 0.058, 0.09, mats.dark, 20);
    relCap.position.set(-1.0, -0.32, 0.63);
    bodyCore.add(relCap);
    var dofBtn = zCyl(0.058, 0.058, 0.07, mats.dark, 20);
    dofBtn.position.set(0.97, -0.64, 0.62);
    bodyCore.add(dofBtn);
    port(bodyCore, -1.28, 0.5, 0.62);
    port(bodyCore, -1.28, 0.16, 0.62);
    /* side terminal cover — slightly raised rubber door */
    var door = new THREE.Mesh(roundedBox(0.16, 0.9, 0.5, 0.07), mats.rubber);
    door.rotation.y = Math.PI / 2;
    door.position.set(-1.72, 0.0, 0.1);
    bodyCore.add(door);

    /* pentaprism: brow overhang + dark emitter window */
    var brow = new THREE.Mesh(new THREE.BoxGeometry(0.95, 0.07, 0.24), mats.body);
    brow.position.set(0, 0.4, 0.42);
    pentaprism.add(brow);
    var emitter = zCyl(0.05, 0.05, 0.03, mats.coatA, 16);
    emitter.position.set(0, 0.22, 0.45);
    pentaprism.add(emitter);

    /* grip: front sub-command wheel, half recessed */
    var subWheel = new THREE.Group();
    var wheelGeo = new THREE.CylinderGeometry(0.16, 0.16, 0.09, 28);
    wheelGeo.rotateZ(Math.PI / 2);
    subWheel.add(new THREE.Mesh(wheelGeo, mats.ring));
    for (var wi = 0; wi < 10; wi++) {
      var wa = (wi / 10) * Math.PI * 2;
      var notch = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.03, 0.03), mats.dark);
      notch.position.set(0, Math.cos(wa) * 0.155, Math.sin(wa) * 0.155);
      notch.rotation.x = wa;
      subWheel.add(notch);
    }
    subWheel.position.set(-0.05, 0.92, 0.52);
    grip.add(subWheel);

    /* top deck: paired buttons beside the LCD */
    [[-0.56, 0.06], [-0.34, 0.2]].forEach(function (bp) {
      var bRim = yCyl(0.075, 0.03, mats.metalDark, 20);
      bRim.position.set(bp[0], 0.025, bp[1]);
      lcd.add(bRim);
      var bCap = yCyl(0.055, 0.05, mats.dark, 20);
      bCap.position.set(bp[0], 0.045, bp[1]);
      lcd.add(bCap);
    });

    /* mode dial: stacked second tier + lock pin */
    var tier = knurled(0.24, 0.08, 18, mats.ring);
    tier.rotation.x = Math.PI / 2;
    tier.position.y = 0.16;
    modeDial.add(tier);
    var lockPin = yCyl(0.04, 0.05, mats.metal, 14);
    lockPin.position.set(0.27, 0.08, 0.12);
    modeDial.add(lockPin);

    /* back panel: button column + rubber thumb ridge (visible on the dolly) */
    [0.55, 0.28, 0.01, -0.26].forEach(function (by) {
      var rim2 = zCyl(0.075, 0.075, 0.025, mats.metalDark, 18);
      rim2.position.set(-1.32, by, -0.21);
      backPanel.add(rim2);
      var cap2 = zCyl(0.055, 0.055, 0.05, mats.dark, 18);
      cap2.position.set(-1.32, by, -0.225);
      backPanel.add(cap2);
    });
    var thumb = new THREE.Mesh(roundedBox(0.55, 0.16, 0.1, 0.06), mats.rubber);
    thumb.position.set(1.05, 0.55, -0.22);
    backPanel.add(thumb);

    /* base plate: door seam + two service screws */
    var seam = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.02, 0.02), mats.dark);
    seam.position.set(-0.55, -0.078, 0.22);
    basePlate.add(seam);
    [-1.3, 1.3].forEach(function (sx) {
      var svc = yCyl(0.045, 0.02, mats.metalDark, 14);
      svc.position.set(sx, -0.075, 0.28);
      basePlate.add(svc);
    });

    /* lens optics: silver trim RING (torus — not a disc!), tinted coatings, iris, rear element */
    var trim = new THREE.Mesh(new THREE.TorusGeometry(0.6, 0.038, 14, 80), mats.metal);
    trim.position.z = 0.045;
    glassFront.add(trim);
    var coatA = zCyl(0.42, 0.42, 0.04, mats.coatA, 48);
    coatA.position.z = -0.13;
    glassFront.add(coatA);
    var coatB = zCyl(0.32, 0.32, 0.04, mats.coatB, 48);
    coatB.position.z = -0.18;
    glassFront.add(coatB);
    var irisGeo = new THREE.CylinderGeometry(0.36, 0.36, 0.03, 8);
    irisGeo.rotateX(Math.PI / 2);
    var iris = new THREE.Mesh(irisGeo, mats.dark);
    iris.position.z = 0.02;
    sec2.add(iris);
    var rear = zCyl(0.5, 0.5, 0.05, mats.coatA, 48);
    rear.position.z = -0.19;
    sec1.add(rear);
    /* white index dot on the front barrel */
    var idx = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.05, 0.05), mats.white);
    idx.position.set(0, 0.74, -0.18);
    sec3.add(idx);
  })();

  return { parts: parts, mats: mats, refs: refs };
};
