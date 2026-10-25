// Procedural 3D locations and item meshes for Cash Quest.
import * as THREE from 'three';

function mulberry32(seed) {
  return function () {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const matCache = new Map();
function mat(color, opts = {}) {
  const key = color + JSON.stringify(opts);
  if (!matCache.has(key)) matCache.set(key, new THREE.MeshStandardMaterial({ color, roughness: 0.85, ...opts }));
  return matCache.get(key);
}

function canvasTexture(size, draw, repeat = 1) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  draw(c.getContext('2d'), size);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeat, repeat);
  t.anisotropy = 8;
  return t;
}

function noiseFill(ctx, s, base, spread, count, rnd, sizeMax = 3) {
  ctx.fillStyle = base; ctx.fillRect(0, 0, s, s);
  for (let i = 0; i < count; i++) {
    const v = (rnd() - 0.5) * spread;
    ctx.fillStyle = `rgba(${v > 0 ? 255 : 0},${v > 0 ? 255 : 0},${v > 0 ? 255 : 0},${Math.abs(v)})`;
    const r = 1 + rnd() * sizeMax;
    ctx.fillRect(rnd() * s, rnd() * s, r, r);
  }
}

function groundTexture(type, rnd) {
  switch (type) {
    case 'dirt': return canvasTexture(256, (g, s) => {
      noiseFill(g, s, '#6e5338', 0.25, 4000, rnd, 4);
      for (let i = 0; i < 40; i++) { g.fillStyle = 'rgba(60,40,25,.35)'; g.beginPath(); g.arc(rnd() * s, rnd() * s, 4 + rnd() * 14, 0, 7); g.fill(); }
    }, 24);
    case 'sand': return canvasTexture(256, (g, s) => noiseFill(g, s, '#e8d29a', 0.18, 6000, rnd, 2), 30);
    case 'asphalt': return canvasTexture(256, (g, s) => noiseFill(g, s, '#3a3b40', 0.2, 6000, rnd, 2), 30);
    case 'concrete': return canvasTexture(256, (g, s) => {
      noiseFill(g, s, '#5c5c58', 0.15, 3000, rnd, 3);
      g.strokeStyle = 'rgba(0,0,0,.35)'; g.lineWidth = 2; g.strokeRect(0, 0, s, s);
      for (let i = 0; i < 6; i++) { g.fillStyle = 'rgba(30,25,20,.25)'; g.beginPath(); g.arc(rnd() * s, rnd() * s, 10 + rnd() * 30, 0, 7); g.fill(); }
    }, 18);
    case 'marble': return canvasTexture(256, (g, s) => {
      const h = s / 2;
      for (let y = 0; y < 2; y++) for (let x = 0; x < 2; x++) {
        g.fillStyle = (x + y) % 2 ? '#d9d4cc' : '#2b2a30'; g.fillRect(x * h, y * h, h, h);
      }
      g.strokeStyle = 'rgba(255,255,255,.12)';
      for (let i = 0; i < 30; i++) { g.beginPath(); g.moveTo(rnd() * s, rnd() * s); g.bezierCurveTo(rnd() * s, rnd() * s, rnd() * s, rnd() * s, rnd() * s, rnd() * s); g.stroke(); }
    }, 80);
  }
}

function textTexture(lines, w, h, bg, fg) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const g = c.getContext('2d');
  g.fillStyle = bg; g.fillRect(0, 0, w, h);
  g.fillStyle = fg; g.textAlign = 'center'; g.textBaseline = 'middle';
  lines.forEach((ln, i) => {
    g.font = ln.font; g.fillText(ln.text, w / 2, h * (i + 1) / (lines.length + 1));
  });
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

// ---------- World builder ----------

