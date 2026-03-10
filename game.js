/**
 * Tower Defense 3D — game.js
 * Engine: Three.js r128
 * Architecture: Single-file vanilla JS, no bundler needed
 */

// ============================================================
//  CONSTANTS & CONFIG
// ============================================================
const GRID_COLS   = 20;
const GRID_ROWS   = 14;
const TILE_SIZE   = 2;
const TOTAL_WAVES = 15;

const TOWER_DEFS = {
  gun: {
    name: 'Pistola', cost: 50, damage: 20, range: 5, fireRate: 1.2, // shots/sec
    color: 0x4a9eff, projectileColor: 0xaaddff, projectileSpeed: 18,
    splash: 0, upgradeCost: [75, 120], upgradeMult: [1.5, 2],
  },
  cannon: {
    name: 'Cañón', cost: 100, damage: 80, range: 6.5, fireRate: 0.4,
    color: 0xff5555, projectileColor: 0xff8800, projectileSpeed: 10,
    splash: 1.5, upgradeCost: [150, 225], upgradeMult: [1.6, 2.2],
  },
  laser: {
    name: 'Láser', cost: 150, damage: 12, range: 5.5, fireRate: 0, // continuous
    color: 0x44ff88, projectileColor: 0x00ffaa, projectileSpeed: 0,
    splash: 0, upgradeCost: [200, 300], upgradeMult: [1.5, 2],
    continuous: true,
  },
};

const ENEMY_DEFS = {
  grunt:  { name: 'Grunt',  hp: 100, speed: 2.2, armor: 0,    reward: 10, color: 0x66cc44, size: 0.35, lives: 1 },
  brute:  { name: 'Brute',  hp: 350, speed: 1.2, armor: 0.3,  reward: 25, color: 0xaa66ff, size: 0.55, lives: 3 },
  scout:  { name: 'Scout',  hp: 60,  speed: 4.0, armor: 0,    reward: 15, color: 0xffdd44, size: 0.28, lives: 1 },
};

// Waypoints define el camino (en coordenadas de grilla)
const WAYPOINTS_GRID = [
  { c: 0,  r: 2  },
  { c: 4,  r: 2  },
  { c: 4,  r: 6  },
  { c: 9,  r: 6  },
  { c: 9,  r: 1  },
  { c: 14, r: 1  },
  { c: 14, r: 10 },
  { c: 9,  r: 10 },
  { c: 9,  r: 7  },  // giro rápido adicional
  { c: 5,  r: 7  },  // no, corregir — mantener trazo limpio
  { c: 5,  r: 12 },
  { c: 19, r: 12 },
];

// ============================================================
//  GLOBALS
// ============================================================
let scene, camera, renderer, clock;
let orbitState  = { active: false, lastX: 0, lastY: 0 };
let panState    = { active: false, lastX: 0, lastY: 0 };

// Terreno
let gridTiles   = []; // 2D array [r][c]  → { mesh, type: 'path'|'build'|'blocked' }
let pathSet     = new Set(); // "r,c" strings that are on the path

// Entidades
let towers      = [];
let enemies     = [];
let projectiles = [];
let particles   = [];

// Selección / placemant
let selectedTowerType = null;  // 'gun'|'cannon'|'laser' — modo de colocación
let selectedTower     = null;  // objeto torre ya colocado
let rangeMesh         = null;  // círculo de rango visual

// Estado del juego
let gold   = 150;
let lives  = 20;
let wave   = 0;
let score  = 0;
let gameState = 'menu'; // 'menu' | 'playing' | 'between' | 'gameover' | 'win'
let gameSpeed = 1;

// Oleada
let waveQueue      = [];   // lista de spawns pendientes
let spawnTimer     = 0;
let betweenTimer   = 0;
const BETWEEN_TIME = 8;    // segundos entre oleadas

// Raycasting
const raycaster = new THREE.Raycaster();
const mouse     = new THREE.Vector2();

// ============================================================
//  INICIALIZACIÓN THREE.JS
// ============================================================
function initThree() {
  const canvas = document.getElementById('game-canvas');
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.setClearColor(0x0a0e1a);

  scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0x0a0e1a, 0.012);

  // Cámara
  camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.1, 300);
  camera.position.set(GRID_COLS * TILE_SIZE / 2, 22, GRID_ROWS * TILE_SIZE / 2 + 16);
  camera.lookAt(GRID_COLS * TILE_SIZE / 2, 0, GRID_ROWS * TILE_SIZE / 2);

  clock = new THREE.Clock();

  // Luces
  const ambientLight = new THREE.AmbientLight(0x223355, 0.8);
  scene.add(ambientLight);

  const sunLight = new THREE.DirectionalLight(0xfff4e0, 1.4);
  sunLight.position.set(20, 40, 15);
  sunLight.castShadow = true;
  sunLight.shadow.mapSize.width  = 2048;
  sunLight.shadow.mapSize.height = 2048;
  sunLight.shadow.camera.near = 0.5;
  sunLight.shadow.camera.far  = 120;
  sunLight.shadow.camera.left   = -40;
  sunLight.shadow.camera.right  =  40;
  sunLight.shadow.camera.top    =  40;
  sunLight.shadow.camera.bottom = -40;
  scene.add(sunLight);

  const hemiLight = new THREE.HemisphereLight(0x4488ff, 0x224411, 0.5);
  scene.add(hemiLight);

  // Skybox (plano de fondo gradiente)
  addSkybox();

  window.addEventListener('resize', onResize);
}

