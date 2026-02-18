// Tales of The Wanderer - Open World Survival 3D
// Main Game Logic with Three.js

const TILE_SIZE = 4;
const WORLD_SIZE = 60;
const SEED = 12345;

// Seeded random
function seededRandom(seed) {
  return function() {
    seed = (seed * 9301 + 49297) % 233280;
    return seed / 233280;
  };
}

const rand = seededRandom(SEED);

// Tile colors (upgraded - lebih hidup)
const TILES = {
  grass: 0x5a9c50,
  water: 0x3a7aaa,
  sand: 0xd4b584,
  forest: 0x3d6a3d,
  stone: 0x7a7a7a,
};

// Three.js
let scene, camera, renderer, clock;
let character;
let characterRoot;
let worldMesh;
let dirLight;
let resourceMeshes = [];
let worldData = [];
let resourcesData = [];

// Game settings
const PLAYER_SPEED = 2.5;           // Movement speed (lebih lambat, lebih natural)
const MOUSE_SENSITIVITY = 0.08;     // Camera look (lebih halus)

// Game state
let player = {
  x: 0, z: 0, y: 0,
  vx: 0, vz: 0,
  speed: PLAYER_SPEED,
  health: 100,
  maxHealth: 100,
  hunger: 100,
  maxHunger: 100,
  inventory: [0, 0, 0, 0],
  hasAxe: false,
};

let dayTime = 6;
let day = 1;
let keys = {};
let mouseX = 0, mouseY = 0;
let cameraAngle = 0;
let cameraHeight = 5;
let lastHungerTime = 0;
let lastHealthTime = 0;

// Create 3D character (upgraded - MeshStandardMaterial, shadows)
function createCharacter() {
  const root = new THREE.Group();
  const bodyMat = new THREE.MeshStandardMaterial({ color: 0x5a7a5a, roughness: 0.7, metalness: 0.1 });
  const skinMat = new THREE.MeshStandardMaterial({ color: 0xd4b894, roughness: 0.8, metalness: 0 });
  const legMat = new THREE.MeshStandardMaterial({ color: 0x4a6a4a, roughness: 0.7, metalness: 0.1 });

  const body = new THREE.Mesh(
    new THREE.CylinderGeometry(0.4, 0.45, 0.8, 12),
    bodyMat
  );
  body.position.y = 1;
  body.castShadow = true;
  root.add(body);

  const head = new THREE.Mesh(
    new THREE.SphereGeometry(0.35, 16, 16),
    skinMat
  );
  head.position.y = 1.9;
  head.castShadow = true;
  root.add(head);

  const legGeo = new THREE.CylinderGeometry(0.12, 0.14, 0.5, 8);
  const legL = new THREE.Mesh(legGeo, legMat);
  legL.position.set(-0.15, 0.5, 0);
  legL.castShadow = true;
  root.add(legL);
  const legR = new THREE.Mesh(legGeo, legMat);
  legR.position.set(0.15, 0.5, 0);
  legR.castShadow = true;
  root.add(legR);

  characterRoot = root;
  return root;
}

// Generate procedural world
function generateWorld() {
  const noise = [];
  for (let z = 0; z < WORLD_SIZE; z++) {
    noise[z] = [];
    for (let x = 0; x < WORLD_SIZE; x++) {
      const nx = x / WORLD_SIZE - 0.5;
      const nz = z / WORLD_SIZE - 0.5;
      const dist = Math.sqrt(nx * nx + nz * nz) * 2;
      const height = (rand() * 0.5 + rand() * 0.3 + rand() * 0.2) - dist * 0.5;
      const moisture = rand() * 0.5 + rand() * 0.5 - dist * 0.3;
      noise[z][x] = { height, moisture };
    }
  }

  worldData = [];
  resourcesData = [];

  for (let z = 0; z < WORLD_SIZE; z++) {
    worldData[z] = [];
    for (let x = 0; x < WORLD_SIZE; x++) {
      const { height, moisture } = noise[z][x];
      let tile = 'grass';
      let tileHeight = 0.3;
      if (height < -0.2) { tile = 'water'; tileHeight = 0.2; }
      else if (height < 0 && moisture > 0.4) { tile = 'sand'; tileHeight = 0.25; }
      else if (height > 0.3) { tile = 'stone'; tileHeight = 0.4 + height * 0.5; }
      else if (moisture > 0.5 && height > 0) { tile = 'forest'; tileHeight = 0.35 + height * 0.3; }
      else { tileHeight = 0.3 + height * 0.4; }
      worldData[z][x] = { tile, height: tileHeight };

      const t = worldData[z][x].tile;
      if (t === 'grass' && rand() < 0.03) resourcesData.push({ x, z, type: 'herb' });
      else if ((t === 'forest' || t === 'grass') && rand() < 0.08) resourcesData.push({ x, z, type: 'tree' });
      else if (t === 'stone' && rand() < 0.15) resourcesData.push({ x, z, type: 'rock' });
      else if (t === 'grass' && rand() < 0.02) resourcesData.push({ x, z, type: 'bush' });
    }
  }

  const spawnX = Math.floor(WORLD_SIZE / 2);
  const spawnZ = Math.floor(WORLD_SIZE / 2);
  for (let dz = -2; dz <= 2; dz++) {
    for (let dx = -2; dx <= 2; dx++) {
      const wx = spawnX + dx;
      const wz = spawnZ + dz;
      if (wx >= 0 && wx < WORLD_SIZE && wz >= 0 && wz < WORLD_SIZE) {
        if (worldData[wz][wx].tile === 'water') worldData[wz][wx].tile = 'grass';
      }
    }
  }
}