export function buildWorld(id, loc) {
  const rnd = mulberry32(id.length * 7919 + loc.size);
  const group = new THREE.Group();
  const colliders = [];
  const animated = [];
  const half = loc.size;
  const bounds = { minX: -half + 1, maxX: half - 1, minZ: -half + 1, maxZ: half - 1 };

  const addBox = (w, h, d, color, x, y, z, { collide = true, rotY = 0, parent = group, material } = {}) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material || mat(color));
    m.position.set(x, y + h / 2, z); m.rotation.y = rotY; parent.add(m);
    if (collide) {
      const swap = Math.abs(Math.sin(rotY)) > 0.7;
      const hw = (swap ? d : w) / 2, hd = (swap ? w : d) / 2;
      colliders.push({ minX: x - hw, maxX: x + hw, minZ: z - hd, maxZ: z + hd });
    }
    return m;
  };
  const addCyl = (rt, rb, h, color, x, y, z, { collide = true, seg = 12, material } = {}) => {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), material || mat(color));
    m.position.set(x, y + h / 2, z); group.add(m);
    if (collide) { const r = Math.max(rt, rb); colliders.push({ minX: x - r, maxX: x + r, minZ: z - r, maxZ: z + r }); }
    return m;
  };
  const clearOfSpawn = (x, z, r = 12) => Math.hypot(x, z) > r;

  // Ground
  const groundMat = new THREE.MeshStandardMaterial({ map: groundTexture(loc.ground, rnd), roughness: loc.ground === 'marble' ? 0.35 : 0.95 });
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(half * 2 + 200, half * 2 + 200), groundMat);
  ground.rotation.x = -Math.PI / 2; group.add(ground);

  const scene = { background: new THREE.Color(loc.sky), fog: new THREE.Fog(...loc.fog) };

  // Sell station
  const station = new THREE.Group();
  station.position.set(0, 0, -6);
  group.add(station);
  const stx = 0, stz = -6;
  addBox(5, 1.1, 1.4, '#2f7d3a', stx, 0, stz + 0.6, {});
  addBox(5.4, 0.15, 1.8, '#f5d36b', stx, 1.1, stz + 0.6, { collide: false });
  addBox(0.25, 3.4, 0.25, '#e9e2cf', stx - 2.5, 0, stz - 0.3, { collide: false });
  addBox(0.25, 3.4, 0.25, '#e9e2cf', stx + 2.5, 0, stz - 0.3, { collide: false });
  const roof = addBox(6, 0.3, 2.6, '#c0392b', stx, 3.4, stz + 0.2, { collide: false });
  roof.rotation.x = -0.12;
  const signTex = textTexture([
    { text: '$ SELL & SHOP $', font: 'bold 64px sans-serif' },
  ], 512, 128, '#ffc93c', '#3a2300');
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(5, 1.25), new THREE.MeshBasicMaterial({ map: signTex }));
  sign.position.set(stx, 4.35, stz + 1.0); group.add(sign);
  const beacon = new THREE.Mesh(
    new THREE.CylinderGeometry(0.6, 0.6, 60, 16, 1, true),
    new THREE.MeshBasicMaterial({ color: 0x4ade80, transparent: true, opacity: 0.18, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false })
  );
  beacon.position.set(stx, 30, stz - 0.5); group.add(beacon);
  animated.push((t) => { beacon.material.opacity = 0.12 + Math.sin(t * 2) * 0.05; });
  const stLight = new THREE.PointLight(0xffe7a8, 25, 14, 1.4);
  stLight.position.set(stx, 3, stz + 1.5); group.add(stLight);

  const builders = { junkyard, beach, city, warehouse, museum };
  builders[id]();

  function junkyard() {
    group.add(new THREE.HemisphereLight(0xffd8a8, 0x4a3520, 1.1));
    const sun = new THREE.DirectionalLight(0xffa860, 2.2); sun.position.set(-40, 25, 20); group.add(sun);
    // Fence
    const fenceMat = mat('#7d7d78', { metalness: 0.5, roughness: 0.6 });
    for (const s of [-1, 1]) {
      addBox(half * 2, 4, 0.3, null, 0, 0, s * half, { material: fenceMat });
      addBox(0.3, 4, half * 2, null, s * half, 0, 0, { material: fenceMat });
    }
    const carColors = ['#8b3a2a', '#5a6b7a', '#7a6a3a', '#3f5a3f', '#6b3a5a', '#9a7b4f'];
    for (let i = 0; i < 18; i++) {
      const x = (rnd() - 0.5) * half * 1.7, z = (rnd() - 0.5) * half * 1.7;
      if (!clearOfSpawn(x, z)) continue;
      const rot = rnd() < 0.5 ? 0 : Math.PI / 2;
      const col = carColors[Math.floor(rnd() * carColors.length)];
      const car = new THREE.Group(); car.position.set(x, 0, z); car.rotation.y = rot + (rnd() - 0.5) * 0.2; group.add(car);
      const body = new THREE.Mesh(new THREE.BoxGeometry(4.2, 1.1, 2), mat(col, { roughness: 0.9 })); body.position.y = 0.9; car.add(body);
      const cab = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.9, 1.8), mat(col, { roughness: 0.9 })); cab.position.set(-0.3, 1.9, 0); car.add(cab);
      const win = new THREE.Mesh(new THREE.BoxGeometry(2.25, 0.6, 1.85), mat('#1c2630', { roughness: 0.2 })); win.position.set(-0.3, 1.95, 0); car.add(win);
      for (const wx of [-1.4, 1.4]) for (const wz of [-1, 1]) {
        if (rnd() < 0.25) continue;
        const wh = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.3, 12), mat('#1a1a1a')); wh.rotation.x = Math.PI / 2; wh.position.set(wx, 0.42, wz); car.add(wh);
      }
      const swap = Math.abs(Math.sin(rot)) > 0.7;
      colliders.push({ minX: x - (swap ? 1.1 : 2.2), maxX: x + (swap ? 1.1 : 2.2), minZ: z - (swap ? 2.2 : 1.1), maxZ: z + (swap ? 2.2 : 1.1) });
    }
    // Scrap heaps
    for (let i = 0; i < 10; i++) {
      const x = (rnd() - 0.5) * half * 1.7, z = (rnd() - 0.5) * half * 1.7;
      if (!clearOfSpawn(x, z, 14)) continue;
      const r = 2.5 + rnd() * 2.5;
      const heap = new THREE.Mesh(new THREE.ConeGeometry(r, r * 1.1, 7), mat('#5a4330', { flatShading: true }));
      heap.position.set(x, r * 0.55, z); heap.rotation.y = rnd() * 6; group.add(heap);
      for (let j = 0; j < 6; j++) {
        const b = new THREE.Mesh(new THREE.BoxGeometry(0.4 + rnd(), 0.2 + rnd() * 0.5, 0.4 + rnd()), mat(carColors[j % carColors.length], { metalness: 0.4 }));
        b.position.set(x + (rnd() - 0.5) * r, rnd() * r * 0.7, z + (rnd() - 0.5) * r); b.rotation.set(rnd() * 3, rnd() * 3, rnd() * 3); group.add(b);
      }
      colliders.push({ minX: x - r * 0.7, maxX: x + r * 0.7, minZ: z - r * 0.7, maxZ: z + r * 0.7 });
    }
    // Tire stacks
    for (let i = 0; i < 12; i++) {
      const x = (rnd() - 0.5) * half * 1.8, z = (rnd() - 0.5) * half * 1.8;
      if (!clearOfSpawn(x, z)) continue;
      const n = 1 + Math.floor(rnd() * 4);
      for (let j = 0; j < n; j++) {
        const t = new THREE.Mesh(new THREE.TorusGeometry(0.5, 0.22, 8, 16), mat('#151515'));
        t.rotation.x = Math.PI / 2; t.position.set(x, 0.22 + j * 0.42, z); group.add(t);
      }
      colliders.push({ minX: x - 0.7, maxX: x + 0.7, minZ: z - 0.7, maxZ: z + 0.7 });
    }
    // Crane
    addBox(1.2, 14, 1.2, '#e0a020', 30, 0, -30);
    addBox(16, 1, 1, '#e0a020', 24, 14, -30, { collide: false });
  }

  function beach() {
    group.add(new THREE.HemisphereLight(0xdff4ff, 0xe8d29a, 1.6));
    const sun = new THREE.DirectionalLight(0xfff4e0, 2.6); sun.position.set(30, 50, 20); group.add(sun);
    bounds.maxZ = 38;
    // Ocean
    const oceanGeo = new THREE.PlaneGeometry(400, 160, 60, 30);
    const ocean = new THREE.Mesh(oceanGeo, new THREE.MeshStandardMaterial({ color: 0x1e88c8, roughness: 0.25, metalness: 0.1, transparent: true, opacity: 0.92 }));
    ocean.rotation.x = -Math.PI / 2; ocean.position.set(0, 0.15, 42 + 80); group.add(ocean);
    const pos = oceanGeo.attributes.position; const base = Float32Array.from(pos.array);
    animated.push((t) => {
      for (let i = 0; i < pos.count; i++) {
        const x = base[i * 3], y = base[i * 3 + 1];
        pos.array[i * 3 + 2] = Math.sin(x * 0.15 + t * 1.2) * 0.25 + Math.cos(y * 0.2 + t) * 0.2;
      }
      pos.needsUpdate = true;
    });
    const wet = new THREE.Mesh(new THREE.PlaneGeometry(400, 6), mat('#c9b07a', { roughness: 0.5 }));
    wet.rotation.x = -Math.PI / 2; wet.position.set(0, 0.02, 41); group.add(wet);
    // Dunes / bounds
    for (let i = -6; i <= 6; i++) {
      const d = new THREE.Mesh(new THREE.SphereGeometry(10, 10, 6), mat('#dcc488')); d.scale.y = 0.4; d.position.set(i * 12, 0, -half - 4); group.add(d);
    }
    // Palms
    const leafMat = mat('#2e8b3a', { side: THREE.DoubleSide, flatShading: true });
    for (let i = 0; i < 22; i++) {
      const x = (rnd() - 0.5) * half * 1.8, z = -half + rnd() * (half + 30);
      if (!clearOfSpawn(x, z)) continue;
      const palm = new THREE.Group(); palm.position.set(x, 0, z); group.add(palm);
      const lean = (rnd() - 0.5) * 0.4; let px = 0, py = 0;
      for (let s = 0; s < 6; s++) {
        const seg = new THREE.Mesh(new THREE.CylinderGeometry(0.22 - s * 0.015, 0.28 - s * 0.015, 1.3, 8), mat('#8b6b43'));
        seg.position.set(px, py + 0.65, 0); seg.rotation.z = -lean; palm.add(seg);
        px += Math.sin(lean) * 1.3; py += 1.25;
      }
      for (let l = 0; l < 7; l++) {
        const leaf = new THREE.Mesh(new THREE.ConeGeometry(0.6, 3.5, 4), leafMat);
        leaf.scale.z = 0.25; leaf.position.set(px, py, 0);
        leaf.rotation.set(0, (l / 7) * Math.PI * 2, 0); leaf.rotateZ(Math.PI / 2 + 0.5); leaf.translateY(1.6);
        palm.add(leaf);
      }
      for (let c = 0; c < 3; c++) {
        const co = new THREE.Mesh(new THREE.SphereGeometry(0.2, 8, 6), mat('#5a3d1e')); co.position.set(px + (rnd() - 0.5) * 0.5, py - 0.3, (rnd() - 0.5) * 0.5); palm.add(co);
      }
      colliders.push({ minX: x - 0.4, maxX: x + 0.4, minZ: z - 0.4, maxZ: z + 0.4 });
    }
    // Umbrellas & towels
    const stripes = ['#ff5a5a', '#ffd23f', '#3fa7ff', '#7cff7c', '#ff7ce0'];
    for (let i = 0; i < 14; i++) {
      const x = (rnd() - 0.5) * half * 1.6, z = rnd() * 32;
      if (!clearOfSpawn(x, z)) continue;
      addCyl(0.06, 0.06, 2.6, '#eeeeee', x, 0, z, { collide: true });
      const top = new THREE.Mesh(new THREE.ConeGeometry(1.8, 0.8, 10), mat(stripes[i % stripes.length], { side: THREE.DoubleSide, flatShading: true }));
      top.position.set(x, 2.8, z); group.add(top);
      addBox(1, 0.03, 2, stripes[(i + 2) % stripes.length], x + 1.5, 0, z + 0.5, { collide: false, rotY: rnd() });
    }
    // Rocks
    for (let i = 0; i < 18; i++) {
      const x = (rnd() - 0.5) * half * 1.9, z = (rnd() - 0.5) * half * 1.8;
      if (!clearOfSpawn(x, z)) continue;
      const r = 0.6 + rnd() * 1.6;
      const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(r, 0), mat('#8a8780', { flatShading: true }));
      rock.position.set(x, r * 0.4, z); rock.rotation.set(rnd(), rnd(), rnd()); group.add(rock);
      colliders.push({ minX: x - r * 0.8, maxX: x + r * 0.8, minZ: z - r * 0.8, maxZ: z + r * 0.8 });
    }
    // Lifeguard tower
    for (const dx of [-1, 1]) for (const dz of [-1, 1]) addCyl(0.1, 0.1, 3, '#ffffff', 22 + dx, 0, 20 + dz, { collide: false });
    addBox(2.6, 0.2, 2.6, '#ffffff', 22, 3, 20, { collide: false });
    addBox(2.6, 1.6, 2.6, '#e53935', 22, 3.2, 20, { collide: false });
    colliders.push({ minX: 20.8, maxX: 23.2, minZ: 18.8, maxZ: 21.2 });
    // Side walls of rocks
    for (const s of [-1, 1]) for (let z = -half; z < 40; z += 4) {
      const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(3, 0), mat('#7a776f', { flatShading: true }));
      rock.position.set(s * (half + 1), 1, z); group.add(rock);
    }
  }

  function city() {
    group.add(new THREE.HemisphereLight(0x6070b0, 0x202028, 0.9));
    const moon = new THREE.DirectionalLight(0x9fb4ff, 1.0); moon.position.set(-20, 40, -30); group.add(moon);
    const winTex = (lit) => canvasTexture(128, (g, s) => {
      g.fillStyle = '#20232c'; g.fillRect(0, 0, s, s);
      for (let y = 0; y < 8; y++) for (let x = 0; x < 4; x++) {
        g.fillStyle = rnd() < lit ? '#ffd98a' : '#141820';
        g.fillRect(x * 32 + 6, y * 16 + 4, 20, 9);
      }
    });
    const tallMats = [0.35, 0.5, 0.2].map((lit) => {
      const t = winTex(lit);
      return new THREE.MeshStandardMaterial({ map: t, emissiveMap: t, emissive: 0xffffff, emissiveIntensity: 0.9, roughness: 0.7 });
    });
    const roofMat = mat('#2a2d36');
    const step = 26;
    for (let gx = -2; gx <= 2; gx++) for (let gz = -2; gz <= 2; gz++) {
      const cx = gx * step, cz = gz * step;
      if (gx === 0 && gz === 0) continue;
      const w = 12 + rnd() * 4, d = 12 + rnd() * 4, h = 10 + rnd() * 35;
      const m = tallMats[Math.floor(rnd() * tallMats.length)].clone();
      m.map = m.map.clone(); m.map.repeat.set(w / 6, h / 6); m.map.needsUpdate = true; m.emissiveMap = m.map;
      const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), [m, m, roofMat, roofMat, m, m]);
      b.position.set(cx, h / 2, cz); group.add(b);
      colliders.push({ minX: cx - w / 2, maxX: cx + w / 2, minZ: cz - d / 2, maxZ: cz + d / 2 });
      // Sidewalk
      const sw = new THREE.Mesh(new THREE.BoxGeometry(w + 3, 0.15, d + 3), mat('#6d6d70'));
      sw.position.set(cx, 0.075, cz); group.add(sw);
    }
    // Plaza
    const plaza = new THREE.Mesh(new THREE.CircleGeometry(9, 32), mat('#7a7468')); plaza.rotation.x = -Math.PI / 2; plaza.position.y = 0.02; group.add(plaza);
    // Road markings
    const lineMat = new THREE.MeshBasicMaterial({ color: 0xd8c25a });
    for (const o of [-step * 1.5, -step / 2, step / 2, step * 1.5]) {
      for (let i = -half; i < half; i += 5) {
        const a = new THREE.Mesh(new THREE.PlaneGeometry(0.25, 2.2), lineMat); a.rotation.x = -Math.PI / 2; a.position.set(o, 0.03, i); group.add(a);
        const b = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 0.25), lineMat); b.rotation.x = -Math.PI / 2; b.position.set(i, 0.03, o); group.add(b);
      }
    }
    // Street lamps
    let lights = 0;
    for (const o of [-step / 2, step / 2]) for (const p of [-step * 1.5, -step / 2, step / 2, step * 1.5]) {
      for (const [x, z] of [[o + 3.5, p], [p, o + 3.5]]) {
        addCyl(0.08, 0.1, 5, '#30333a', x, 0, z, { collide: true });
        const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.3, 10, 8), new THREE.MeshBasicMaterial({ color: 0xffe2a0 }));
        bulb.position.set(x, 5.1, z); group.add(bulb);
        if (lights < 8 && rnd() < 0.6) {
          const pl = new THREE.PointLight(0xffd28a, 35, 16, 1.3); pl.position.set(x, 4.8, z); group.add(pl); lights++;
        }
      }
    }
    // Parked cars
    const cc = ['#c62828', '#1565c0', '#f9a825', '#eeeeee', '#2e7d32', '#111111'];
    for (let i = 0; i < 16; i++) {
      const alongX = rnd() < 0.5;
      const lane = [-step * 1.5, -step / 2, step / 2, step * 1.5][Math.floor(rnd() * 4)] + (rnd() < 0.5 ? -3 : 3);
      const pos = (rnd() - 0.5) * half * 1.8;
      const x = alongX ? pos : lane, z = alongX ? lane : pos;
      if (!clearOfSpawn(x, z)) continue;
      const rot = alongX ? 0 : Math.PI / 2;
      const col = cc[i % cc.length];
      addBox(4, 0.9, 1.8, col, x, 0.25, z, { rotY: rot, material: mat(col, { metalness: 0.6, roughness: 0.35 }) });
      addBox(2.2, 0.7, 1.6, '#1a2230', x, 1.15, z, { rotY: rot, collide: false, material: mat('#1a2230', { roughness: 0.1, metalness: 0.5 }) });
    }
    // Benches & trash cans
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      addBox(2, 0.5, 0.6, '#6b4a2b', Math.cos(a) * 8, 0, Math.sin(a) * 8, { rotY: -a + Math.PI / 2 });
    }
    // City border walls (out of view behind buildings)
    for (const s of [-1, 1]) {
      addBox(half * 2, 3, 0.5, '#2a2a2a', 0, 0, s * half);
      addBox(0.5, 3, half * 2, '#2a2a2a', s * half, 0, 0);
    }
  }

  function warehouse() {
    group.add(new THREE.HemisphereLight(0x303848, 0x101010, 0.25));
    const H = 11;
    const wallMat = mat('#3d3f42', { roughness: 0.95 });
    for (const s of [-1, 1]) {
      addBox(half * 2, H, 0.6, null, 0, 0, s * half, { material: wallMat });
      addBox(0.6, H, half * 2, null, s * half, 0, 0, { material: wallMat });
    }
    const roofM = new THREE.Mesh(new THREE.PlaneGeometry(half * 2, half * 2), mat('#1c1d20', { side: THREE.DoubleSide }));
    roofM.rotation.x = Math.PI / 2; roofM.position.y = H; group.add(roofM);
    for (let x = -half + 6; x < half; x += 6) addBox(0.4, 0.6, half * 2, '#2a2c30', x, H - 0.6, 0, { collide: false });
    // Pillars
    for (let x = -30; x <= 30; x += 15) for (let z = -30; z <= 30; z += 15) {
      if (!clearOfSpawn(x, z, 6)) continue;
      addBox(0.8, H, 0.8, '#55575a', x, 0, z);
    }
    // Shelving racks
    const shelfMat = mat('#2d5aa8', { metalness: 0.5, roughness: 0.5 });
    const boxCols = ['#8a6a3a', '#a07b45', '#6e5530', '#b38b52'];
    for (let r = 0; r < 6; r++) {
      const z = -36 + r * 12; if (Math.abs(z) < 10) continue;
      for (const xs of [-24, 12]) {
        const len = 16;
        const rack = new THREE.Group(); rack.position.set(xs + len / 2, 0, z); group.add(rack);
        for (let lvl = 0; lvl < 4; lvl++) {
          const sh = new THREE.Mesh(new THREE.BoxGeometry(len, 0.12, 2), shelfMat); sh.position.y = 0.2 + lvl * 1.6; rack.add(sh);
          for (let bx = -len / 2 + 1; bx < len / 2 - 0.5; bx += 1.4) {
            if (rnd() < 0.3) continue;
            const s = 0.7 + rnd() * 0.5;
            const b = new THREE.Mesh(new THREE.BoxGeometry(s, s, s), mat(boxCols[Math.floor(rnd() * 4)]));
            b.position.set(bx, 0.26 + lvl * 1.6 + s / 2, (rnd() - 0.5) * 0.4); rack.add(b);
          }
        }
        for (const px of [-len / 2, 0, len / 2]) for (const pz of [-0.95, 0.95]) {
          const p = new THREE.Mesh(new THREE.BoxGeometry(0.12, 6.4, 0.12), mat('#e06a1a')); p.position.set(px, 3.2, pz); rack.add(p);
        }
        colliders.push({ minX: xs - 0.1, maxX: xs + len + 0.1, minZ: z - 1.1, maxZ: z + 1.1 });
      }
    }
    // Crates
    for (let i = 0; i < 16; i++) {
      const x = (rnd() - 0.5) * half * 1.7, z = (rnd() - 0.5) * half * 1.7;
      if (!clearOfSpawn(x, z, 9)) continue;
      const s = 1 + rnd() * 1.2;
      addBox(s, s, s, '#7a5a30', x, 0, z, { rotY: 0 });
      if (rnd() < 0.5) addBox(s * 0.8, s * 0.8, s * 0.8, '#8a6a3a', x, s, z, { collide: false });
    }
    // Flickering hanging lights
    const flicker = [];
    for (const [x, z] of [[-20, -20], [20, 15], [-15, 25], [25, -25]]) {
      const lamp = new THREE.Mesh(new THREE.ConeGeometry(0.6, 0.5, 12, 1, true), mat('#222', { side: THREE.DoubleSide }));
      lamp.position.set(x, H - 2, z); group.add(lamp);
      const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.18), new THREE.MeshBasicMaterial({ color: 0xfff0c0 }));
      bulb.position.set(x, H - 2.25, z); group.add(bulb);
      const pl = new THREE.PointLight(0xffe0a0, 30, 14, 1.4); pl.position.set(x, H - 2.6, z); group.add(pl);
      flicker.push({ pl, bulb, seed: rnd() * 100 });
    }
    animated.push((t) => {
      for (const f of flicker) {
        const on = Math.sin(t * 13 + f.seed) + Math.sin(t * 7.3 + f.seed * 2) > -0.6;
        f.pl.intensity = on ? 30 : 2; f.bulb.visible = on;
      }
    });
  }

  function museum() {
    group.add(new THREE.HemisphereLight(0x8070a0, 0x201810, 0.45));
    const H = 9;
    const wallMat = mat('#6b2430', { roughness: 0.9 });
    const trimMat = mat('#c8a24a', { metalness: 0.7, roughness: 0.35 });
    for (const s of [-1, 1]) {
      addBox(half * 2, H, 0.6, null, 0, 0, s * half, { material: wallMat });
      addBox(0.6, H, half * 2, null, s * half, 0, 0, { material: wallMat });
    }
    const ceil = new THREE.Mesh(new THREE.PlaneGeometry(half * 2, half * 2), mat('#e8e0d0', { side: THREE.DoubleSide }));
    ceil.rotation.x = Math.PI / 2; ceil.position.y = H; group.add(ceil);
    // Gallery partition walls
    const parts = [[-24, -16, 20, 'x'], [24, -16, 20, 'x'], [-24, 18, 20, 'x'], [24, 18, 20, 'x'], [-16, -36, 16, 'z'], [16, -36, 16, 'z'], [-16, 36, 16, 'z'], [16, 36, 16, 'z']];
    const paintings = [];
    for (const [x, z, len, ax] of parts) {
      if (ax === 'x') addBox(len, H - 2, 0.5, null, x, 0, z, { material: wallMat });
      else addBox(0.5, H - 2, len, null, x, 0, z, { material: wallMat });
      paintings.push([x, z, ax]);
    }
    // Paintings on walls
    const paint = () => canvasTexture(128, (g, s) => {
      const hue = Math.floor(rnd() * 360);
      g.fillStyle = `hsl(${hue},40%,25%)`; g.fillRect(0, 0, s, s);
      for (let i = 0; i < 8; i++) {
        g.fillStyle = `hsla(${(hue + rnd() * 120) % 360},70%,${30 + rnd() * 50}%,.8)`;
        g.beginPath(); g.arc(rnd() * s, rnd() * s, 10 + rnd() * 40, 0, 7); g.fill();
      }
    });
    const hang = (x, z, rotY) => {
      const frame = new THREE.Mesh(new THREE.BoxGeometry(3.4, 2.6, 0.12), trimMat);
      frame.position.set(x, 3.6, z); frame.rotation.y = rotY; group.add(frame);
      const art = new THREE.Mesh(new THREE.PlaneGeometry(3, 2.2), new THREE.MeshStandardMaterial({ map: paint(), emissive: 0xffffff, emissiveMap: null, emissiveIntensity: 0 }));
      art.position.copy(frame.position); art.rotation.y = rotY; art.translateZ(0.07); group.add(art);
    };
    for (let x = -40; x <= 40; x += 10) { hang(x, -half + 0.35, 0); hang(x, half - 0.35, Math.PI); }
    for (let z = -40; z <= 40; z += 10) { hang(-half + 0.35, z, Math.PI / 2); hang(half - 0.35, z, -Math.PI / 2); }
    for (const [x, z, ax] of paintings) {
      if (ax === 'x') { hang(x, z + 0.3, 0); hang(x, z - 0.3, Math.PI); }
      else { hang(x + 0.3, z, Math.PI / 2); hang(x - 0.3, z, -Math.PI / 2); }
    }
    // Columns
    for (const x of [-34, -12, 12, 34]) for (const z of [-26, 0, 26]) {
      if (!clearOfSpawn(x, z, 8)) continue;
      addCyl(0.7, 0.8, H, '#e8e0d0', x, 0, z, { seg: 16 });
    }
    // Display pedestals with glass cases
    const glass = new THREE.MeshStandardMaterial({ color: 0xbfe6ff, transparent: true, opacity: 0.18, roughness: 0.05, metalness: 0.2, depthWrite: false });
    const relicMats = ['#ffcc33', '#3fbf7f', '#c0623a', '#ccf4ff'];
    for (let i = 0; i < 14; i++) {
      const x = (rnd() - 0.5) * half * 1.6, z = (rnd() - 0.5) * half * 1.6;
      if (!clearOfSpawn(x, z, 10)) continue;
      addBox(1.2, 1.1, 1.2, '#f0ebe0', x, 0, z);
      const gc = new THREE.Mesh(new THREE.BoxGeometry(1.1, 1.2, 1.1), glass); gc.position.set(x, 1.7, z); group.add(gc);
      const relic = new THREE.Mesh(i % 2 ? new THREE.IcosahedronGeometry(0.3) : new THREE.TorusKnotGeometry(0.2, 0.07, 48, 8), mat(relicMats[i % 4], { metalness: 0.8, roughness: 0.3, emissive: relicMats[i % 4], emissiveIntensity: 0.2 }));
      relic.position.set(x, 1.6, z); group.add(relic);
      animated.push((t) => { relic.rotation.y = t * 0.6; });
    }
    // Dinosaur skeleton centerpiece (abstract)
    const bone = mat('#e8dfc8');
    const dino = new THREE.Group(); dino.position.set(0, 0, 22); group.add(dino);
    for (let i = 0; i < 14; i++) {
      const v = new THREE.Mesh(new THREE.SphereGeometry(0.35 - i * 0.015, 8, 6), bone);
      v.position.set(-6 + i * 0.9, 3 + Math.sin(i * 0.35) * 1.2, 0); dino.add(v);
      if (i > 2 && i < 10) {
        const rib = new THREE.Mesh(new THREE.TorusGeometry(0.9, 0.06, 6, 12, Math.PI), bone);
        rib.position.copy(v.position); rib.rotation.set(0, Math.PI / 2, Math.PI); dino.add(rib);
      }
    }
    const skull = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.8, 0.8), bone); skull.position.set(7.2, 4.6, 0); dino.add(skull);
    for (const lx of [-2.5, 2]) {
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.2, 3), bone); leg.position.set(lx, 1.5, 0); dino.add(leg);
    }
    addBox(16, 0.3, 4, '#3a3036', 0, 0, 22, { collide: false });
    colliders.push({ minX: -8, maxX: 8, minZ: 20, maxZ: 24 });
    // Velvet rope posts around the dino
    for (let x = -9; x <= 9; x += 3) for (const z of [19, 25]) addCyl(0.06, 0.1, 1, '#c8a24a', x, 0, z, { collide: false });
    // Dim spotlights
    for (const [x, z] of [[-30, -30], [30, -30], [-30, 30], [30, 30], [0, 22]]) {
      const sl = new THREE.SpotLight(0xfff0d0, 120, 22, 0.6, 0.5, 1.2);
      sl.position.set(x, H - 0.3, z); sl.target.position.set(x, 0, z); group.add(sl, sl.target);
    }
  }

  function isFree(x, z, margin = 0.6) {
    if (x < bounds.minX + 1 || x > bounds.maxX - 1 || z < bounds.minZ + 1 || z > bounds.maxZ - 1) return false;
    for (const c of colliders) {
      if (x > c.minX - margin && x < c.maxX + margin && z > c.minZ - margin && z < c.maxZ + margin) return false;
    }
    return true;
  }

  return {
    group, colliders, bounds, isFree,
    station: { x: stx, z: stz + 1.6 },
    background: scene.background, fog: scene.fog,
    update(t) { for (const f of animated) f(t); },
    dispose() {
      group.traverse((o) => {
        o.geometry?.dispose?.();
        const ms = Array.isArray(o.material) ? o.material : o.material ? [o.material] : [];
        for (const m of ms) { if (![...matCache.values()].includes(m)) { m.map?.dispose?.(); m.dispose?.(); } }
      });
    },
  };
}