function addSkybox() {
  const geo = new THREE.SphereGeometry(200, 16, 16);
  const mat = new THREE.MeshBasicMaterial({
    color: 0x08122a,
    side: THREE.BackSide,
  });
  scene.add(new THREE.Mesh(geo, mat));

  // Estrellas
  const starGeo = new THREE.BufferGeometry();
  const starCount = 400;
  const positions = new Float32Array(starCount * 3);
  for (let i = 0; i < starCount; i++) {
    positions[i * 3]     = (Math.random() - 0.5) * 380;
    positions[i * 3 + 1] = Math.random() * 120 + 20;
    positions[i * 3 + 2] = (Math.random() - 0.5) * 380;
  }
  starGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  const starMat = new THREE.PointsMaterial({ color: 0xffffff, size: 0.3 });
  scene.add(new THREE.Points(starGeo, starMat));
}

function onResize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
}

// ============================================================
//  MAPA / GRILLA
// ============================================================
function gridToWorld(c, r) {
  return new THREE.Vector3(c * TILE_SIZE + TILE_SIZE / 2, 0, r * TILE_SIZE + TILE_SIZE / 2);
}

function buildMap() {
  // Computar qué celdas pertenecen al camino
  pathSet.clear();
  for (let i = 0; i < WAYPOINTS_GRID.length - 1; i++) {
    const a = WAYPOINTS_GRID[i];
    const b = WAYPOINTS_GRID[i + 1];
    // Línea recta horizontal o vertical
    if (a.c === b.c) {
      const minR = Math.min(a.r, b.r), maxR = Math.max(a.r, b.r);
      for (let r = minR; r <= maxR; r++) pathSet.add(`${r},${a.c}`);
    } else {
      const minC = Math.min(a.c, b.c), maxC = Math.max(a.c, b.c);
      for (let c = minC; c <= maxC; c++) pathSet.add(`${a.r},${c}`);
    }
  }

  // Crear tiles
  gridTiles = [];
  const groundMat   = new THREE.MeshLambertMaterial({ color: 0x1a3a1a });
  const pathMat     = new THREE.MeshLambertMaterial({ color: 0xb8a87a });
  const pathEdgeMat = new THREE.MeshLambertMaterial({ color: 0x9a8c60 });

  for (let r = 0; r < GRID_ROWS; r++) {
    gridTiles[r] = [];
    for (let c = 0; c < GRID_COLS; c++) {
      const isPath = pathSet.has(`${r},${c}`);
      const geo  = new THREE.BoxGeometry(TILE_SIZE - 0.04, isPath ? 0.15 : 0.1, TILE_SIZE - 0.04);
      const mat  = isPath ? pathMat : groundMat;
      const mesh = new THREE.Mesh(geo, mat);
      mesh.receiveShadow = true;

      const w = gridToWorld(c, r);
      mesh.position.set(w.x, isPath ? 0.07 : 0, w.z);
      mesh.userData = { gridC: c, gridR: r, type: isPath ? 'path' : 'build' };

      scene.add(mesh);
      gridTiles[r][c] = { mesh, type: mesh.userData.type };

      // Borde del camino
      if (isPath) {
        const edgeGeo = new THREE.BoxGeometry(TILE_SIZE, 0.04, TILE_SIZE);
        const edge = new THREE.Mesh(edgeGeo, pathEdgeMat);
        edge.position.set(w.x, 0.18, w.z);
        scene.add(edge);
      }
    }
  }

  // Rayas blancas en el camino (decoración)
  addPathMarkings();

  // Decoraciones
  addDecorations();

  // Base al final del camino
  addBase();
}

function addPathMarkings() {
  const mat = new THREE.MeshLambertMaterial({ color: 0xffffff, transparent: true, opacity: 0.25 });
  WAYPOINTS_GRID.forEach(wp => {
    const w = gridToWorld(wp.c, wp.r);
    const geo = new THREE.BoxGeometry(0.4, 0.22, 0.4);
    const m = new THREE.Mesh(geo, mat);
    m.position.set(w.x, 0.2, w.z);
    scene.add(m);
  });
}

