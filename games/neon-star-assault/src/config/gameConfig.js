// Central tuning file. Every gameplay / visual number that is worth tweaking lives here.

export const GAME_TITLE = 'NEON STAR ASSAULT';
export const GAME_SUBTITLE = 'Operação Véu Carmesim';

// ---------------------------------------------------------------- player
export const PLAYER = {
  lives: 3, // each life has a full hull (the ship's stats.maxHp)
  maxLives: 9,
  respawnDelay: 1.6, // seconds between losing a life and the ship reappearing
  respawnInvuln: 3, // blinking invulnerability after respawning
  startBombs: 2,
  maxBombs: 5,
  hitRadius: 0.55, // much smaller than the visual model on purpose
  bounds: { x: 14, y: 8 }, // playable area around the rail centre
  invulnAfterHit: 1.5,
  blinkRate: 16,
  dodge: { duration: 0.36, invuln: 0.42, cooldown: 1.35, speed: 44 },
  bank: { roll: 0.9, pitch: 0.32, yaw: 0.2 },
  aimMaxAngle: 0.14, // radians the shots can deviate from the rail direction (follows stick input)
};

// Selectable player ships (title screen). Models are Blender GLB exports, expected with front -Z
// and up +Y (`rotationY` turns a model exported the other way round). Sockets / engines are either
// node names of the GLB or [x, y, z] points in the GLB's own coordinates. If a model cannot be
// loaded, a procedural fallback ship is built so the game still runs.
// Optional per ship: `shot` overrides WEAPONS.shot, `colors` overrides the cyan shots / engines.
export const SHIPS = {
  lumen: {
    name: 'VX-9 LUMEN LANCE',
    role: 'Interceptador ágil',
    model: {
      url: 'assets/models/player_ship.glb',
      wingspan: 3.9, // world units the model is scaled to (hitbox is independent)
      envMapIntensity: 0.85,
      primarySockets: ['Muzzle_Nose_L_GLB', 'Muzzle_Nose_R_GLB'],
      dualSockets: ['Muzzle_Wing_L_GLB', 'Muzzle_Wing_R_GLB'],
      engineNodes: ['Labio do bocal_GLB', 'Labio do bocal.001_GLB'],
      engineRadius: 0.55, // nozzle radius in model units (sizes the generated flames)
    },
    stats: {
      maxHp: 3, // hull blocks per life
      moveSpeed: 21,
      accel: 9, // exponential damping rate towards target velocity
      decel: 6.5,
    },
  },
  vx04: {
    name: 'VX-04 LANCE',
    role: 'Caça pesado',
    model: {
      url: 'assets/models/vx04.glb',
      wingspan: 4.3,
      envMapIntensity: 1,
      primarySockets: ['muzzle_nose_L', 'muzzle_nose_R'],
      dualSockets: ['muzzle_wing_L', 'muzzle_wing_R'],
      engineNodes: ['thruster_L', 'thruster_R'],
      engineRadius: 0.64,
    },
    stats: {
      maxHp: 4,
      moveSpeed: 17.5,
      accel: 7.5,
      decel: 5.5,
    },
  },
  carrasco: {
    name: 'KZ-13 CARRASCO',
    role: 'Artilharia pesada',
    model: {
      url: 'assets/models/nave_pesada.glb',
      rotationY: Math.PI, // exported with the nose towards +Z
      wingspan: 4.7,
      envMapIntensity: 1.2,
      emissiveIntensity: 2.2, // the GLB's own 6 turns the whole stern into a bloom blob in chase view
      // no socket empties in this GLB: cannon mouths and engine outlet measured on the mesh
      primarySockets: [[-0.55, -0.7, 7.45], [0.55, -0.7, 7.45]],
      dualSockets: [[-5.4, -0.78, 6.05], [5.4, -0.78, 6.05]],
      engineNodes: [[-0.9, 0.35, -5.5], [0.9, 0.35, -5.5]],
      engineRadius: 0.42, // small flames: the wide engine grille of the model already glows
    },
    stats: {
      maxHp: 4,
      moveSpeed: 16.5,
      accel: 7,
      decel: 5.5,
    },
    // heavy cannons: slower, thicker bolts that hit twice as hard
    shot: {
      interval: 0.18,
      rapidInterval: 0.11,
      speed: 190,
      damage: 2,
      life: 1.6, // same reach as the fast bolts
      radius: 0.7,
      visualScale: 1.4,
      coreWhite: 0.1, // keeps the bolts clearly red under bloom
      pitch: 0.62,
    },
    colors: { shot: 0xff2e3e, dualShot: 0xff6a4a, engine: 0xff3a2a, flame: 'flameRed', glow: 'glowRed' },
  },
};
export const DEFAULT_SHIP = 'lumen';
export const MAX_SHIP_HP = Math.max(...Object.values(SHIPS).map((s) => s.stats.maxHp));