// Build 3D world mesh (upgraded - terrain dengan tinggi, material bagus)
function buildWorldMesh() {
  const materials = {};
  Object.keys(TILES).forEach(tile => {
    materials[tile] = new THREE.MeshStandardMaterial({
      color: TILES[tile],
      roughness: 0.85,
      metalness: 0.1,
      flatShading: false,
    });
  });
  materials.water = new THREE.MeshStandardMaterial({
    color: TILES.water,
    roughness: 0.2,
    metalness: 0.3,
    transparent: true,
    opacity: 0.9,
  });

  worldMesh = new THREE.Group();
  for (let z = 0; z < WORLD_SIZE; z++) {
    for (let x = 0; x < WORLD_SIZE; x++) {
      const data = worldData[z][x];
      const tile = data.tile;
      const h = data.height * TILE_SIZE;
      const geo = new THREE.BoxGeometry(TILE_SIZE, h, TILE_SIZE);
      const mesh = new THREE.Mesh(geo, materials[tile]);
      mesh.position.set(x * TILE_SIZE, h / 2, z * TILE_SIZE);
      mesh.receiveShadow = true;
      worldMesh.add(mesh);
    }
  }
  scene.add(worldMesh);
}

// Build resource meshes
function buildResourceMeshes() {
  resourceMeshes.forEach(m => { if (m.parent) m.parent.remove(m); m.geometry?.dispose(); });
  resourceMeshes = [];

  const resourceGeos = {
    herb: new THREE.CylinderGeometry(0, 0.3, 0.6, 6),
    tree: new THREE.CylinderGeometry(0.3, 0.5, 2, 8),
    rock: new THREE.DodecahedronGeometry(0.5, 0),
    bush: new THREE.SphereGeometry(0.4, 8, 6),
  };

  const resourceMats = {
    herb: new THREE.MeshStandardMaterial({ color: 0x8ac88a, roughness: 0.8, metalness: 0 }),
    tree: new THREE.MeshStandardMaterial({ color: 0x4a7a4a, roughness: 0.9, metalness: 0 }),
    rock: new THREE.MeshStandardMaterial({ color: 0x9a9a9a, roughness: 0.9, metalness: 0.1 }),
    bush: new THREE.MeshStandardMaterial({ color: 0x5a7aaa, roughness: 0.8, metalness: 0 }),
  };

  const resourceYOffset = { herb: 0.3, tree: 1, rock: 0.5, bush: 0.4 };
  resourcesData.forEach(r => {
    const mesh = new THREE.Mesh(resourceGeos[r.type].clone(), resourceMats[r.type].clone());
    const groundH = worldData[r.z][r.x].height * TILE_SIZE;
    const yOff = resourceYOffset[r.type] || 0.5;
    mesh.position.set(r.x * TILE_SIZE + TILE_SIZE/2, groundH + yOff, r.z * TILE_SIZE + TILE_SIZE/2);
    mesh.castShadow = true;
    mesh.userData = r;
    scene.add(mesh);
    resourceMeshes.push(mesh);
  });
}

// Get ground height at position
function getGroundHeight(wx, wz) {
  const tx = Math.floor(wx / TILE_SIZE);
  const tz = Math.floor(wz / TILE_SIZE);
  if (tx < 0 || tx >= WORLD_SIZE || tz < 0 || tz >= WORLD_SIZE) return 0;
  return worldData[tz][tx].height * TILE_SIZE;
}