function addDecorations() {
  const treeMat  = new THREE.MeshLambertMaterial({ color: 0x2d7a2d });
  const trunkMat = new THREE.MeshLambertMaterial({ color: 0x5a3c1a });
  const rockMat  = new THREE.MeshLambertMaterial({ color: 0x556677 });

  for (let r = 0; r < GRID_ROWS; r++) {
    for (let c = 0; c < GRID_COLS; c++) {
      if (!pathSet.has(`${r},${c}`) && Math.random() < 0.15) {
        const w = gridToWorld(c, r);
        const rnd = Math.random();
        if (rnd < 0.65) {
          // Árbol
          const trunkH = 0.6 + Math.random() * 0.4;
          const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.14, trunkH, 5), trunkMat);
          trunk.position.set(w.x + (Math.random()-0.5)*0.4, trunkH/2 + 0.1, w.z + (Math.random()-0.5)*0.4);
          trunk.castShadow = true;
          scene.add(trunk);

          const treeH = 0.7 + Math.random() * 0.5;
          const tree = new THREE.Mesh(new THREE.ConeGeometry(0.45, treeH, 6), treeMat);
          tree.position.set(trunk.position.x, trunk.position.y + trunkH/2 + treeH/2, trunk.position.z);
          tree.castShadow = true;
          scene.add(tree);
        } else {
          // Roca
          const sz = 0.2 + Math.random() * 0.25;
          const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(sz, 0), rockMat);
          rock.position.set(w.x + (Math.random()-0.5)*0.5, sz*0.6, w.z + (Math.random()-0.5)*0.5);
          rock.rotation.set(Math.random(), Math.random(), Math.random());
          rock.castShadow = true;
          scene.add(rock);
        }
      }
    }
  }
}

function addBase() {
  const last = WAYPOINTS_GRID[WAYPOINTS_GRID.length - 1];
  const w = gridToWorld(last.c, last.r);

  const baseMat = new THREE.MeshLambertMaterial({ color: 0x2255cc });
  const base = new THREE.Mesh(new THREE.BoxGeometry(3, 1, 3), baseMat);
  base.position.set(w.x + TILE_SIZE, 0.5, w.z);
  base.castShadow = true;
  scene.add(base);

  // Detalle: bandera
  const poleM = new THREE.MeshLambertMaterial({ color: 0xaaaaaa });
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 2, 6), poleM);
  pole.position.set(w.x + TILE_SIZE, 1.6, w.z);
  scene.add(pole);

  const flagM = new THREE.MeshLambertMaterial({ color: 0xff4444 });
  const flag = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.4, 0.05), flagM);
  flag.position.set(w.x + TILE_SIZE + 0.35, 2.35, w.z);
  scene.add(flag);
}

// ============================================================
//  TORRES
// ============================================================
function placeTower(gridC, gridR, type) {
  const def = TOWER_DEFS[type];
  if (gold < def.cost) return;

  const tile = gridTiles[gridR][gridC];
  if (!tile || tile.type !== 'build' || tile.occupied) return;

  gold -= def.cost;
  tile.occupied = true;
  tile.type = 'blocked';

  const group = new THREE.Group();
  const w = gridToWorld(gridC, gridR);
  group.position.set(w.x, 0, w.z);

  // Base de la torre
  const baseGeo = new THREE.CylinderGeometry(0.6, 0.7, 0.5, 8);
  const baseMat = new THREE.MeshLambertMaterial({ color: 0x334455 });
  const baseMesh = new THREE.Mesh(baseGeo, baseMat);
  baseMesh.position.y = 0.25;
  baseMesh.castShadow = true;
  group.add(baseMesh);

  // Torreta
  let turretMesh;
  if (type === 'gun') {
    const bodyGeo = new THREE.BoxGeometry(0.45, 0.6, 0.45);
    const body = new THREE.Mesh(bodyGeo, new THREE.MeshLambertMaterial({ color: def.color }));
    body.position.y = 0.8;
    body.castShadow = true;
    group.add(body);

    const barrelGeo = new THREE.CylinderGeometry(0.07, 0.07, 0.8, 6);
    const barrel = new THREE.Mesh(barrelGeo, new THREE.MeshLambertMaterial({ color: 0x2244aa }));
    barrel.rotation.x = Math.PI / 2;
    barrel.position.set(0, 0.92, 0.55);
    group.add(barrel);
    turretMesh = body;

  } else if (type === 'cannon') {
    const bodyGeo = new THREE.SphereGeometry(0.42, 8, 6);
    const body = new THREE.Mesh(bodyGeo, new THREE.MeshLambertMaterial({ color: def.color }));
    body.position.y = 0.9;
    body.castShadow = true;
    group.add(body);

    const barrelGeo = new THREE.CylinderGeometry(0.1, 0.14, 0.9, 8);
    const barrel = new THREE.Mesh(barrelGeo, new THREE.MeshLambertMaterial({ color: 0x882222 }));
    barrel.rotation.x = Math.PI / 2;
    barrel.position.set(0, 0.9, 0.55);
    group.add(barrel);
    turretMesh = body;

  } else { // laser
    const bodyGeo = new THREE.OctahedronGeometry(0.4, 0);
    const body = new THREE.Mesh(bodyGeo, new THREE.MeshLambertMaterial({ color: def.color }));
    body.position.y = 0.95;
    body.castShadow = true;
    group.add(body);
    turretMesh = body;
  }

  scene.add(group);

  const tower = {
    type, def, gridC, gridR, group,
    level: 1,
    damage: def.damage,
    range: def.range,
    fireRate: def.fireRate,
    fireCooldown: 0,
    target: null,
    laserLine: null,
    laserTimer: 0,
  };
  towers.push(tower);
  updateHUD();
  return tower;
}