// ---------------------------------------------------------------- weapons
export const WEAPONS = {
  shot: {
    interval: 0.12,
    rapidInterval: 0.07,
    speed: 270,
    damage: 1,
    life: 1.15,
    radius: 0.45,
    dualAngle: 0.05,
    visualScale: 1, // bolt thickness on screen
    coreWhite: 0.45, // how much the bolt's core is washed towards white (bloom does the rest)
    pitch: 1, // sound pitch
  },
  charged: {
    holdDelay: 0.08, // hold the charge button this long before charging starts (ignores accidental taps)
    chargeTime: 1.0,
    minCharge: 0.3,
    damageMin: 6,
    damageMax: 18,
    aoeRadius: 6,
    aoeDamageFactor: 0.5,
    speed: 180,
    homingRate: 5,
    lockRange: 260,
    lockCone: 0.35, // cosine margin: dot(dir, forward) > 1 - lockCone
    scaleMin: 1.4,
    scaleMax: 3.4,
    life: 1.8,
  },
  bomb: {
    damage: 30,
    bossDamage: 22, // never an instant kill
    clearRadius: 140,
    cooldown: 1.2,
  },
};

export const ENEMY_BULLET = { speed: 34, radius: 0.5, life: 7, maxDistance: 420 };

// ---------------------------------------------------------------- power-ups
export const POWERUPS = {
  // rapid fire and dual cannon last for the whole life (lost when the ship is destroyed)
  rapidFire: { color: 0x33e6ff },
  dualCannon: { color: 0xff9a2e },
  ownedBonus: 1500, // points when picking up a weapon power-up already owned
  shield: { color: 0x5b8cff },
  repair: { color: 0x3dff8a },
  bomb: { color: 0xff3dd8 },
  multiplier: { duration: 15, factor: 2, color: 0xffd23d },
  radius: 1.8,
  dropChance: 0.07,
  lifeTime: 20,
};

// ---------------------------------------------------------------- scoring
export const SCORING = {
  ring: 1000,
  formationBonus: 1500,
  powerup: 500,
  repairFullBonus: 2500,
  noDamageInterval: 30,
  noDamageBonus: 5000,
  altRoute: 25000,
  stageClear: 20000,
  gameClear: 100000,
  hpBonus: 10000,
  lifeBonus: 25000, // per spare life when the game is cleared
  hullRegenEvery: 10000, // +1 hull point every N points
  extraLifeEvery: 50000, // +1 life every N points
  combo: { killsPerStep: 3, max: 8, decayDelay: 3, decayStep: 1.2 },
};

