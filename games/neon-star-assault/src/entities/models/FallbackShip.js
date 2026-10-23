import * as THREE from 'three';

/**
 * Procedural stand-in for the player ship, used only if the GLB model cannot be loaded.
 * Returns the same template shape as AssetManager.preparePlayerShip().
 */
export function buildFallbackShip(assets) {
  const M = assets.materials;
  const G = assets.geometries;
  const group = new THREE.Group();

  const add = (geo, mat, pos, rot = [0, 0, 0], scale = [1, 1, 1]) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(...pos);
    m.rotation.set(...rot);
    m.scale.set(...scale);
    m.castShadow = true;
    group.add(m);
    return m;
  };

  add(G.cylinderHex, M.hullLight, [0, 0, 0.2], [Math.PI / 2, 0, 0], [0.45, 3.2, 0.32]);
  add(G.coneHex, M.hullLight, [0, 0, -2.2], [-Math.PI / 2, 0, 0], [0.45, 1.6, 0.32]);
  add(G.sphere, M.canopy, [0, 0.25, -0.9], [0, 0, 0], [0.28, 0.2, 0.7]);

  const wingShape = new THREE.Shape();
  wingShape.moveTo(0, 0.8);
  wingShape.lineTo(1.9, -0.9);
  wingShape.lineTo(1.9, -1.3);
  wingShape.lineTo(0, -1.1);
  const wingGeo = new THREE.ExtrudeGeometry(wingShape, { depth: 0.06, bevelEnabled: false });
  for (const side of [-1, 1]) {
    const wing = add(wingGeo, M.hull, [0.3 * side, -0.05, 0.4], [-Math.PI / 2, 0, 0], [side, 1, 1]);
    wing.rotation.z = side * 0.12;
    add(G.box, M.glowRed, [1.1 * side, 0, 0.1], [0, side * 0.7, 0], [0.05, 0.05, 1.3]);
    add(G.cylinder, M.hull, [0.65 * side, 0.05, 1.2], [Math.PI / 2, 0, 0], [0.26, 1.6, 0.26]);
  }

  const z = 2.05;
  return {
    group,
    scale: 1,
    length: 5,
    primarySockets: [new THREE.Vector3(-0.25, 0, -2.9), new THREE.Vector3(0.25, 0, -2.9)],
    dualSockets: [new THREE.Vector3(-1.3, 0, -0.6), new THREE.Vector3(1.3, 0, -0.6)],
    engines: [new THREE.Vector3(-0.65, 0.05, z), new THREE.Vector3(0.65, 0.05, z)],
    engineRadius: 0.22,
  };
}