// Check walkable
function isWalkable(wx, wz) {
  const tx = Math.floor(wx / TILE_SIZE);
  const tz = Math.floor(wz / TILE_SIZE);
  if (tx < 0 || tx >= WORLD_SIZE || tz < 0 || tz >= WORLD_SIZE) return false;
  return worldData[tz][tx].tile !== 'water';
}

// Get resource near position
function getResourceAt(px, pz) {
  const tx = Math.floor(px / TILE_SIZE);
  const tz = Math.floor(pz / TILE_SIZE);
  return resourcesData.find(r => {
    const dist = Math.hypot((r.x + 0.5) * TILE_SIZE - px, (r.z + 0.5) * TILE_SIZE - pz);
    return dist < TILE_SIZE * 1.5;
  });
}

// Harvest resource
function harvestResource(resource) {
  const idx = resourcesData.indexOf(resource);
  if (idx === -1) return false;

  const dist = Math.hypot(player.x - (resource.x + 0.5) * TILE_SIZE, player.z - (resource.z + 0.5) * TILE_SIZE);
  if (dist > TILE_SIZE * 1.5) return false;

  if (resource.type === 'tree' && !player.hasAxe) return false;
  if (resource.type === 'rock' && !player.hasAxe) return false;

  const mesh = resourceMeshes.find(m => m.userData === resource);
  if (mesh) { scene.remove(mesh); resourceMeshes = resourceMeshes.filter(m => m !== mesh); }
  resourcesData.splice(idx, 1);

  switch (resource.type) {
    case 'herb': player.inventory[0]++; break;
    case 'tree': player.inventory[1] += 2; break;
    case 'rock': player.inventory[2]++; break;
    case 'bush': player.inventory[3]++; break;
  }
  return true;
}

// Crafting
function craftCampfire() {
  if (player.inventory[1] >= 5) {
    player.inventory[1] -= 5;
    player.hunger = Math.min(player.maxHunger, player.hunger + 30);
    return true;
  }
  return false;
}

function craftAxe() {
  if (player.inventory[1] >= 3 && player.inventory[2] >= 2 && !player.hasAxe) {
    player.inventory[1] -= 3;
    player.inventory[2] -= 2;
    player.hasAxe = true;
    return true;
  }
  return false;
}

function eatFood() {
  if (player.inventory[3] > 0) {
    player.inventory[3]--;
    player.hunger = Math.min(player.maxHunger, player.hunger + 25);
    return true;
  }
  return false;
}

// UI
function updateUI() {
  document.getElementById('health-fill').style.width = (player.health / player.maxHealth * 100) + '%';
  document.getElementById('hunger-fill').style.width = (player.hunger / player.maxHunger * 100) + '%';
  const slots = document.querySelectorAll('.inv-slot');
  const labels = ['🌿', '🪵', '🪨', '🥩'];
  slots.forEach((s, i) => { s.textContent = labels[i] + ' ' + player.inventory[i]; });
  const h = Math.floor(dayTime);
  const m = Math.floor((dayTime % 1) * 60);
  const sun = dayTime >= 6 && dayTime < 18 ? '☀️' : '🌙';
  document.getElementById('time-display').textContent = `${sun} Day ${day} - ${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}`;
}

// Minimap
function renderMinimap() {
  const mm = document.getElementById('minimap');
  const size = 120;
  const scale = size / WORLD_SIZE;
  const c = document.createElement('canvas');
  c.width = size;
  c.height = size;
  const ctx = c.getContext('2d');
  for (let z = 0; z < WORLD_SIZE; z++) {
    for (let x = 0; x < WORLD_SIZE; x++) {
      const tile = worldData[z][x].tile;
      const col = TILES[tile] || 0x333333;
      ctx.fillStyle = '#' + col.toString(16).padStart(6, '0');
      ctx.fillRect(x * scale, z * scale, scale + 1, scale + 1);
    }
  }
  ctx.fillStyle = '#ff4444';
  ctx.beginPath();
  ctx.arc(player.x / TILE_SIZE * scale, player.z / TILE_SIZE * scale, 4, 0, Math.PI * 2);
  ctx.fill();
  mm.innerHTML = '';
  mm.appendChild(c);
}