// ---------------------------------------------------------------- enemies
// Visual scale applied to enemy models; collision radii below are multiplied by it too.
export const ENEMY_MODEL_SCALE = 1.4;
export const ENEMIES = {
  scout: { hp: 2, score: 100, radius: 1.3, speed: 60, fireChance: 0.35 },
  interceptor: {
    hp: 6, score: 300, radius: 1.5, holdDistance: 70,
    burstCount: 3, burstInterval: 0.13, burstCooldown: 2.6, dodgeChance: 0.35, lifeTime: 12,
  },
  turret: { hp: 5, score: 250, radius: 1.9, fireInterval: 2.3, range: 230, minRange: 35 },
  heavy: {
    modelScale: 1.1,
    hp: 34, score: 1200, radius: 3.2, holdDistance: 95,
    shieldOn: 2.4, shieldOff: 3.6, fanCount: 7, fanSpread: 0.9, fireInterval: 2.7, lifeTime: 20,
  },
  mine: { hp: 2, score: 150, radius: 1.4, triggerRange: 13, fuse: 0.9, blastRadius: 6.5, damage: 2 },
  carrier: {
    modelScale: 1,
    hp: 45, score: 2000, radius: 4.6, holdDistance: 140,
    launchInterval: 4.6, launchWarn: 1.2, dronesPerLaunch: 3, lifeTime: 24,
  },
  phaseHunter: {
    hp: 14, score: 1500, radius: 1.7, holdDistance: 65,
    visibleTime: 2.4, fadeTime: 0.45, hiddenTime: 0.8, telegraphTime: 0.75, lifeTime: 22,
  },
  generator: { modelScale: 1.2, hp: 10, score: 800, radius: 2.3 },
  prismLancer: {
    hp: 12, score: 900, radius: 1.5, holdDistance: 85,
    fireInterval: 3.6, chargeTime: 0.9, splitDelay: 1.1, splitShots: 7, lifeTime: 16,
  },
};

// Destructible level obstacles: hit points, score and chance of dropping a power-up.
// Structural hazards (tunnel fans, security doors, towers in the lane, the boss's walls) stay indestructible.
export const OBSTACLES = {
  asteroid: { hpPerScale: 2.2, score: 80, dropChance: 0.18, damage: 1 }, // hp = scale * hpPerScale
  girder: { hp: 16, score: 250, dropChance: 0.35 },
  escapeDebris: { hp: 6, score: 200, dropChance: 0.2 },
  escapeGirder: { hp: 18, score: 300, dropChance: 0.3 },
  fallingChunk: { hp: 8, score: 250, dropChance: 0.3 },
  crystal: { hpPerScale: 2.4, score: 90, dropChance: 0.22, damage: 1 },
  hullFragment: { hpPerScale: 2.2, score: 90, dropChance: 0.2, damage: 1 },
  bridge: { hp: 22, score: 300, dropChance: 0.35 },
};

// ---------------------------------------------------------------- bosses
export const BOSSES = {
  nebulaWarden: {
    name: 'NEBULA WARDEN',
    distance: 50,
    scale: 1.15,
    coreHp: 230,
    cannonHp: 55,
    phase2CoreFraction: 0.72,
    phase3CoreFraction: 0.4,
    shieldWindow: 2.6,
    score: { cannon: 5000, core: 30000 },
  },
  crimsonArchitect: {
    name: 'THE CRIMSON ARCHITECT',
    distance: 70,
    towerHp: 45,
    eyeHp: 70,
    coreHp: 340,
    phase4CoreFraction: 0.5,
    overloadCountdown: 40,
    overloadRepeat: 25,
    score: { tower: 4000, eye: 8000, core: 60000 },
  },
  eclipseSovereign: {
    name: 'ECLIPSE SOVEREIGN',
    distance: 75,
    scale: 1,
    satelliteHp: 30,
    nodeHp: 60,
    coreHp: 340,
    pullSpeed: 3.2, // phase 3 gravity pull towards the singularity (units/s)
    sweepSafeRadius: 6, // horizon sweep beams leave this circle in the centre untouched
    score: { satellite: 3000, node: 6000, core: 80000 },
  },
  abyssalMatriarch: {
    name: 'ABYSSAL MATRIARCH',
    distance: 80,
    scale: 1.2,
    pylonHp: 38,
    nodeHp: 62,
    coreHp: 380,
    score: { pylon: 4000, node: 7000, core: 100000 },
  },
};