// ---------- Item meshes ----------

const lathe = (pts) => new THREE.LatheGeometry(pts.map(([x, y]) => new THREE.Vector2(x, y)), 16);

export function makeItemMesh(shape, color) {
  const m = new THREE.MeshStandardMaterial({ color, metalness: 0.6, roughness: 0.35, emissive: color, emissiveIntensity: 0.18 });
  const g = new THREE.Group();
  const add = (geo, x = 0, y = 0, z = 0, material = m) => { const mesh = new THREE.Mesh(geo, material); mesh.position.set(x, y, z); g.add(mesh); return mesh; };
  switch (shape) {
    case 'coin': add(new THREE.CylinderGeometry(0.26, 0.26, 0.06, 24)).rotation.x = Math.PI / 2; break;
    case 'can': add(new THREE.CylinderGeometry(0.13, 0.13, 0.38, 14)); break;
    case 'bar': add(new THREE.BoxGeometry(0.5, 0.16, 0.24)); break;
    case 'phone': add(new THREE.BoxGeometry(0.24, 0.42, 0.04)); break;
    case 'box': add(new THREE.BoxGeometry(0.38, 0.26, 0.3)); break;
    case 'bottle': add(lathe([[0, -0.25], [0.12, -0.25], [0.12, 0.05], [0.05, 0.15], [0.04, 0.28], [0, 0.28]])); m.transparent = true; m.opacity = 0.85; break;
    case 'watch': add(new THREE.TorusGeometry(0.16, 0.04, 8, 20)); add(new THREE.CylinderGeometry(0.1, 0.1, 0.05, 16), 0, 0.16, 0).rotation.x = Math.PI / 2; break;
    case 'vase': add(lathe([[0, -0.25], [0.12, -0.25], [0.2, -0.05], [0.12, 0.15], [0.09, 0.22], [0.13, 0.27], [0, 0.27]])); break;
    case 'ring': add(new THREE.TorusGeometry(0.18, 0.05, 10, 24)); add(new THREE.OctahedronGeometry(0.07), 0, 0.24, 0, new THREE.MeshStandardMaterial({ color: '#e8faff', metalness: 0.2, roughness: 0.05, emissive: '#88ccff', emissiveIntensity: 0.4 })); break;
    case 'statue': add(new THREE.BoxGeometry(0.3, 0.06, 0.3), 0, -0.22); add(new THREE.CapsuleGeometry(0.08, 0.22, 4, 8), 0, -0.02); add(new THREE.SphereGeometry(0.08, 10, 8), 0, 0.2); break;
    case 'gem': add(new THREE.OctahedronGeometry(0.24)).scale.y = 1.3; m.metalness = 0.1; m.roughness = 0.05; m.emissiveIntensity = 0.45; m.flatShading = true; break;
    case 'shell': { const s = add(new THREE.SphereGeometry(0.22, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2)); s.scale.set(1, 0.5, 1.2); m.metalness = 0; break; }
    case 'orb': add(new THREE.SphereGeometry(0.2, 18, 14)); m.metalness = 0.2; m.roughness = 0.1; m.emissiveIntensity = 0.35; break;
    case 'chest': {
      const wood = new THREE.MeshStandardMaterial({ color, roughness: 0.8, emissive: color, emissiveIntensity: 0.12 });
      const gold = new THREE.MeshStandardMaterial({ color: '#ffcc33', metalness: 0.9, roughness: 0.3, emissive: '#ffcc33', emissiveIntensity: 0.3 });
      add(new THREE.BoxGeometry(0.6, 0.32, 0.4), 0, -0.05, 0, wood);
      add(new THREE.CylinderGeometry(0.2, 0.2, 0.6, 12, 1, false, 0, Math.PI), 0, 0.11, 0, wood).rotation.z = Math.PI / 2;
      add(new THREE.BoxGeometry(0.62, 0.06, 0.42), 0, 0.1, 0, gold);
      add(new THREE.SphereGeometry(0.06), 0.31, 0.1, 0, gold);
      break;
    }
    case 'crown': {
      add(new THREE.CylinderGeometry(0.22, 0.22, 0.14, 20, 1, true)).material.side = THREE.DoubleSide;
      for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2; add(new THREE.ConeGeometry(0.05, 0.16, 6), Math.cos(a) * 0.21, 0.15, Math.sin(a) * 0.21); }
      add(new THREE.SphereGeometry(0.05), 0.22, 0, 0, new THREE.MeshStandardMaterial({ color: '#ff2244', emissive: '#ff2244', emissiveIntensity: 0.5 }));
      break;
    }
    case 'chalice': add(lathe([[0, -0.25], [0.14, -0.25], [0.04, -0.2], [0.03, 0.02], [0.15, 0.08], [0.17, 0.25], [0.15, 0.25], [0, 0.1]])); break;
    case 'egg': add(new THREE.SphereGeometry(0.2, 18, 14)).scale.y = 1.3; m.metalness = 0.8; m.emissiveIntensity = 0.4; break;
    default: add(new THREE.BoxGeometry(0.3, 0.3, 0.3));
  }
  return g;
}