// Tutorial
const TUTORIAL_STEPS = [
  { title: 'Selamat datang!', text: 'Kamu adalah seorang pengembara di dunia luas. Tujuanmu: bertahan hidup dan menjelajah.' },
  { title: 'Gerakan', text: 'Gunakan WASD untuk bergerak. Gerakkan mouse untuk melihat ke sekeliling.' },
  { title: 'Resources', text: 'Dekati herb (🌿), tree (🌲), rock (🪨), atau bush (🫐) lalu tekan E untuk mengumpulkan.' },
  { title: 'Bertahan hidup', text: 'Jaga Health dan Hunger. Makan food (🥩) dengan F. Craft Campfire untuk mengembalikan hunger.' },
  { title: 'Crafting', text: 'Buat Axe (3 kayu + 2 batu) untuk menebang pohon dan batu. Selamat menjelajah, pengembara!' },
];

function initTutorial() {
  const overlay = document.getElementById('tutorial-overlay');
  const textEl = document.getElementById('tutorial-text');
  const pageEl = document.getElementById('tutorial-page');
  let page = 0;

  function showStep() {
    const step = TUTORIAL_STEPS[page];
    document.getElementById('tutorial-title').textContent = step.title;
    textEl.textContent = step.text;
    pageEl.textContent = (page + 1) + ' / ' + TUTORIAL_STEPS.length;
    document.getElementById('tutorial-prev').disabled = page === 0;
    document.getElementById('tutorial-next').textContent = page === TUTORIAL_STEPS.length - 1 ? 'Selesai' : 'Selanjutnya →';
  }

  document.getElementById('tutorial-next').addEventListener('click', () => {
    if (page < TUTORIAL_STEPS.length - 1) {
      page++;
      showStep();
    } else {
      overlay.classList.add('hidden');
      localStorage.setItem('tales_wanderer_tutorial_done', '1');
    }
  });

  document.getElementById('tutorial-prev').addEventListener('click', () => {
    if (page > 0) { page--; showStep(); }
  });

  document.getElementById('tutorial-skip').addEventListener('click', () => {
    overlay.classList.add('hidden');
    localStorage.setItem('tales_wanderer_tutorial_done', '1');
  });

  showStep();
}

function showTutorialIfFirstTime() {
  if (!localStorage.getItem('tales_wanderer_tutorial_done')) {
    document.getElementById('tutorial-overlay').classList.remove('hidden');
    initTutorial();
  } else {
    document.getElementById('tutorial-overlay').classList.add('hidden');
  }
}

// Main init
function init() {
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x87ceeb);
  scene.fog = new THREE.Fog(0x87ceeb, 30, 200);

  camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 1000);
  camera.position.set(0, 10, 15);

  renderer = new THREE.WebGLRenderer({ canvas: document.getElementById('game-canvas'), antialias: true });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const hemiLight = new THREE.HemisphereLight(0x87ceeb, 0x5a7a4a, 0.6);
  scene.add(hemiLight);

  const ambient = new THREE.AmbientLight(0x404050, 0.4);
  scene.add(ambient);

  dirLight = new THREE.DirectionalLight(0xfff5e6, 1.2);
  dirLight.position.set(50, 100, 50);
  dirLight.castShadow = true;
  dirLight.shadow.mapSize.width = 2048;
  dirLight.shadow.mapSize.height = 2048;
  dirLight.shadow.camera.near = 0.5;
  dirLight.shadow.camera.far = 300;
  dirLight.shadow.camera.left = -80;
  dirLight.shadow.camera.right = 80;
  dirLight.shadow.camera.top = 80;
  dirLight.shadow.camera.bottom = -80;
  dirLight.shadow.bias = -0.0001;
  scene.add(dirLight);

  clock = new THREE.Clock();

  generateWorld();
  buildWorldMesh();
  buildResourceMeshes();

  character = createCharacter();
  scene.add(character);

  player.x = WORLD_SIZE / 2 * TILE_SIZE + TILE_SIZE / 2;
  player.z = WORLD_SIZE / 2 * TILE_SIZE + TILE_SIZE / 2;
  character.position.set(player.x, 0, player.z);

  lastHungerTime = clock.getElapsedTime();
  lastHealthTime = clock.getElapsedTime();

  document.addEventListener('keydown', e => {
    keys[e.code] = true;
    if (e.code === 'KeyF') eatFood();
    e.preventDefault();
  });
  document.addEventListener('keyup', e => { keys[e.code] = false; });

  document.addEventListener('mousemove', e => {
    mouseX = (e.clientX / window.innerWidth - 0.5) * 2;
    mouseY = (e.clientY / window.innerHeight - 0.5) * 2;
  });

  document.getElementById('craft-campfire').addEventListener('click', () => { craftCampfire(); document.getElementById('craft-campfire').blur(); });
  document.getElementById('craft-axe').addEventListener('click', () => { craftAxe(); document.getElementById('craft-axe').blur(); });

  setInterval(renderMinimap, 3000);

  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });

  showTutorialIfFirstTime();

  loop();
}

