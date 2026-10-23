import * as THREE from 'three';
import { POWERUPS } from '../config/gameConfig.js';

export const POWERUP_TYPES = ['rapidFire', 'dualCannon', 'shield', 'repair', 'bomb', 'multiplier'];

const LABELS = {
  rapidFire: { text: 'R', name: 'RAPID FIRE' },
  dualCannon: { text: 'D', name: 'DUAL CANNON' },
  shield: { text: 'S', name: 'SHIELD' },
  repair: { text: '+', name: 'REPAIR CORE' },
  bomb: { text: 'B', name: 'ENERGY BOMB' },
  multiplier: { text: '×2', name: 'SCORE ×2' },
};

export function powerUpName(type) {
  return LABELS[type].name;
}

function labelTexture(text, color) {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const ctx = c.getContext('2d');
  ctx.font = 'bold 72px "Segoe UI", Arial, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineWidth = 10;
  ctx.strokeStyle = 'rgba(0,0,0,0.85)';
  ctx.strokeText(text, 64, 68);
  ctx.fillStyle = '#' + new THREE.Color(color).getHexString();
  ctx.fillText(text, 64, 68);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** Builds the distinct geometry for each power-up type. */
function buildVariant(type, assets) {
  const G = assets.geometries;
  const color = POWERUPS[type].color;
  const glow = new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(2.6) });
  const shell = new THREE.MeshStandardMaterial({ color: 0x151822, metalness: 0.8, roughness: 0.3 });
  const g = new THREE.Group();
  const mesh = (geo, mat, s, pos = [0, 0, 0], rot = [0, 0, 0]) => {
    const m = new THREE.Mesh(geo, mat);
    if (typeof s === 'number') m.scale.setScalar(s);
    else m.scale.set(...s);
    m.position.set(...pos);
    m.rotation.set(...rot);
    g.add(m);
    return m;
  };
  switch (type) {
    case 'rapidFire':
      mesh(G.octa, glow, [0.7, 1.1, 0.7]);
      mesh(G.octa, shell, [0.9, 0.4, 0.9]);
      break;
    case 'dualCannon':
      mesh(G.cylinderHex, glow, [0.25, 1.6, 0.25], [-0.45, 0, 0]);
      mesh(G.cylinderHex, glow, [0.25, 1.6, 0.25], [0.45, 0, 0]);
      mesh(G.box, shell, [1.4, 0.3, 0.5]);
      break;
    case 'shield':
      mesh(G.ico, glow, 0.7);
      mesh(G.torus, glow, 1.2, [0, 0, 0], [Math.PI / 2, 0, 0]);
      break;
    case 'repair':
      mesh(G.box, glow, [0.4, 1.4, 0.4]);
      mesh(G.box, glow, [1.4, 0.4, 0.4]);
      mesh(G.sphereLow, shell, 0.5);
      break;
    case 'bomb':
      mesh(G.sphere, glow, 0.65);
      mesh(G.torusThick, shell, 0.95, [0, 0, 0], [Math.PI / 2.4, 0, 0]);
      break;
    case 'multiplier':
      mesh(G.tetra, glow, 0.9);
      mesh(G.tetra, glow, 0.9, [0, 0, 0], [Math.PI, 0, 0]);
      break;
  }
  const label = new THREE.Sprite(new THREE.SpriteMaterial({ map: labelTexture(LABELS[type].text, color), transparent: true, depthWrite: false }));
  label.scale.setScalar(1.3);
  label.position.set(0, 1.7, 0);
  return { group: g, label, color: new THREE.Color(color) };
}

/** Floating collectible. One instance holds every variant and shows the requested one. */
export class PowerUp {
  constructor(game) {
    this.game = game;
    this.object = new THREE.Group();
    this.spinner = new THREE.Group();
    this.object.add(this.spinner);
    this.variants = {};
    for (const type of POWERUP_TYPES) {
      const v = buildVariant(type, game.assets);
      v.group.visible = false;
      v.label.visible = false;
      this.spinner.add(v.group);
      this.object.add(v.label);
      this.variants[type] = v;
    }
    this.aura = new THREE.Sprite(game.assets.spriteMaterial(0xffffff, 0.8));
    this.aura.scale.setScalar(4.5);
    this.object.add(this.aura);
    this.orbit = new THREE.Mesh(game.assets.geometries.ring, new THREE.MeshBasicMaterial({
      color: 0xffffff, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
    }));
    this.orbit.scale.setScalar(1.9);
    this.object.add(this.orbit);
    this.object.visible = false;
    this.local = new THREE.Vector3();
    this.alive = false;
    game.rig.add(this.object);
  }

  spawn(type, local, drift = 14) {
    for (const [t, v] of Object.entries(this.variants)) {
      v.group.visible = v.label.visible = t === type;
    }
    const v = this.variants[type];
    this.type = type;
    this.color = v.color;
    this.aura.material.color.copy(v.color).multiplyScalar(1.4);
    this.orbit.material.color.copy(v.color).multiplyScalar(1.5);
    this.local.copy(local);
    this.object.position.copy(local);
    this.drift = drift;
    this.t = 0;
    this.life = POWERUPS.lifeTime;
    this.alive = true;
    this.object.visible = true;
    this.particleTimer = 0;
  }

  update(dt) {
    this.t += dt;
    this.life -= dt;
    this.local.z += this.drift * dt;
    this.object.position.set(this.local.x, this.local.y + Math.sin(this.t * 3) * 0.4, this.local.z);
    this.spinner.rotation.y += dt * 2.2;
    this.spinner.rotation.x = Math.sin(this.t * 1.3) * 0.4;
    this.orbit.rotation.set(this.t * 1.7, this.t * 1.1, 0);
    const pulse = 1 + Math.sin(this.t * 6) * 0.12;
    this.aura.scale.setScalar(4.2 * pulse);
    this.particleTimer -= dt;
    if (this.particleTimer <= 0) {
      this.particleTimer = 0.08;
      this.object.getWorldPosition(_w);
      this.game.effects.trail(_w.set(_w.x + (Math.random() - 0.5) * 2, _w.y + (Math.random() - 0.5) * 2, _w.z + (Math.random() - 0.5) * 2), this.color, 0.7, 0.5);
    }
    if (this.local.z > 16 || this.life <= 0) this.release();
  }

  release() {
    this.alive = false;
    this.object.visible = false;
  }
}

const _w = new THREE.Vector3();