// ---------------------------------------------------------------- rail & camera
export const RAIL = {
  bossSpeed: 5,
  speedLerp: 1.2,
  escapeStartSpeed: 55,
  escapeEndSpeed: 125,
  escapeDuration: 30,
};

export const CAMERA = {
  fov: 68,
  near: 0.1,
  far: 4000,
  offsetY: 2.7,
  offsetZ: 11.5,
  follow: 0.5, // fraction of the ship offset the camera copies
  lookAhead: 34,
  lag: 7,
  rollFactor: 0.045,
  fovDodge: 9,
  fovSpeed: 0.08, // extra FOV per unit of rail speed above the stage base speed
  shakeMax: 1.1,
  shakeDecay: 1.7,
  showcaseLift: 3.7, // title screen: how far below the ship the orbit camera aims (raises it on screen)
};

// ---------------------------------------------------------------- post FX & look
export const BLOOM = {
  strength: 0.85,
  radius: 0.5,
  threshold: 0.72,
  maxBoost: 0.9,
  boostDecay: 2.5,
};

export const COLORS = {
  playerShot: 0x39f0ff,
  playerCharged: 0x9d5cff,
  playerEngine: 0x3ad8ff,
  reticle: 0x6dffb0,
  reticleLocked: 0xff4d6d,
  enemyShotStage1: 0xff8a1e,
  enemyShotStage2: 0xff3df0,
  enemyShotStage3: 0xffc23a, // warm amber reads best against the cold Stage 3 palette
  enemyShotStage4: 0x8aff3a, // acid green: the armada's colour, distinct from every player bolt
};

// ---------------------------------------------------------------- audio
export const AUDIO = { master: 0.7, sfx: 0.85, music: 0.4, muted: false };

// ---------------------------------------------------------------- difficulty
export const DIFFICULTY = {
  easy: { label: 'Fácil', enemyHp: 0.8, bulletSpeed: 0.85, fireRate: 0.7, bossHp: 0.8 },
  normal: { label: 'Normal', enemyHp: 1, bulletSpeed: 1, fireRate: 1, bossHp: 1 },
  hard: { label: 'Difícil', enemyHp: 1.25, bulletSpeed: 1.15, fireRate: 1.35, bossHp: 1.2 },
};
export const DEFAULT_DIFFICULTY = 'normal';

// ---------------------------------------------------------------- quality presets
export const QUALITY = {
  low: {
    label: 'Low',
    pixelRatio: 1,
    bloomScale: 0.35,
    bloomStrength: 0.7,
    maxParticles: 1500,
    maxDebris: 50,
    stars: 1800,
    skyboxSize: 512,
    dust: 250,
    drawDistance: 520,
    flashLights: 0,
    engineLights: 0,
    shadows: false,
    shadowMapSize: 0,
    chromatic: false,
  },
  medium: {
    label: 'Medium',
    pixelRatio: 1.25,
    bloomScale: 0.5,
    bloomStrength: 0.85,
    maxParticles: 4000,
    maxDebris: 120,
    stars: 4500,
    skyboxSize: 1024,
    dust: 600,
    drawDistance: 720,
    flashLights: 2,
    engineLights: 1,
    shadows: false,
    shadowMapSize: 0,
    chromatic: true,
  },
  high: {
    label: 'High',
    pixelRatio: 2,
    bloomScale: 1,
    bloomStrength: 0.9,
    maxParticles: 8000,
    maxDebris: 220,
    stars: 9000,
    skyboxSize: 2048,
    dust: 1100,
    drawDistance: 920,
    flashLights: 4,
    engineLights: 2,
    shadows: true,
    shadowMapSize: 1024,
    chromatic: true,
  },
};
export const DEFAULT_QUALITY = 'medium';

export const CHUNK_LENGTH = 100;
export const SETTINGS_STORAGE_KEY = 'neon-star-assault-settings';
