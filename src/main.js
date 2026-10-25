import * as THREE from 'three';
import { RARITIES, RARITY_ORDER, LOCATIONS, LOCATION_ORDER, EQUIPMENT, EQUIPMENT_ORDER, LUCK_TIERS, POTION } from './data.js';
import { buildWorld, makeItemMesh, glowTexture, makeDetectorModel } from './world.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';

const $ = (id) => document.getElementById(id);
const fmt = (n) => '$' + Math.round(n).toLocaleString();

// ---------- Save state ----------

const SAVE_KEY = 'cashquest-save-v1';
const defaults = () => ({
  money: 0, earned: 0, found: 0,
  gear: { detector: 0, scanner: 0, flashlight: 0, backpack: 0, shoes: 0 },
  luck: 0, potionLeft: 0,
  unlocked: ['junkyard'], loc: 'junkyard', bag: [], best: null,
  gfx: matchMedia('(pointer: coarse)').matches ? 'low' : 'high',
});
let state = defaults();
try {
  const raw = localStorage.getItem(SAVE_KEY);
  if (raw) {
    const s = JSON.parse(raw);
    state = { ...defaults(), ...s, gear: { ...defaults().gear, ...s.gear } };
  }
} catch { /* storage unavailable: play without saving */ }
function save() { try { localStorage.setItem(SAVE_KEY, JSON.stringify(state)); } catch { /* ignore */ } }

const tier = (key) => EQUIPMENT[key].tiers[state.gear[key]];
const capacity = () => tier('backpack').cap;
const effectiveLuck = () => {
  const base = LUCK_TIERS[state.luck].luck;
  return state.potionLeft > 0 ? (base + 1) * POTION.factor : base;
};

// ---------- Renderer / scene ----------

const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setSize(innerWidth, innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
$('game').appendChild(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(72, innerWidth / innerHeight, 0.05, 900);
scene.add(camera);

// Image-based lighting so metal, gems and cars pick up reflections.
const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;

// Post-processing: bloom for glowing loot and lights, then a soft vignette.
const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.45, 0.45, 1.0);
composer.addPass(bloom);
composer.addPass(new OutputPass());
composer.addPass(new ShaderPass({
  uniforms: { tDiffuse: { value: null }, strength: { value: 0.35 } },
  vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  fragmentShader: `uniform sampler2D tDiffuse; uniform float strength; varying vec2 vUv;
    void main() {
      vec4 c = texture2D(tDiffuse, vUv);
      float d = distance(vUv, vec2(0.5));
      c.rgb *= 1.0 - smoothstep(0.35, 0.85, d) * strength;
      c.rgb = mix(vec3(dot(c.rgb, vec3(0.299, 0.587, 0.114))), c.rgb, 1.08);
      gl_FragColor = c;
    }`,
}));

function applyQuality() {
  const high = state.gfx === 'high';
  renderer.setPixelRatio(Math.min(devicePixelRatio, high ? 2 : 1.25));
  renderer.setSize(innerWidth, innerHeight);
  composer.setPixelRatio(renderer.getPixelRatio());
  composer.setSize(innerWidth, innerHeight);
  renderer.shadowMap.enabled = high;
  flashlight.castShadow = high;
  scene.traverse((o) => { if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => (m.needsUpdate = true)); });
  document.querySelectorAll('.gfxBtn').forEach((b) => (b.textContent = `Graphics: ${high ? 'HIGH ✨' : 'LOW ⚡'}`));
}
addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
  composer.setSize(innerWidth, innerHeight);
});

const flashlight = new THREE.SpotLight(0xfff4dd, 0, 20, 0.5, 0.45, 1);
flashlight.position.set(0.2, -0.1, 0);
flashlight.target.position.set(0, -0.15, -1);
flashlight.shadow.mapSize.set(1024, 1024);
flashlight.shadow.bias = -0.0005;
flashlight.shadow.camera.near = 0.3;
camera.add(flashlight, flashlight.target);
let lightOn = true;

const detectorModel = makeDetectorModel();
detectorModel.position.set(0.34, -0.36, -0.6);
detectorModel.scale.setScalar(0.7);
camera.add(detectorModel);

// ---------- Player ----------

const player = { pos: new THREE.Vector3(0, 0, 6), yaw: 0, pitch: 0, bob: 0, sprint: false };
const EYE = 1.7, RADIUS = 0.4;
const keys = new Set();

// ---------- World & items ----------

let world = null;
let items = [];
let respawnQueue = [];
const SURFACE_COUNT = 24, BURIED_COUNT = 16;