let glowTex;
export function glowTexture() {
  if (glowTex) return glowTex;
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grd.addColorStop(0, 'rgba(255,255,255,1)'); grd.addColorStop(0.25, 'rgba(255,255,255,.5)'); grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd; g.fillRect(0, 0, 64, 64);
  glowTex = new THREE.CanvasTexture(c);
  return glowTex;
}

export function makeDetectorModel() {
  const g = new THREE.Group();
  const dark = new THREE.MeshStandardMaterial({ color: '#222', roughness: 0.6 });
  const yel = new THREE.MeshStandardMaterial({ color: '#ffc93c', roughness: 0.5 });
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.9), dark); shaft.rotation.x = 1.0; shaft.position.set(0, -0.15, -0.3); g.add(shaft);
  const coil = new THREE.Mesh(new THREE.TorusGeometry(0.12, 0.02, 8, 20), yel); coil.rotation.x = Math.PI / 2 + 0.3; coil.position.set(0, -0.52, -0.65); g.add(coil);
  const box = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.06, 0.14), yel); box.position.set(0, 0.08, 0); g.add(box);
  const led = new THREE.Mesh(new THREE.SphereGeometry(0.015), new THREE.MeshBasicMaterial({ color: 0x00ff66 })); led.position.set(0, 0.115, -0.03); g.add(led);
  g.userData.led = led;
  return g;
}