function upgradeTower(tower) {
  const lvl = tower.level;
  if (lvl >= 3) return false;

  const cost = tower.def.upgradeCost[lvl - 1];
  if (gold < cost) return false;

  gold -= cost;
  const mult = tower.def.upgradeMult[lvl - 1];
  tower.damage   *= mult;
  tower.range    *= 1.1;
  tower.fireRate *= (tower.def.continuous ? 1 : 1.15);
  tower.level++;

  // Visual: añadir anillo de nivel
  addUpgradeRing(tower);
  updateHUD();
  updateSelectedTowerInfo();
  return true;
}

function sellTower(tower) {
  const lvl = tower.level;
  let totalInvested = tower.def.cost;
  if (lvl >= 2) totalInvested += tower.def.upgradeCost[0];
  if (lvl >= 3) totalInvested += tower.def.upgradeCost[1];

  gold += Math.floor(totalInvested * 0.6);
  scene.remove(tower.group);
  if (tower.laserLine) scene.remove(tower.laserLine);

  gridTiles[tower.gridR][tower.gridC].occupied = false;
  gridTiles[tower.gridR][tower.gridC].type = 'build';

  towers = towers.filter(t => t !== tower);
  deselectTower();
  updateHUD();
}

function addUpgradeRing(tower) {
  const colors = [0xffd700, 0xff8800, 0xff4400];
  const mat = new THREE.MeshLambertMaterial({ color: colors[tower.level - 2] });
  const geo = new THREE.TorusGeometry(0.65, 0.06, 6, 12);
  const ring = new THREE.Mesh(geo, mat);
  ring.position.y = 0.3 + (tower.level - 2) * 0.12;
  ring.rotation.x = Math.PI / 2;
  tower.group.add(ring);
}

// ============================================================
//  ENEMIGOS
// ============================================================
const WAYPOINTS_WORLD = WAYPOINTS_GRID.map(wp => gridToWorld(wp.c, wp.r));

function spawnEnemy(type) {
  const def = ENEMY_DEFS[type];
  const waveScale = 1 + (wave - 1) * 0.12;

  const group = new THREE.Group();
  const startWp = WAYPOINTS_WORLD[0];
  group.position.set(startWp.x - 3, 0, startWp.z);

  // Cuerpo
  const bodyGeo = new THREE.SphereGeometry(def.size, 8, 6);
  const bodyMat = new THREE.MeshLambertMaterial({ color: def.color });
  const body = new THREE.Mesh(bodyGeo, bodyMat);
  body.position.y = def.size + 0.05;
  body.castShadow = true;
  group.add(body);

  // Ojos
  const eyeGeo = new THREE.SphereGeometry(def.size * 0.22, 4, 4);
  const eyeMat = new THREE.MeshLambertMaterial({ color: 0xff2222 });
  [-0.12, 0.12].forEach(ox => {
    const eye = new THREE.Mesh(eyeGeo, eyeMat);
    eye.position.set(ox * (def.size / 0.35), def.size * 1.35, def.size * 0.85);
    group.add(eye);
  });

  // Barra de vida
  const hpBgGeo = new THREE.PlaneGeometry(0.8, 0.1);
  const hpBgMat = new THREE.MeshBasicMaterial({ color: 0x332222, depthTest: false });
  const hpBg = new THREE.Mesh(hpBgGeo, hpBgMat);
  hpBg.position.y = def.size * 2 + 0.35;
  hpBg.rotation.x = -Math.PI / 8;
  group.add(hpBg);

  const hpFillGeo = new THREE.PlaneGeometry(0.78, 0.08);
  const hpFillMat = new THREE.MeshBasicMaterial({ color: 0x44ff44, depthTest: false });
  const hpFill = new THREE.Mesh(hpFillGeo, hpFillMat);
  hpFill.position.set(0, 0, 0.001);
  hpBg.add(hpFill);

  scene.add(group);

  const maxHp = Math.round(def.hp * waveScale);
  const enemy = {
    type, def,
    hp: maxHp, maxHp,
    speed: def.speed,
    armor: def.armor,
    reward: def.reward,
    lives: def.lives,
    group,
    body,
    hpFill,
    waypointIndex: 0,
    dead: false,
    reached: false,
  };
  enemies.push(enemy);
}

function updateEnemies(dt) {
  for (const e of enemies) {
    if (e.dead || e.reached) continue;

    const wp = e.waypointIndex < WAYPOINTS_WORLD.length
      ? WAYPOINTS_WORLD[e.waypointIndex]
      : null;

    if (!wp) {
      // Llegó al final
      e.reached = true;
      lives = Math.max(0, lives - e.lives);
      scene.remove(e.group);
      updateHUD();
      if (lives <= 0) triggerGameOver();
      continue;
    }

    const pos = e.group.position;
    const dx = wp.x - pos.x;
    const dz = wp.z - pos.z;
    const dist = Math.sqrt(dx * dx + dz * dz);

    if (dist < 0.15) {
      e.waypointIndex++;
    } else {
      const spd = e.speed * dt;
      pos.x += (dx / dist) * spd;
      pos.z += (dz / dist) * spd;
      // Rotar hacia dirección de movimiento
      e.group.rotation.y = Math.atan2(dx, dz);
      // Bobbing animación
      e.group.position.y = Math.abs(Math.sin(Date.now() * 0.005 + e.waypointIndex)) * 0.06;
    }

    // Actualizar barra de HP — orientarla hacia cámara
    const hpRatio = e.hp / e.maxHp;
    e.hpFill.scale.x = hpRatio;
    e.hpFill.position.x = -(1 - hpRatio) * 0.39;
    const hpColor = hpRatio > 0.6 ? 0x44ff44 : hpRatio > 0.3 ? 0xffaa00 : 0xff3333;
    e.hpFill.material.color.setHex(hpColor);
    e.group.children.find(c => c === e.group.children[2]).lookAt(camera.position);
  }

  // Quitar muertos/alcanzados
  enemies = enemies.filter(e => !e.dead && !e.reached);
}