function rollRarity() {
  const luck = effectiveLuck();
  const weights = RARITY_ORDER.map((r) => {
    const R = RARITIES[r];
    return r === 'common' ? R.weight / (1 + luck * 0.35) : R.weight * (1 + luck * R.luck);
  });
  const total = weights.reduce((a, b) => a + b, 0);
  let x = Math.random() * total;
  for (let i = 0; i < weights.length; i++) { x -= weights[i]; if (x <= 0) return RARITY_ORDER[i]; }
  return 'common';
}
function rarityOdds() {
  const luck = effectiveLuck();
  const w = RARITY_ORDER.map((r) => (r === 'common' ? RARITIES[r].weight / (1 + luck * 0.35) : RARITIES[r].weight * (1 + luck * RARITIES[r].luck)));
  const t = w.reduce((a, b) => a + b, 0);
  return w.map((v) => v / t);
}

function spawnItem(buried) {
  const loc = LOCATIONS[state.loc];
  const rarity = rollRarity();
  const pool = loc.items[rarity];
  const [name, shape, color] = pool[Math.floor(Math.random() * pool.length)];
  const R = RARITIES[rarity];
  const value = Math.round((R.min + Math.random() * (R.max - R.min)) * loc.mult * (buried ? 1.6 : 1));
  let x, z, tries = 0;
  do {
    x = world.bounds.minX + Math.random() * (world.bounds.maxX - world.bounds.minX);
    z = world.bounds.minZ + Math.random() * (world.bounds.maxZ - world.bounds.minZ);
    tries++;
  } while ((!world.isFree(x, z) || Math.hypot(x - world.station.x, z - world.station.z) < 6) && tries < 200);
  const it = { name, shape, color, rarity, value, buried, x, z, mesh: null, phase: Math.random() * 6 };
  if (!buried) it.mesh = createItemVisual(it);
  items.push(it);
}

