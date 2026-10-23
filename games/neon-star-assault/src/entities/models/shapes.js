import * as THREE from 'three';

/*
 * Geometry helpers for ship models. Conventions: ships face -Z, +Y is up, +X is right.
 * Outlines are given in TOP view as [x, forward] pairs (forward = towards -Z).
 */

/**
 * Flat hull extruded from a top-view outline, thickness along Y, bevelled edges.
 * `points` must be listed counter-clockwise when seen from above (x right, forward up).
 */
export function hullFromOutline(points, thickness, bevel = 0.08, bevelSegments = 2) {
  const shape = new THREE.Shape();
  points.forEach(([x, f], i) => (i ? shape.lineTo(x, f) : shape.moveTo(x, f)));
  shape.closePath();
  const depth = Math.max(0.001, thickness - bevel * 2);
  const geo = new THREE.ExtrudeGeometry(shape, {
    depth,
    bevelEnabled: bevel > 0,
    bevelThickness: bevel,
    bevelSize: bevel,
    bevelSegments,
    curveSegments: 4,
  });
  // shape Y (forward) -> -Z, extrusion Z -> +Y, then centre the thickness on y = 0
  geo.rotateX(-Math.PI / 2);
  geo.translate(0, -depth / 2, 0);
  geo.computeVertexNormals();
  return geo;
}

/**
 * Symmetric outline: give the right half (x >= 0) from nose to tail; returns the full loop.
 * Points on the centre line (x = 0) appear once. Winding does not matter for extrusion.
 */
export function symmetricOutline(rightHalf) {
  const pts = rightHalf.map(([x, f]) => [-x, f]); // left side, nose -> tail
  for (let i = rightHalf.length - 1; i >= 0; i--) {
    const [x, f] = rightHalf[i];
    if (x !== 0) pts.push([x, f]); // right side, tail -> nose
  }
  return pts;
}

/**
 * Body of revolution along Z (engines, pods, fuselages).
 * `profile` = [[radius, z], ...] from the back (+Z) to the front (-Z).
 */
export function latheAlongZ(profile, segments = 12) {
  const pts = profile.map(([r, z]) => new THREE.Vector2(Math.max(r, 0.0001), -z));
  const geo = new THREE.LatheGeometry(pts, segments);
  // lathe axis is +Y: map +Y -> -Z so "front" points forward
  geo.rotateX(-Math.PI / 2);
  geo.computeVertexNormals();
  return geo;
}

/** Thin blade / fin from a side-view outline ([forward, up] pairs), thickness along X. */
export function finFromOutline(points, thickness = 0.06) {
  const shape = new THREE.Shape();
  points.forEach(([f, u], i) => (i ? shape.lineTo(f, u) : shape.moveTo(f, u)));
  shape.closePath();
  const geo = new THREE.ExtrudeGeometry(shape, { depth: thickness, bevelEnabled: false });
  // shape X (forward) -> -Z, shape Y -> +Y, extrusion -> X
  geo.rotateY(Math.PI / 2);
  geo.translate(-thickness / 2, 0, 0);
  geo.computeVertexNormals();
  return geo;
}

/** Straight emissive strip between two points (box stretched along the segment). */
export function stripBetween(a, b, width = 0.06, height = 0.04) {
  const va = new THREE.Vector3(...a);
  const vb = new THREE.Vector3(...b);
  const len = va.distanceTo(vb);
  const geo = new THREE.BoxGeometry(width, height, len);
  const mid = va.clone().add(vb).multiplyScalar(0.5);
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), vb.clone().sub(va).normalize());
  geo.applyQuaternion(q);
  geo.translate(mid.x, mid.y, mid.z);
  return geo;
}

/** Standard engine nacelle profile (back nozzle flare, body, tapered intake). */
export function nacelle(radius, length, segments = 12) {
  const r = radius;
  const l = length;
  return latheAlongZ(
    [
      [r * 0.7, l * 0.5],
      [r * 1.08, l * 0.46],
      [r, l * 0.35],
      [r, -l * 0.2],
      [r * 0.8, -l * 0.42],
      [r * 0.45, -l * 0.5],
    ],
    segments,
  );
}