function damageEnemy(enemy, amount) {
  const effective = amount * (1 - enemy.armor);
  enemy.hp -= effective;
  if (enemy.hp <= 0) killEnemy(enemy);
}

function killEnemy(enemy) {
  enemy.dead = true;
  gold += enemy.reward;
  score += enemy.reward;
  updateHUD();

  // Partículas de muerte
  spawnParticles(enemy.group.position.clone().add(new THREE.Vector3(0, 0.4, 0)), enemy.def.color, 8);
  scene.remove(enemy.group);
}

// ============================================================
//  TORRES — IA DE DISPARO
// ============================================================
function updateTowers(dt) {
  for (const tower of towers) {
    // Buscar objetivo
    if (!tower.target || tower.target.dead || tower.target.reached) {
      tower.target = findTarget(tower);
    }

    const t = tower.target;

    if (!t) {
      // Apagar láser si no hay objetivo
      if (tower.laserLine) {
        scene.remove(tower.laserLine);
        tower.laserLine = null;
      }
      continue;
    }

    // Rotar torreta hacia el objetivo
    const ep = t.group.position;
    const tp = tower.group.position;
    tower.group.rotation.y = Math.atan2(ep.x - tp.x, ep.z - tp.z);

    if (tower.def.continuous) {
      // LÁSER continuo
      damageLaserTarget(tower, t, dt);
    } else {
      // Disparo periódico
      tower.fireCooldown -= dt;
      if (tower.fireCooldown <= 0) {
        fireTower(tower, t);
        tower.fireCooldown = 1 / tower.fireRate;
      }
    }
  }
}

function findTarget(tower) {
  let best = null, bestProgress = -1;
  const tp = tower.group.position;
  for (const e of enemies) {
    if (e.dead || e.reached) continue;
    const ep = e.group.position;
    const dx = ep.x - tp.x, dz = ep.z - tp.z;
    if (Math.sqrt(dx*dx + dz*dz) <= tower.range) {
      // Preferir el que más avanzó por el camino
      const progress = e.waypointIndex + e.group.position.distanceTo(WAYPOINTS_WORLD[Math.min(e.waypointIndex, WAYPOINTS_WORLD.length-1)]);
      if (progress > bestProgress) { bestProgress = progress; best = e; }
    }
  }
  return best;
}

function fireTower(tower, target) {
  const origin = tower.group.position.clone().add(new THREE.Vector3(0, 1, 0));
  const tPos   = target.group.position.clone().add(new THREE.Vector3(0, 0.4, 0));

  const geo = new THREE.SphereGeometry(tower.type === 'cannon' ? 0.2 : 0.1, 5, 4);
  const mat = new THREE.MeshBasicMaterial({ color: tower.def.projectileColor });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.copy(origin);
  scene.add(mesh);

  // Efecto de disparo: luz flash
  const flash = new THREE.PointLight(tower.def.projectileColor, 2, 3);
  flash.position.copy(origin);
  scene.add(flash);
  setTimeout(() => scene.remove(flash), 80);

  projectiles.push({
    mesh, tower,
    damage: tower.damage,
    splash: tower.def.splash,
    target,
    speed: tower.def.projectileSpeed,
    dead: false,
  });
}

function damageLaserTarget(tower, target, dt) {
  // Daño continuo
  damageEnemy(target, tower.damage * dt);

  // Dibujar rayo
  const origin = tower.group.position.clone().add(new THREE.Vector3(0, 1, 0));
  const tPos   = target.group.position.clone().add(new THREE.Vector3(0, 0.4, 0));

  if (tower.laserLine) scene.remove(tower.laserLine);

  const points = [origin, tPos];
  const lineGeo = new THREE.BufferGeometry().setFromPoints(points);
  const lineMat = new THREE.LineBasicMaterial({
    color: tower.def.projectileColor,
    linewidth: 3,
    transparent: true,
    opacity: 0.8 + Math.sin(Date.now() * 0.02) * 0.2,
  });
  tower.laserLine = new THREE.Line(lineGeo, lineMat);
  scene.add(tower.laserLine);
}

