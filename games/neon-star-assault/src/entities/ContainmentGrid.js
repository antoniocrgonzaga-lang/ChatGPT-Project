import * as THREE from 'three';

// Beam lanes across the play area. Lanes are closer than a beam's reach (radius + ship hit
// radius), so the only safe spot is the cell where one vertical and one horizontal lane are left out.
const XS = [-12, -6, 0, 6, 12];
const YS = [-8, -4, 0, 4, 8];
const SPAN = 30; // beams reach well past the play area bounds
const COLOR = 0x7dff4a;
const INTENSITY = 0.4; // green blooms much more than the red / cyan beams of other stages

/**
 * "Containment grid" (Stage 4 mechanic): a lattice of vertical and horizontal beams on the player
 * plane (rail-local, so it travels with the ship and never sweeps through the camera) that leaves a
 * single free cell, outlined in green during the warning. Call update(dt) every frame until it returns true.
 */
export class ContainmentGrid {
  constructor(game, { warn = 1.7, fire = 0.8, radius = 1.6 } = {}) {
    this.game = game;
    this.t = 0;
    this.duration = warn + fire + 0.3;
    this.warn = warn;
    const ix = Math.floor(Math.random() * XS.length);
    const iy = Math.floor(Math.random() * YS.length);
    this.safe = new THREE.Vector2(XS[ix], YS[iy]);

    const point = (x, y) => new THREE.Vector3(x, y, -1);
    const beam = (a, b) => game.obstacles.fireBeam({ start: a, end: b, local: true, warn, fire, radius, color: COLOR, intensity: INTENSITY });
    XS.forEach((x, i) => i !== ix && beam(point(x, -SPAN), point(x, SPAN)));
    YS.forEach((y, i) => i !== iy && beam(point(-SPAN, y), point(SPAN, y)));

    // safe-cell outline: half the free gap between the neighbouring lanes (or the play-area edge)
    const gap = (lanes, i, edge) => {
      const lo = i > 0 ? lanes[i - 1] + 2.2 : -edge;
      const hi = i < lanes.length - 1 ? lanes[i + 1] - 2.2 : edge;
      return [(lo + hi) / 2, (hi - lo) / 2];
    };
    const [cx, hx] = gap(XS, ix, 14);
    const [cy, hy] = gap(YS, iy, 8);
    this.material = new THREE.LineBasicMaterial({ color: new THREE.Color(COLOR).multiplyScalar(2.2), transparent: true, depthTest: false });
    this.marker = new THREE.Group();
    const outer = new THREE.LineLoop(game.assets.geometries.squareLine, this.material);
    outer.scale.set(hx, hy, 1);
    const inner = new THREE.LineLoop(game.assets.geometries.squareLine, this.material);
    inner.scale.set(hx * 0.55, hy * 0.55, 1);
    this.inner = inner;
    this.half = new THREE.Vector2(hx, hy);
    this.marker.add(outer, inner);
    this.marker.renderOrder = 20;
    outer.renderOrder = inner.renderOrder = 20;
    this.marker.position.set(cx, cy, -1);
    game.rig.add(this.marker);
    game.hud.warning('GRADE DE CONTENÇÃO — VÁ PARA A CÉLULA VERDE', 1.6);
    game.audio.play('telegraph');
  }

  update(dt) {
    this.t += dt;
    const warning = this.t < this.warn;
    this.marker.visible = warning ? Math.sin(this.t * 16) > -0.4 : this.t < this.warn + 0.3;
    const k = 0.3 + 0.4 * ((this.t * 2.2) % 1); // inner square pulses towards the outline
    this.inner.scale.set(this.half.x * k, this.half.y * k, 1);
    if (this.t >= this.duration) {
      this.dispose();
      return true;
    }
    return false;
  }

  dispose() {
    this.marker.parent?.remove(this.marker);
    this.material.dispose();
  }
}