// Update & render
function update(dt) {
  const t = clock.getElapsedTime();

  cameraAngle -= mouseX * MOUSE_SENSITIVITY;
  cameraHeight = Math.max(3, Math.min(8, cameraHeight - mouseY * MOUSE_SENSITIVITY));
  mouseX *= 0.85;
  mouseY *= 0.85;

  player.vx = 0;
  player.vz = 0;
  if (keys['KeyW']) { player.vz -= Math.cos(cameraAngle); player.vx -= Math.sin(cameraAngle); }
  if (keys['KeyS']) { player.vz += Math.cos(cameraAngle); player.vx += Math.sin(cameraAngle); }
  if (keys['KeyA']) { player.vx -= Math.cos(cameraAngle); player.vz += Math.sin(cameraAngle); }
  if (keys['KeyD']) { player.vx += Math.cos(cameraAngle); player.vz -= Math.sin(cameraAngle); }

  if (player.vx !== 0 || player.vz !== 0) {
    const len = Math.hypot(player.vx, player.vz);
    player.vx = (player.vx / len) * player.speed * dt / 16;
    player.vz = (player.vz / len) * player.speed * dt / 16;

    const newX = player.x + player.vx;
    const newZ = player.z + player.vz;
    if (isWalkable(newX, player.z)) player.x = newX;
    if (isWalkable(player.x, newZ)) player.z = newZ;

    character.rotation.y = Math.atan2(-player.vx, -player.vz);
  }

  if (keys['KeyE']) {
    const res = getResourceAt(player.x, player.z);
    if (res) harvestResource(res);
  }

  if (t - lastHungerTime > 3) {
    lastHungerTime = t;
    player.hunger = Math.max(0, player.hunger - 2);
    if (player.hunger === 0 && t - lastHealthTime > 2) {
      lastHealthTime = t;
      player.health = Math.max(0, player.health - 5);
    }
  }

  dayTime += (dt / 1000) * (1 / 60); // 1 real min = 1 game hour (~24 min = full day)
  if (dayTime >= 24) { dayTime -= 24; day++; }

  const groundY = getGroundHeight(player.x, player.z);
  const camDist = 12;
  camera.position.x = player.x + Math.sin(cameraAngle) * camDist;
  camera.position.z = player.z + Math.cos(cameraAngle) * camDist;
  camera.position.y = groundY + cameraHeight;
  camera.lookAt(player.x, groundY + 1.5, player.z);

  const isNight = dayTime < 6 || dayTime >= 18;
  const sunAngle = (dayTime / 24) * Math.PI * 2 - Math.PI / 2;
  const sunX = Math.cos(sunAngle) * 100;
  const sunY = Math.max(10, Math.sin(sunAngle) * 80);
  const sunZ = Math.sin(sunAngle) * 100;
  dirLight.position.set(sunX, sunY, sunZ);
  const sunIntensity = isNight ? 0.2 : 0.8 + Math.max(0, Math.sin(sunAngle)) * 0.6;
  dirLight.intensity = sunIntensity;
  dirLight.color.setHex(isNight ? 0x6080a0 : 0xfff5e6);
  scene.background.setHex(isNight ? 0x0a0a1a : 0x87ceeb);
  scene.fog.color.setHex(isNight ? 0x0a0a1a : 0x87ceeb);
  scene.fog.near = isNight ? 20 : 30;
  scene.fog.far = isNight ? 120 : 200;

  const groundY = getGroundHeight(player.x, player.z);
  character.position.set(player.x, groundY, player.z);

  updateUI();
}

function loop() {
  const dt = Math.min(clock.getDelta() * 1000, 100);
  update(dt);
  renderer.render(scene, camera);
  requestAnimationFrame(loop);
}

// Start - pastikan DOM siap dan tombol bisa diklik
document.addEventListener('DOMContentLoaded', () => {
  const startBtn = document.getElementById('start-btn');
  const startScreen = document.getElementById('start-screen');
  if (startBtn && startScreen) {
    startBtn.addEventListener('click', () => {
      startScreen.classList.add('hidden');
      setTimeout(init, 800);
    });
  }
});