// ============================================================
//  PROYECTILES
// ============================================================
function updateProjectiles(dt) {
  for (const p of projectiles) {
    if (p.dead) continue;
    if (!p.target || p.target.dead || p.target.reached) {
      p.dead = true;
      scene.remove(p.mesh);
      continue;
    }

    const tPos = p.target.group.position.clone().add(new THREE.Vector3(0, 0.4, 0));
    const dir  = tPos.clone().sub(p.mesh.position).normalize();
    p.mesh.position.addScaledVector(dir, p.speed * dt);

    const dist = p.mesh.position.distanceTo(tPos);
    if (dist < 0.3) {
      // Impacto
      p.dead = true;
      scene.remove(p.mesh);

      if (p.splash > 0) {
        // Splash
        for (const e of enemies) {
          if (e.dead || e.reached) continue;
          const edist = e.group.position.distanceTo(tPos);
          if (edist <= p.splash) damageEnemy(e, p.damage * (1 - edist / p.splash * 0.5));
        }
        spawnParticles(tPos, 0xff8800, 12);
      } else {
        damageEnemy(p.target, p.damage);
        spawnParticles(tPos, 0xffdd88, 5);
      }
    }
  }
  projectiles = projectiles.filter(p => !p.dead);
}

// ============================================================
//  PARTÍCULAS
// ============================================================
function spawnParticles(position, color, count) {
  for (let i = 0; i < count; i++) {
    const geo = new THREE.SphereGeometry(0.07 + Math.random() * 0.07, 3, 3);
    const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 1 });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.copy(position);
    scene.add(mesh);

    const vel = new THREE.Vector3(
      (Math.random() - 0.5) * 4,
      Math.random() * 4 + 1,
      (Math.random() - 0.5) * 4
    );
    particles.push({ mesh, vel, life: 0.5 + Math.random() * 0.3 });
  }
}

function updateParticles(dt) {
  for (const p of particles) {
    p.life -= dt;
    p.vel.y -= 8 * dt;
    p.mesh.position.addScaledVector(p.vel, dt);
    p.mesh.material.opacity = Math.max(0, p.life / 0.8);
    if (p.life <= 0) scene.remove(p.mesh);
  }
  particles = particles.filter(p => p.life > 0);
}

// ============================================================
//  SISTEMA DE OLEADAS
// ============================================================
function buildWave(waveNum) {
  const queue = [];
  const scale = Math.max(1, waveNum - 1);

  let grunts  = 5 + waveNum * 2;
  let brutes  = waveNum >= 4 ? Math.floor((waveNum - 3) * 1.5) : 0;
  let scouts  = waveNum >= 7 ? Math.floor((waveNum - 6) * 2)   : 0;

  while (grunts + brutes + scouts > 0) {
    // Mezclar tipos aleatoriamente (preferencia grunt al inicio)
    const r = Math.random();
    if (scouts > 0 && r < 0.25) {
      queue.push('scout'); scouts--;
    } else if (brutes > 0 && r < 0.55) {
      queue.push('brute'); brutes--;
    } else if (grunts > 0) {
      queue.push('grunt'); grunts--;
    } else if (brutes > 0) {
      queue.push('brute'); brutes--;
    } else {
      queue.push('scout'); scouts--;
    }
  }
  return queue;
}

function startWave() {
  if (gameState !== 'playing' && gameState !== 'between') return;
  wave++;
  waveQueue = buildWave(wave);
  spawnTimer = 0;
  gameState = 'playing';
  document.getElementById('btn-start-wave').disabled = true;
  updateHUD();
}

function updateWaveSpawner(dt) {
  if (gameState !== 'playing') return;

  if (waveQueue.length > 0) {
    spawnTimer -= dt;
    if (spawnTimer <= 0) {
      const type = waveQueue.shift();
      spawnEnemy(type);
      const interval = Math.max(0.4, 0.85 - wave * 0.02);
      spawnTimer = interval;
    }
  } else if (enemies.length === 0 && projectiles.length === 0) {
    // Oleada completada
    if (wave >= TOTAL_WAVES) {
      triggerWin();
    } else {
      gameState = 'between';
      betweenTimer = BETWEEN_TIME;
      document.getElementById('btn-start-wave').disabled = false;
    }
  }
}

function updateBetween(dt) {
  if (gameState !== 'between') return;
  betweenTimer -= dt;
  const btn = document.getElementById('btn-start-wave');
  if (betweenTimer > 0) {
    btn.textContent = `▶ Siguiente (${Math.ceil(betweenTimer)}s)`;
  } else {
    btn.textContent = '▶ Iniciar Oleada';
    startWave();
  }
}

// ============================================================
//  RANGO VISUAL
// ============================================================
function showRange(worldX, worldZ, radius) {
  hideRange();
  const geo = new THREE.RingGeometry(radius - 0.08, radius, 48);
  const mat = new THREE.MeshBasicMaterial({ color: 0x88ccff, transparent: true, opacity: 0.5, side: THREE.DoubleSide });
  rangeMesh = new THREE.Mesh(geo, mat);
  rangeMesh.position.set(worldX, 0.15, worldZ);
  rangeMesh.rotation.x = -Math.PI / 2;
  scene.add(rangeMesh);
}

function hideRange() {
  if (rangeMesh) { scene.remove(rangeMesh); rangeMesh = null; }
}