function createItemVisual(it) {
  const g = new THREE.Group();
  const m = makeItemMesh(it.shape, it.color);
  m.position.y = 0.45;
  g.add(m);
  const R = RARITIES[it.rarity];
  const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color: R.color, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0.85 }));
  const s = 1.3 + RARITY_ORDER.indexOf(it.rarity) * 0.4;
  glow.scale.set(s, s, s); glow.position.y = 0.45; g.add(glow);
  const tierIdx = RARITY_ORDER.indexOf(it.rarity);
  let beam = null, sparkles = null;
  if (tierIdx >= 3) {
    beam = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.35, 14, 12, 1, true), new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
      uniforms: { color: { value: new THREE.Color(R.color) }, time: { value: 0 } },
      vertexShader: 'varying float vY; void main() { vY = uv.y; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: 'uniform vec3 color; uniform float time; varying float vY; void main() { float a = pow(1.0 - vY, 2.0) * (0.55 + 0.15 * sin(time * 3.0 + vY * 12.0)); gl_FragColor = vec4(color * 1.6, a); }',
    }));
    beam.position.y = 7; g.add(beam);
  }
  if (tierIdx >= 2) {
    const n = 6 + tierIdx * 4, pos = new Float32Array(n * 3);
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    sparkles = new THREE.Points(geo, new THREE.PointsMaterial({ map: glowTexture(), color: R.color, size: 0.16, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    sparkles.userData.n = n; g.add(sparkles);
  }
  g.position.set(it.x, 0, it.z);
  g.userData = { inner: m, glow, beam, sparkles };
  scene.add(g);
  return g;
}

function removeItemVisual(it) {
  if (!it.mesh) return;
  scene.remove(it.mesh);
  it.mesh.traverse((o) => { o.geometry?.dispose(); if (o.material && o.material.map !== glowTexture()) o.material.dispose?.(); });
  it.mesh = null;
}

function loadLocation(id) {
  for (const it of items) removeItemVisual(it);
  items = []; respawnQueue = [];
  if (world) { scene.remove(world.group); world.dispose(); }
  state.loc = id;
  world = buildWorld(id, LOCATIONS[id]);
  scene.add(world.group);
  scene.background = world.background;
  scene.fog = world.fog;
  scene.environmentIntensity = world.envIntensity;
  for (let i = 0; i < SURFACE_COUNT; i++) spawnItem(false);
  for (let i = 0; i < BURIED_COUNT; i++) spawnItem(true);
  player.pos.set(0, 0, 4); player.yaw = 0; player.pitch = 0;
  $('locName').textContent = '📍 ' + LOCATIONS[id].name;
  applyGear();
  applyQuality();
  save();
}

function applyGear() {
  const fl = tier('flashlight');
  // Flashlights matter most in dark places; keep them subtle in daylight.
  flashlight.intensity = lightOn ? fl.power * (0.25 + 0.75 * LOCATIONS[state.loc].dark) : 0;
  flashlight.distance = fl.dist;
  detectorModel.visible = state.gear.detector > 0;
  $('detector').classList.toggle('hidden', state.gear.detector === 0);
  $('radar').classList.toggle('hidden', state.gear.scanner === 0);
  updateHud();
}

// ---------- Audio ----------

let audio = null;
function initAudio() {
  if (audio) return;
  try { audio = new (window.AudioContext || window.webkitAudioContext)(); } catch { audio = null; }
}
function tone(freq, dur = 0.1, type = 'sine', vol = 0.15, when = 0) {
  if (!audio) return;
  const t = audio.currentTime + when;
  const o = audio.createOscillator(), g = audio.createGain();
  o.type = type; o.frequency.setValueAtTime(freq, t);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(audio.destination);
  o.start(t); o.stop(t + dur + 0.05);
}
const sfx = {
  pickup(r) { const base = 520 + r * 120; [0, 1, 2].forEach((i) => tone(base * (1 + i * 0.26), 0.18, 'triangle', 0.14, i * 0.07)); if (r >= 4) [0, 1, 2, 3, 4].forEach((i) => tone(880 * (1 + i * 0.2), 0.3, 'square', 0.06, 0.25 + i * 0.09)); },
  cash() { [0, 1, 2, 3].forEach((i) => tone(1200 + i * 300, 0.12, 'square', 0.07, i * 0.06)); tone(300, 0.3, 'triangle', 0.15); },
  buy() { tone(660, 0.1, 'triangle', 0.15); tone(990, 0.2, 'triangle', 0.15, 0.08); },
  error() { tone(180, 0.2, 'sawtooth', 0.08); },
  beep(s) { tone(600 + s * 900, 0.05, 'square', 0.05); },
  dig() { tone(120 + Math.random() * 60, 0.08, 'sawtooth', 0.05); },
};

// ---------- UI ----------

function toast(text, color = '#fff') {
  const el = document.createElement('div');
  el.className = 'toast'; el.innerHTML = text; el.style.borderColor = color; el.style.color = color;
  $('toasts').appendChild(el);
  while ($('toasts').children.length > 4) $('toasts').firstChild.remove();
  setTimeout(() => el.remove(), 2900);
}

function updateHud() {
  $('money').textContent = fmt(state.money);
  $('bag').textContent = `🎒 ${state.bag.length} / ${capacity()}`;
  $('bag').classList.toggle('full', state.bag.length >= capacity());
  const luck = effectiveLuck();
  $('luckInfo').textContent = state.potionLeft > 0
    ? `🍀 Luck x${luck.toFixed(1)} · potion ${Math.ceil(state.potionLeft)}s`
    : luck > 0 ? `🍀 Luck +${luck.toFixed(1)}` : '';
}
function bumpMoney() { const m = $('money'); m.classList.remove('bump'); void m.offsetWidth; m.classList.add('bump'); }

// ---------- Game flow ----------

let playing = false, menuOpen = false;
const isTouch = matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;
if (isTouch) document.body.classList.add('touch');

function lockPointer() {
  if (isTouch) return;
  try { renderer.domElement.requestPointerLock?.()?.catch?.(() => {}); } catch { /* pointer lock unavailable (e.g. embedded frame) */ }
}

$('playBtn').onclick = () => {
  initAudio();
  $('title').classList.add('hidden');
  $('hud').classList.remove('hidden');
  if (isTouch) $('touch').classList.remove('hidden');
  playing = true;
  player.yaw = 0;
  lockPointer();
  if (state.found === 0) setTimeout(() => toast('Look for glowing loot! Press <b>E</b> to grab it', '#ffc93c'), 600);
};
$('resetBtn').onclick = () => {
  if (!confirm('Reset all progress?')) return;
  state = defaults(); save(); loadLocation('junkyard'); toast('Progress reset');
};
document.querySelectorAll('.gfxBtn').forEach((b) => (b.onclick = () => {
  state.gfx = state.gfx === 'high' ? 'low' : 'high'; applyQuality(); save();
}));
$('resumeBtn').onclick = () => { $('pause').classList.add('hidden'); lockPointer(); };
renderer.domElement.addEventListener('click', () => { if (playing && !menuOpen && !document.pointerLockElement) { $('pause').classList.add('hidden'); lockPointer(); } });
document.addEventListener('pointerlockchange', () => {
  if (!document.pointerLockElement && playing && !menuOpen) $('pause').classList.remove('hidden');
});

document.addEventListener('mousemove', (e) => {
  if (document.pointerLockElement !== renderer.domElement) return;
  look(e.movementX, e.movementY, 0.0022);
});
function look(dx, dy, sens) {
  player.yaw -= dx * sens;
  player.pitch = Math.max(-1.45, Math.min(1.45, player.pitch - dy * sens));
}

addEventListener('keydown', (e) => {
  if (e.code === 'Escape' && menuOpen) { closeStation(); return; }
  if (!playing || menuOpen) return;
  keys.add(e.code);
  if (e.code === 'KeyE' && !e.repeat) interact();
  if (e.code === 'KeyF' && !e.repeat) toggleLight();
});
addEventListener('keyup', (e) => keys.delete(e.code));
addEventListener('blur', () => keys.clear());

function toggleLight() {
  if (state.gear.flashlight === 0) { toast('🔦 You need a flashlight! Buy one at the station.', '#ff9b9b'); return; }
  lightOn = !lightOn; applyGear(); tone(lightOn ? 900 : 500, 0.05, 'square', 0.06);
}

// ---------- Interaction ----------

let target = null; // { type: 'station'|'item'|'dig', item }
let digging = null; // { item, t }
const DIG_TIME = 1.1;

function findTarget() {
  const px = player.pos.x, pz = player.pos.z;
  if (Math.hypot(px - world.station.x, pz - world.station.z) < 3.6) return { type: 'station' };
  const fx = -Math.sin(player.yaw), fz = -Math.cos(player.yaw);
  let best = null, bestScore = Infinity;
  for (const it of items) {
    if (it.buried) continue;
    const dx = it.x - px, dz = it.z - pz, d = Math.hypot(dx, dz);
    if (d > 2.8) continue;
    const facing = (dx * fx + dz * fz) / (d || 1);
    if (d > 1.3 && facing < 0.55) continue;
    const score = d - facing;
    if (score < bestScore) { bestScore = score; best = it; }
  }
  if (best) return { type: 'item', item: best };
  if (state.gear.detector > 0) {
    let near = null, nd = 2.4;
    for (const it of items) {
      if (!it.buried) continue;
      const d = Math.hypot(it.x - px, it.z - pz);
      if (d < nd) { nd = d; near = it; }
    }
    if (near) return { type: 'dig', item: near };
  }
  return null;
}

function interact() {
  if (digging) return;
  if (!target) return;
  if (target.type === 'station') { openStation(); return; }
  if (state.bag.length >= capacity()) { sfx.error(); toast('🎒 Bag is full! Go sell at the $ station.', '#ff9b9b'); return; }
  if (target.type === 'item') collect(target.item);
  else if (target.type === 'dig') digging = { item: target.item, t: 0 };
}

function collect(it, fromDig = false) {
  items.splice(items.indexOf(it), 1);
  const R = RARITIES[it.rarity];
  state.bag.push({ name: it.name, rarity: it.rarity, value: it.value });
  state.found++;
  if (!state.best || it.value > state.best.value) state.best = { name: it.name, value: it.value };
  sfx.pickup(RARITY_ORDER.indexOf(it.rarity));
  toast(`${fromDig ? '⛏️ Dug up' : '+'} <b>${it.name}</b> · ${R.label} · ${fmt(it.value)}`, R.color);
  if (it.rarity === 'legendary') toast('🌟 LEGENDARY FIND! 🌟', R.color);
  if (it.mesh) {
    const mesh = it.mesh; it.mesh = null;
    popAnims.push({ mesh, t: 0 });
  } else if (fromDig) {
    const vis = createItemVisual(it); popAnims.push({ mesh: vis, t: 0 });
  }
  respawnQueue.push({ at: clock.elapsedTime + 4 + Math.random() * 6, buried: it.buried });
  updateHud(); save();
}

const popAnims = [];

// ---------- Station menu ----------

let currentTab = 'sell';
function openStation() {
  menuOpen = true; keys.clear();
  document.exitPointerLock?.();
  $('pause').classList.add('hidden');
  $('station').classList.remove('hidden');
  renderTab(state.bag.length ? 'sell' : currentTab === 'sell' ? 'gear' : currentTab);
}
function closeStation() {
  menuOpen = false;
  $('station').classList.add('hidden');
  lockPointer();
}
$('closeStation').onclick = closeStation;
document.querySelectorAll('.tabs button').forEach((b) => (b.onclick = () => renderTab(b.dataset.tab)));

function buyButton(price, owned, label = fmt(price)) {
  if (owned) return `<button class="buy owned" disabled>${owned}</button>`;
  return `<button class="buy" data-price="${price}" ${state.money < price ? 'disabled' : ''}>${label}</button>`;
}

function renderTab(tab) {
  currentTab = tab;
  document.querySelectorAll('.tabs button').forEach((b) => b.classList.toggle('active', b.dataset.tab === tab));
  $('stMoney').textContent = fmt(state.money);
  const body = $('tabBody');
  let html = '';
  if (tab === 'sell') {
    if (!state.bag.length) {
      html = `<div class="empty">Your bag is empty.<br>Go find some treasure! 🔍</div>`;
    } else {
      const total = state.bag.reduce((a, b) => a + b.value, 0);
      const sorted = [...state.bag].sort((a, b) => b.value - a.value);
      html = `<div class="itemList">${sorted.map((it) => `<div class="itemLine"><span style="color:${RARITIES[it.rarity].color}">${it.name} <small>(${RARITIES[it.rarity].label})</small></span><span>${fmt(it.value)}</span></div>`).join('')}</div>
        <button class="big sellAll" id="sellAll">SELL ALL · ${fmt(total)}</button>`;
    }
    html += `<div class="stats">Total earned: ${fmt(state.earned)} · Items found: ${state.found}${state.best ? ` · Best find: ${state.best.name} (${fmt(state.best.value)})` : ''}</div>`;
    body.innerHTML = html;
    $('sellAll')?.addEventListener('click', () => {
      const total = state.bag.reduce((a, b) => a + b.value, 0);
      state.money += total; state.earned += total; state.bag = [];
      sfx.cash(); bumpMoney(); updateHud(); save();
      toast(`💰 Sold for <b>${fmt(total)}</b>!`, '#4ade80');
      renderTab('sell');
    });
    return;
  }
  if (tab === 'gear') {
    for (const key of EQUIPMENT_ORDER) {
      const eq = EQUIPMENT[key], lvl = state.gear[key], next = eq.tiers[lvl + 1];
      const stat = (t) => t.range !== undefined ? (t.range ? `range ${t.range}m` : '') : t.cap ? `${t.cap} slots` : t.speed ? `speed ${t.speed}` : t.dist ? `${t.dist}m beam` : '';
      html += `<div class="row"><div class="ico">${eq.icon}</div><div class="info">
        <div class="nm">${next ? next.name : eq.tiers[lvl].name}</div>
        <div class="lvl">${eq.name} · Level ${lvl}/${eq.tiers.length - 1} ${lvl ? `· now: ${eq.tiers[lvl].name} (${stat(eq.tiers[lvl])})` : ''}</div>
        <div class="ds">${next ? `${eq.desc} Next: ${stat(next)}` : 'Fully upgraded!'}</div></div>
        <div data-key="${key}">${buyButton(next?.price, next ? null : 'MAXED')}</div></div>`;
    }
    body.innerHTML = html;
    body.querySelectorAll('[data-key] .buy:not(.owned)').forEach((btn) => btn.onclick = () => {
      const key = btn.parentElement.dataset.key, next = EQUIPMENT[key].tiers[state.gear[key] + 1];
      if (!next || state.money < next.price) return;
      state.money -= next.price; state.gear[key]++;
      if (key === 'flashlight') lightOn = true;
      sfx.buy(); applyGear(); save(); toast(`${EQUIPMENT[key].icon} Bought <b>${next.name}</b>!`, '#ffc93c');
      renderTab('gear');
    });
    return;
  }
  if (tab === 'luck') {
    const next = LUCK_TIERS[state.luck + 1];
    const potionPrice = Math.round(POTION.baseCost * LOCATIONS[state.loc].mult);
    html += `<div class="row"><div class="ico">🍀</div><div class="info">
      <div class="nm">${next ? next.name : LUCK_TIERS[state.luck].name}</div>
      <div class="lvl">Lucky Charm · Level ${state.luck}/${LUCK_TIERS.length - 1} · Luck +${LUCK_TIERS[state.luck].luck}</div>
      <div class="ds">${next ? `Permanent luck boost to +${next.luck}. More rare, epic and legendary finds!` : 'Maximum luck reached!'}</div></div>
      <div id="buyCharm">${buyButton(next?.price, next ? null : 'MAXED')}</div></div>`;
    html += `<div class="row"><div class="ico">🧪</div><div class="info">
      <div class="nm">${POTION.name}</div>
      <div class="lvl">${state.potionLeft > 0 ? `Active · ${Math.ceil(state.potionLeft)}s left` : 'Temporary boost'}</div>
      <div class="ds">Doubles your luck (and adds +1) for ${POTION.duration}s. Stacks time! New loot spawns are luckier.</div></div>
      <div id="buyPotion">${buyButton(potionPrice, null)}</div></div>`;
    const odds = rarityOdds();
    html += `<div class="row" style="display:block"><div class="nm" style="margin-bottom:8px">Your current odds</div>
      ${RARITY_ORDER.map((r, i) => `<div style="display:flex;align-items:center;gap:10px;margin:4px 0">
        <span style="width:90px;color:${RARITIES[r].color};font-weight:800">${RARITIES[r].label}</span>
        <div style="flex:1;height:12px;background:rgba(255,255,255,.08);border-radius:6px;overflow:hidden"><div style="width:${(odds[i] * 100).toFixed(1)}%;height:100%;background:${RARITIES[r].color}"></div></div>
        <span style="width:52px;text-align:right">${(odds[i] * 100).toFixed(1)}%</span></div>`).join('')}</div>`;
    body.innerHTML = html;
    body.querySelector('#buyCharm .buy:not(.owned)')?.addEventListener('click', () => {
      const n = LUCK_TIERS[state.luck + 1]; if (!n || state.money < n.price) return;
      state.money -= n.price; state.luck++; sfx.buy(); updateHud(); save();
      toast(`🍀 Bought <b>${n.name}</b>! Luck +${n.luck}`, '#4ade80'); rerollSurface(); renderTab('luck');
    });
    body.querySelector('#buyPotion .buy')?.addEventListener('click', () => {
      if (state.money < potionPrice) return;
      state.money -= potionPrice; state.potionLeft += POTION.duration; sfx.buy(); updateHud(); save();
      toast('🧪 Luck potion active!', '#4ade80'); rerollSurface(); renderTab('luck');
    });
    return;
  }
  if (tab === 'travel') {
    for (const id of LOCATION_ORDER) {
      const L = LOCATIONS[id], owned = state.unlocked.includes(id), here = state.loc === id;
      html += `<div class="row"><div class="ico">${{ junkyard: '🚗', beach: '🏖️', city: '🌃', warehouse: '🏚️', museum: '🏛️' }[id]}</div><div class="info">
        <div class="nm">${L.name}</div><div class="lvl">Loot value x${L.mult}${L.dark > 0.7 ? ' · 🔦 very dark' : ''}</div><div class="ds">${L.desc}</div></div>
        <div data-loc="${id}">${here ? '<button class="buy owned" disabled>YOU\'RE HERE</button>' : owned ? '<button class="buy go">TRAVEL</button>' : buyButton(L.price, null, '🔓 ' + fmt(L.price))}</div></div>`;
    }
    body.innerHTML = html;
    body.querySelectorAll('[data-loc] .buy:not(.owned)').forEach((btn) => btn.onclick = () => {
      const id = btn.parentElement.dataset.loc, L = LOCATIONS[id];
      if (!state.unlocked.includes(id)) {
        if (state.money < L.price) return;
        state.money -= L.price; state.unlocked.push(id); sfx.buy();
        toast(`🗺️ Unlocked <b>${L.name}</b>!`, '#ffc93c');
      }
      closeStation(); loadLocation(id);
      toast(`Welcome to the <b>${L.name}</b>!`, '#ffc93c');
      if (L.dark > 0.7 && state.gear.flashlight === 0) toast('🔦 It\'s dark here... a flashlight would help!', '#ff9b9b');
    });
  }
}

// When luck changes, re-roll the far-away surface items so the boost is felt right away.
function rerollSurface() {
  const far = items.filter((it) => !it.buried && Math.hypot(it.x - player.pos.x, it.z - player.pos.z) > 15);
  for (const it of far.slice(0, Math.ceil(far.length / 2))) {
    removeItemVisual(it); items.splice(items.indexOf(it), 1); spawnItem(false);
  }
}

// ---------- Touch controls ----------

const stickVec = { x: 0, y: 0 };
if (isTouch) {
  let stickId = null, lookId = null, lx = 0, ly = 0;
  const stick = $('stick'), knob = $('knob');
  stick.addEventListener('touchstart', (e) => { stickId = e.changedTouches[0].identifier; e.preventDefault(); }, { passive: false });
  addEventListener('touchstart', (e) => {
    for (const t of e.changedTouches) {
      if (t.target.closest('#stick, .tbtn, .overlay')) continue;
      if (lookId === null) { lookId = t.identifier; lx = t.clientX; ly = t.clientY; }
    }
  }, { passive: true });
  addEventListener('touchmove', (e) => {
    for (const t of e.changedTouches) {
      if (t.identifier === stickId) {
        const r = stick.getBoundingClientRect();
        let dx = t.clientX - (r.left + r.width / 2), dy = t.clientY - (r.top + r.height / 2);
        const len = Math.hypot(dx, dy), max = r.width / 2;
        if (len > max) { dx *= max / len; dy *= max / len; }
        stickVec.x = dx / max; stickVec.y = dy / max;
        knob.style.transform = `translate(${dx}px, ${dy}px)`;
      } else if (t.identifier === lookId && playing && !menuOpen) {
        look(t.clientX - lx, t.clientY - ly, 0.005); lx = t.clientX; ly = t.clientY;
      }
    }
  }, { passive: true });
  const end = (e) => {
    for (const t of e.changedTouches) {
      if (t.identifier === stickId) { stickId = null; stickVec.x = stickVec.y = 0; knob.style.transform = ''; }
      if (t.identifier === lookId) lookId = null;
    }
  };
  addEventListener('touchend', end); addEventListener('touchcancel', end);
  const tap = (id, fn) => $(id).addEventListener('touchstart', (e) => { e.preventDefault(); e.stopPropagation(); fn(); }, { passive: false });
  tap('btnAct', interact);
  tap('btnLight', toggleLight);
  tap('btnSprint', () => { player.sprint = !player.sprint; $('btnSprint').style.background = player.sprint ? 'rgba(74,222,128,.5)' : ''; });
  tap('btnMenu', () => $('pause').classList.remove('hidden'));
}

// ---------- Main loop ----------

const clock = new THREE.Clock();
const radarCtx = $('radar').getContext('2d');
let beepTimer = 0, saveTimer = 0, hudTimer = 0;

function resolveCollisions(p) {
  for (const c of world.colliders) {
    const cx = Math.max(c.minX, Math.min(p.x, c.maxX));
    const cz = Math.max(c.minZ, Math.min(p.z, c.maxZ));
    const dx = p.x - cx, dz = p.z - cz, d = Math.hypot(dx, dz);
    if (d < RADIUS) {
      if (d > 1e-5) { p.x = cx + (dx / d) * RADIUS; p.z = cz + (dz / d) * RADIUS; }
      else {
        // Inside the box: push out along the shortest axis.
        const opts = [[c.minX - RADIUS - p.x, 0], [c.maxX + RADIUS - p.x, 0], [0, c.minZ - RADIUS - p.z], [0, c.maxZ + RADIUS - p.z]];
        opts.sort((a, b) => Math.abs(a[0] + a[1]) - Math.abs(b[0] + b[1]));
        p.x += opts[0][0]; p.z += opts[0][1];
      }
    }
  }
  const b = world.bounds;
  p.x = Math.max(b.minX, Math.min(b.maxX, p.x));
  p.z = Math.max(b.minZ, Math.min(b.maxZ, p.z));
}

function drawRadar(nearestBuried) {
  const sc = tier('scanner');
  if (!sc.range) return;
  const W = 180, C = W / 2, k = (C - 8) / sc.range;
  radarCtx.clearRect(0, 0, W, W);
  radarCtx.strokeStyle = 'rgba(74,222,128,.35)'; radarCtx.lineWidth = 1;
  for (const r of [0.33, 0.66, 1]) { radarCtx.beginPath(); radarCtx.arc(C, C, (C - 8) * r, 0, 7); radarCtx.stroke(); }
  const sweep = (clock.elapsedTime * 2) % (Math.PI * 2);
  radarCtx.fillStyle = 'rgba(74,222,128,.12)';
  radarCtx.beginPath(); radarCtx.moveTo(C, C); radarCtx.arc(C, C, C - 8, sweep, sweep + 0.5); radarCtx.fill();
  const cos = Math.cos(player.yaw), sin = Math.sin(player.yaw);
  const toRadar = (x, z) => {
    const dx = x - player.pos.x, dz = z - player.pos.z;
    const rx = dx * cos - dz * sin, rz = dx * sin + dz * cos;
    return [C + rx * k, C + rz * k, Math.hypot(dx, dz)];
  };
  for (const it of items) {
    if (it.buried && !sc.buried) continue;
    const [x, y, d] = toRadar(it.x, it.z);
    if (d > sc.range) continue;
    const col = sc.rarity ? RARITIES[it.rarity].color : '#ffe066';
    radarCtx.beginPath(); radarCtx.arc(x, y, it.buried ? 4 : 3.5, 0, 7);
    if (it.buried) { radarCtx.strokeStyle = col; radarCtx.lineWidth = 2; radarCtx.stroke(); }
    else { radarCtx.fillStyle = col; radarCtx.fill(); }
  }
  let [sx, sy, sd] = toRadar(world.station.x, world.station.z);
  if (sd > sc.range) { const a = Math.atan2(sy - C, sx - C); sx = C + Math.cos(a) * (C - 12); sy = C + Math.sin(a) * (C - 12); }
  radarCtx.fillStyle = '#4ade80'; radarCtx.font = 'bold 16px sans-serif'; radarCtx.textAlign = 'center'; radarCtx.textBaseline = 'middle';
  radarCtx.fillText('$', sx, sy);
  radarCtx.fillStyle = '#fff'; radarCtx.beginPath(); radarCtx.moveTo(C, C - 7); radarCtx.lineTo(C - 5, C + 5); radarCtx.lineTo(C + 5, C + 5); radarCtx.fill();
}

function tick() {
  requestAnimationFrame(tick);
  const dt = Math.min(clock.getDelta(), 0.05);
  const t = clock.elapsedTime;
  world.update(t, camera);

  const active = playing && !menuOpen && $('pause').classList.contains('hidden');
  let moving = false;
  if (active) {
    let mx = 0, mz = 0;
    if (keys.has('KeyW') || keys.has('ArrowUp')) mz -= 1;
    if (keys.has('KeyS') || keys.has('ArrowDown')) mz += 1;
    if (keys.has('KeyA') || keys.has('ArrowLeft')) mx -= 1;
    if (keys.has('KeyD') || keys.has('ArrowRight')) mx += 1;
    mx += stickVec.x; mz += stickVec.y;
    const len = Math.hypot(mx, mz);
    if (len > 0.05 && !digging) {
      if (len > 1) { mx /= len; mz /= len; }
      const sprint = keys.has('ShiftLeft') || keys.has('ShiftRight') || player.sprint;
      const speed = tier('shoes').speed * (sprint ? 1.6 : 1);
      const s = Math.sin(player.yaw), c = Math.cos(player.yaw);
      player.pos.x += (mx * c + mz * s) * speed * dt;
      player.pos.z += (-mx * s + mz * c) * speed * dt;
      player.bob += dt * speed * 1.6;
      moving = true;
    }
    resolveCollisions(player.pos);

    if (state.potionLeft > 0) {
      state.potionLeft = Math.max(0, state.potionLeft - dt);
      if (state.potionLeft === 0) toast('🧪 Luck potion wore off', '#aaa');
    }
  }

  if (!playing) player.yaw += dt * 0.08; // slow pan behind the title screen
  camera.position.set(player.pos.x, EYE + (moving ? Math.sin(player.bob) * 0.05 : 0), player.pos.z);
  camera.rotation.set(player.pitch, player.yaw, 0, 'YXZ');
  detectorModel.position.y = -0.36 + (moving ? Math.sin(player.bob * 0.5) * 0.015 : 0) + (digging ? Math.sin(t * 30) * 0.03 : 0);

  // Item animation
  for (const it of items) {
    if (!it.mesh) continue;
    const { inner, glow, beam, sparkles } = it.mesh.userData;
    inner.rotation.y += dt * 1.2;
    inner.position.y = 0.45 + Math.sin(t * 2 + it.phase) * 0.08;
    glow.position.y = inner.position.y;
    glow.material.opacity = 0.45 + Math.sin(t * 3 + it.phase) * 0.2;
    if (beam) beam.material.uniforms.time.value = t;
    if (sparkles) {
      const p = sparkles.geometry.attributes.position, n = sparkles.userData.n;
      for (let i = 0; i < n; i++) {
        const a = t * 0.9 + (i / n) * Math.PI * 2 + it.phase, k = (t * 0.4 + i / n) % 1;
        p.setXYZ(i, Math.cos(a) * 0.45, 0.1 + k * 1.2, Math.sin(a) * 0.45);
      }
      p.needsUpdate = true;
      sparkles.material.size = 0.12 + Math.sin(t * 6 + it.phase) * 0.05;
    }
  }
  for (let i = popAnims.length - 1; i >= 0; i--) {
    const p = popAnims[i]; p.t += dt;
    p.mesh.position.y = p.t * 3; p.mesh.scale.setScalar(Math.max(0.01, 1 + p.t * 2 - p.t * p.t * 6));
    p.mesh.rotation.y += dt * 10;
    if (p.t > 0.6) { scene.remove(p.mesh); popAnims.splice(i, 1); }
  }
  for (let i = respawnQueue.length - 1; i >= 0; i--) {
    if (t >= respawnQueue[i].at) { spawnItem(respawnQueue[i].buried); respawnQueue.splice(i, 1); }
  }

  // Interaction prompt
  if (active) {
    target = findTarget();
    const pr = $('prompt');
    const key = isTouch ? '<b>E</b> button' : '<b>E</b>';
    if (digging) pr.classList.add('hidden');
    else if (target?.type === 'station') { pr.innerHTML = `Press ${key} to Sell &amp; Shop`; pr.classList.remove('hidden'); }
    else if (target?.type === 'item') { pr.innerHTML = `Press ${key} to grab <span style="color:${RARITIES[target.item.rarity].color}">${target.item.name}</span>`; pr.classList.remove('hidden'); }
    else if (target?.type === 'dig') { pr.innerHTML = `📡 Something's buried here! Press ${key} to dig`; pr.classList.remove('hidden'); }
    else pr.classList.add('hidden');
  }

  // Digging
  if (digging) {
    digging.t += dt;
    $('digBar').classList.remove('hidden');
    $('digFill').style.width = `${Math.min(100, (digging.t / DIG_TIME) * 100)}%`;
    if (Math.random() < dt * 12) sfx.dig();
    if (!items.includes(digging.item)) digging = null;
    else if (digging.t >= DIG_TIME) { collect(digging.item, true); digging = null; }
  } else $('digBar').classList.add('hidden');

  // Metal detector
  let nearestBuried = null;
  if (state.gear.detector > 0) {
    const range = tier('detector').range;
    let nd = range;
    for (const it of items) {
      if (!it.buried) continue;
      const d = Math.hypot(it.x - player.pos.x, it.z - player.pos.z);
      if (d < nd) { nd = d; nearestBuried = it; }
    }
    const strength = nearestBuried ? 1 - nd / range : 0;
    $('detFill').style.width = `${strength * 100}%`;
    detectorModel.userData.led.material.color.setHSL(0.33 - strength * 0.33, 1, 0.5);
    if (active && strength > 0) {
      beepTimer -= dt;
      if (beepTimer <= 0) { sfx.beep(strength); beepTimer = 0.9 - strength * 0.82; }
    }
  }
  if (active) drawRadar(nearestBuried);

  hudTimer -= dt;
  if (hudTimer <= 0) { hudTimer = 0.5; updateHud(); }
  saveTimer -= dt;
  if (saveTimer <= 0) { saveTimer = 5; save(); }

  if (state.gfx === 'high') composer.render(); else renderer.render(scene, camera);
}

loadLocation(LOCATIONS[state.loc] && state.unlocked.includes(state.loc) ? state.loc : 'junkyard');
tick();

if (import.meta.env.DEV) window.__cq = { state, player, get items() { return items; }, loadLocation, openStation, interact, applyGear, updateHud };