// ============================================================
//  INPUT: CLICK EN EL MAPA
// ============================================================
function onCanvasClick(event) {
  if (gameState === 'menu') return;

  mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
  mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;

  raycaster.setFromCamera(mouse, camera);
  const meshes = gridTiles.flat().map(t => t.mesh).filter(Boolean);
  const hits = raycaster.intersectObjects(meshes);

  if (!hits.length) {
    deselectAll();
    return;
  }

  const hit = hits[0];
  const { gridC, gridR } = hit.object.userData;
  const tile = gridTiles[gridR][gridC];
  if (!tile) return;

  if (selectedTowerType) {
    // Modo colocación
    if (tile.type === 'build' && !tile.occupied) {
      const t = placeTower(gridC, gridR, selectedTowerType);
      // Mantener modo selección para colocar más (Shift) o deseleccionar
      deselectTowerType();
    }
  } else {
    // Buscar torre en esa celda
    const tower = towers.find(t => t.gridC === gridC && t.gridR === gridR);
    if (tower) {
      selectTower(tower);
    } else {
      deselectAll();
    }
  }
}

function selectTowerType(type) {
  selectedTowerType = type;
  selectedTower = null;
  document.querySelectorAll('.tower-card').forEach(c => c.classList.remove('selected'));
  document.getElementById(`tower-btn-${type}`).classList.add('selected');
  document.getElementById('tower-selected-info').style.display = 'none';
  document.getElementById('btn-sell').style.display = 'none';
}

function deselectTowerType() {
  selectedTowerType = null;
  document.querySelectorAll('.tower-card').forEach(c => c.classList.remove('selected'));
  hideRange();
}

function selectTower(tower) {
  deselectTowerType();
  selectedTower = tower;
  const w = gridToWorld(tower.gridC, tower.gridR);
  showRange(w.x, w.z, tower.range);
  updateSelectedTowerInfo();
  document.getElementById('btn-sell').style.display = 'block';
}

function deselectTower() {
  selectedTower = null;
  hideRange();
  document.getElementById('tower-selected-info').style.display = 'none';
  document.getElementById('btn-sell').style.display = 'none';
}

function deselectAll() {
  deselectTowerType();
  deselectTower();
}

function updateSelectedTowerInfo() {
  if (!selectedTower) return;
  const t = selectedTower;
  const info = document.getElementById('tower-selected-info');
  info.style.display = 'block';

  document.getElementById('tsi-name').textContent = t.def.name;
  document.getElementById('tsi-level').textContent = `Nivel ${t.level}/3`;
  document.getElementById('tsi-stats').innerHTML =
    `DMG: ${Math.round(t.damage)} | Rango: ${t.range.toFixed(1)}<br>` +
    (t.def.continuous ? `Continuo` : `Vel: ${t.fireRate.toFixed(1)}/s`);

  const btnUp = document.getElementById('btn-upgrade');
  if (t.level < 3) {
    const cost = t.def.upgradeCost[t.level - 1];
    btnUp.textContent = `⬆ Mejorar (${cost} 💰)`;
    btnUp.disabled = gold < cost;
  } else {
    btnUp.textContent = '✅ Nivel max';
    btnUp.disabled = true;
  }
}

// ============================================================
//  HUD
// ============================================================
function updateHUD() {
  document.getElementById('hud-gold').textContent  = gold;
  document.getElementById('hud-lives').textContent = lives;
  document.getElementById('hud-wave').textContent  = `${wave} / ${TOTAL_WAVES}`;

  // Actualizar accesibilidad de tarjetas de torre
  Object.keys(TOWER_DEFS).forEach(type => {
    const card = document.getElementById(`tower-btn-${type}`);
    if (gold < TOWER_DEFS[type].cost) card.classList.add('disabled-card');
    else card.classList.remove('disabled-card');
  });

  if (selectedTower) updateSelectedTowerInfo();
}

// ============================================================
//  CÁMARA ORBITAL
// ============================================================
function onMouseDown(e) {
  if (e.button === 2) {
    orbitState.active = true;
    orbitState.lastX = e.clientX;
    orbitState.lastY = e.clientY;
  } else if (e.button === 1) {
    panState.active = true;
    panState.lastX = e.clientX;
    panState.lastY = e.clientY;
    e.preventDefault();
  }
}

function onMouseMove(e) {
  // Tooltip
  if (gameState !== 'menu' && !selectedTowerType) {
    // simplificado: simplemente seguir cursor
    const tooltip = document.getElementById('tile-tooltip');
    tooltip.style.display = 'none';
  }

  if (orbitState.active) {
    const dx = (e.clientX - orbitState.lastX) * 0.005;
    const dy = (e.clientY - orbitState.lastY) * 0.005;
    orbitState.lastX = e.clientX;
    orbitState.lastY = e.clientY;

    const center = new THREE.Vector3(GRID_COLS * TILE_SIZE / 2, 0, GRID_ROWS * TILE_SIZE / 2);
    const offset = camera.position.clone().sub(center);

    // Rotar alrededor Y
    const theta = Math.atan2(offset.x, offset.z) - dx;
    const phi   = Math.max(0.15, Math.min(1.3, Math.atan2(Math.sqrt(offset.x*offset.x + offset.z*offset.z), offset.y) + dy));
    const r     = offset.length();

    offset.x = r * Math.sin(phi) * Math.sin(theta);
    offset.y = r * Math.cos(phi);
    offset.z = r * Math.sin(phi) * Math.cos(theta);

    camera.position.copy(center.clone().add(offset));
    camera.lookAt(center);
  }

  if (panState.active) {
    const dx = (e.clientX - panState.lastX) * 0.05;
    const dz = (e.clientY - panState.lastY) * 0.05;
    panState.lastX = e.clientX;
    panState.lastY = e.clientY;

    const right   = new THREE.Vector3(); camera.getWorldDirection(right); right.cross(camera.up).normalize();
    const forward = new THREE.Vector3(); camera.getWorldDirection(forward); forward.y = 0; forward.normalize();
    camera.position.addScaledVector(right,  -dx);
    camera.position.addScaledVector(forward, dz);
    const lookat = camera.position.clone().add(new THREE.Vector3().setFromSphericalCoords(1, Math.PI/3, 0));
    camera.lookAt(lookat);
  }
}

function onMouseUp()   { orbitState.active = false; panState.active = false; }
function onContextMenu(e) { e.preventDefault(); }

function onWheel(e) {
  const dir = new THREE.Vector3(); camera.getWorldDirection(dir);
  camera.position.addScaledVector(dir, -e.deltaY * 0.04);
}

function onKeyDown(e) {
  if (e.key === 'Escape') deselectAll();
}

// ============================================================
//  ESTADOS DE JUEGO
// ============================================================
function startGame() {
  gold  = 150;
  lives = 20;
  wave  = 0;
  score = 0;
  gameState = 'between';
  gameSpeed = 1;

  // Limpiar entidades anteriores
  [...towers].forEach(t => { scene.remove(t.group); if(t.laserLine) scene.remove(t.laserLine); });
  [...enemies].forEach(e => scene.remove(e.group));
  [...projectiles].forEach(p => scene.remove(p.mesh));
  [...particles].forEach(p => scene.remove(p.mesh));
  towers = []; enemies = []; projectiles = []; particles = [];

  // Liberar tiles
  for (let r=0; r<GRID_ROWS; r++)
    for (let c=0; c<GRID_COLS; c++)
      if (gridTiles[r][c]) { gridTiles[r][c].occupied = false; if(!pathSet.has(`${r},${c}`)) gridTiles[r][c].type = 'build'; }

  document.getElementById('overlay-start').style.display    = 'none';
  document.getElementById('overlay-gameover').style.display = 'none';
  document.getElementById('overlay-win').style.display      = 'none';
  document.getElementById('btn-start-wave').disabled = false;
  document.getElementById('btn-start-wave').textContent = '▶ Iniciar Oleada';

  updateHUD();
}

function triggerGameOver() {
  gameState = 'gameover';
  document.getElementById('go-wave-reached').textContent = `Llegaste a la oleada ${wave} de ${TOTAL_WAVES}`;
  document.getElementById('overlay-gameover').style.display = 'flex';
}

function triggerWin() {
  gameState = 'win';
  document.getElementById('overlay-win').style.display = 'flex';
}

// ============================================================
//  BINDEAR UI
// ============================================================
function bindUI() {
  document.getElementById('btn-play').addEventListener('click', startGame);
  document.getElementById('btn-restart').addEventListener('click', startGame);
  document.getElementById('btn-restart-win').addEventListener('click', startGame);

  document.getElementById('btn-start-wave').addEventListener('click', () => {
    if (gameState === 'between' || (gameState === 'playing' && wave === 0)) startWave();
  });

  document.getElementById('btn-speed').addEventListener('click', () => {
    gameSpeed = gameSpeed === 1 ? 2 : gameSpeed === 2 ? 3 : 1;
    document.getElementById('btn-speed').textContent = `⏩ ×${gameSpeed}`;
  });

  document.querySelectorAll('.tower-card').forEach(card => {
    card.addEventListener('click', () => {
      if (gameState !== 'playing' && gameState !== 'between') return;
      const type = card.dataset.type;
      if (selectedTowerType === type) deselectTowerType();
      else selectTowerType(type);
    });
  });

  document.getElementById('btn-sell').addEventListener('click', () => {
    if (selectedTower) sellTower(selectedTower);
  });

  document.getElementById('btn-upgrade').addEventListener('click', () => {
    if (selectedTower) upgradeTower(selectedTower);
  });

  const canvas = document.getElementById('game-canvas');
  canvas.addEventListener('click',       onCanvasClick);
  canvas.addEventListener('mousedown',   onMouseDown);
  canvas.addEventListener('mousemove',   onMouseMove);
  canvas.addEventListener('mouseup',     onMouseUp);
  canvas.addEventListener('wheel',       onWheel, { passive: true });
  canvas.addEventListener('contextmenu', onContextMenu);
  window.addEventListener('keydown',     onKeyDown);
}

// ============================================================
//  GAME LOOP
// ============================================================
function animate() {
  requestAnimationFrame(animate);

  const rawDt = Math.min(clock.getDelta(), 0.05);
  const dt    = (gameState === 'playing' ? rawDt * gameSpeed : rawDt);

  if (gameState === 'playing') {
    updateWaveSpawner(dt);
    updateEnemies(dt);
    updateTowers(dt);
    updateProjectiles(dt);
  }

  if (gameState === 'between' || gameState === 'playing') {
    updateBetween(dt);
  }

  updateParticles(dt);

  renderer.render(scene, camera);
}

// ============================================================
//  MAIN
// ============================================================
function main() {
  initThree();
  buildMap();
  bindUI();
  animate();
}

main();
