// CALA LUNA — city: the whole procedural island, built from one seed.
// A street grid over five districts, beach and harbor to the south,
// buildings with lit windows, palms, streetlights, landmarks, stunt
// ramps and the bay. The city also answers the two questions the rest
// of the game keeps asking: which district is this, and is anything in
// the way. The build order is fixed: the seeded random stream is
// consumed in the same sequence every run, so a seed always grows the
// same city.

import * as THREE from 'three';
import { WORLD, DISTRICTS, SHOPS, STUNTS } from './config.js';
import { makeRng, pick, pickN, range, rangeInt, chance, gaussRange } from './random.js';

const FACADE_COLORS = [0xd8c49a, 0xc9a06c, 0xb08a5e, 0x9db3c8, 0xc98d7a, 0xa8b89a, 0xd9c9a3, 0x8fa3b8];

// A flat plane lying on the ground (rotation.x = -PI/2).
function groundPlane(parent, w, d, mat, x, y, z, shadow = false) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), mat);
  m.rotation.x = -Math.PI / 2;
  m.position.set(x, y, z);
  if (shadow) m.receiveShadow = true;
  parent.add(m);
  return m;
}

// A box mesh: geometry, material, position, parent, optional shadows.
function boxAt(parent, w, h, d, mat, x, y, z, shadow = false) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z);
  if (shadow) {
    m.castShadow = true;
    m.receiveShadow = true;
  }
  parent.add(m);
  return m;
}

export class City {
  constructor(scene, seed) {
    this.scene = scene;
    this.seed = seed;
    this.rng = makeRng(seed);
    this.colliders = []; // {x0,z0,x1,z1} building footprints
    this.streetXs = [];
    this.streetZs = [];
    this.landmarks = {};
    this.group = new THREE.Group();
    scene.add(this.group);
    this._build();
  }

  districtAt(x, z) {
    for (const d of DISTRICTS) {
      if (x >= d.x0 && x < d.x1 && z >= d.z0 && z < d.z1) return d;
    }
    return DISTRICTS[0];
  }

  // Push a circle (x,z,r) out of every building footprint it overlaps.
  // Checks ALL colliders: stopping at the first hit left the circle
  // inside a second overlapping footprint (common where a landmark
  // sits next to a tall block).
  resolveCollision(pos, radius) {
    let hit = false;
    for (const b of this.colliders) {
      if (this._pushOutOf(pos, radius, b)) hit = true;
    }
    // World bounds
    const m = WORLD.halfSize;
    pos.x = Math.max(-m, Math.min(m, pos.x));
    pos.z = Math.max(-m, Math.min(WORLD.waterZ - 6, pos.z));
    return hit;
  }

  // Push the circle out of one footprint. Returns true on overlap.
  _pushOutOf(pos, radius, b) {
    const cx = Math.max(b.x0, Math.min(pos.x, b.x1));
    const cz = Math.max(b.z0, Math.min(pos.z, b.z1));
    const dx = pos.x - cx;
    const dz = pos.z - cz;
    const d2 = dx * dx + dz * dz;
    if (d2 >= radius * radius) return false;
    if (d2 > 1e-6) {
      const d = Math.sqrt(d2);
      pos.x = cx + (dx / d) * radius;
      pos.z = cz + (dz / d) * radius;
      return true;
    }
    // Centre inside the footprint: push out along the shallowest
    // penetration axis. Pushing always +x used to shove the player
    // through the far wall of a deep building — or into the next block.
    const px0 = pos.x - b.x0;
    const px1 = b.x1 - pos.x;
    const pz0 = pos.z - b.z0;
    const pz1 = b.z1 - pos.z;
    if (Math.min(px0, px1) < Math.min(pz0, pz1)) {
      pos.x = px0 < px1 ? b.x0 - radius : b.x1 + radius;
    } else {
      pos.z = pz0 < pz1 ? b.z0 - radius : b.z1 + radius;
    }
    return true;
  }

  // Snap a point to the nearest street centreline (used by traffic).
  nearestStreet(x, z) {
    let bx = this.streetXs[0];
    let bz = this.streetZs[0];
    for (const s of this.streetXs) {
      if (Math.abs(s - x) < Math.abs(bx - x)) bx = s;
    }
    for (const s of this.streetZs) {
      if (Math.abs(s - z) < Math.abs(bz - z)) bz = s;
    }
    return { x: bx, z: bz };
  }

  // A building facade: base colour with a grid of windows, some lit.
  _windowTexture(base, litRatio) {
    const c = document.createElement('canvas');
    c.width = 64;
    c.height = 128;
    const g = c.getContext('2d');
    g.fillStyle = base;
    g.fillRect(0, 0, 64, 128);
    for (let y = 6; y < 124; y += 12) {
      for (let x = 5; x < 60; x += 11) {
        const lit = this.rng() < litRatio;
        g.fillStyle = lit ? '#ffd98a' : 'rgba(20,26,38,0.85)';
        g.fillRect(x, y, 7, 8);
      }
    }
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }

  // Asphalt with a dashed centre line, tiled along each road.
  _roadTexture() {
    const c = document.createElement('canvas');
    c.width = 64;
    c.height = 64;
    const g = c.getContext('2d');
    g.fillStyle = '#23262b';
    g.fillRect(0, 0, 64, 64);
    g.fillStyle = 'rgba(255,255,255,0.05)';
    for (let i = 0; i < 40; i++) {
      g.fillRect(this.rng() * 64, this.rng() * 64, 2, 2);
    }
    g.fillStyle = '#e8d98a';
    g.fillRect(30, 4, 4, 22);
    g.fillRect(30, 38, 4, 22);
    const tex = new THREE.CanvasTexture(c);
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }

  // Build order is load-bearing for the seeded layout: each section
  // consumes the random stream in turn, so the sections run in a fixed
  // sequence and stay in it.
  _build() {
    this._groundAndWater();
    this._roadGrid();
    this._intersections();
    this._blocks();
    this._palms();
    this._streetlights();
    this._landmarks();
    this._ramps();
    this._beachfront();
    this._harbor();
    this._hills();
  }

  // Grass base, beach sand and the bay to the south.
  _groundAndWater() {
    const half = WORLD.halfSize;
    groundPlane(
      this.group, half * 2 + 200, half * 2 + 260,
      new THREE.MeshLambertMaterial({ color: 0x8a9a6a }), 0, -0.05, 40, true,
    );
    groundPlane(
      this.group, half * 2 + 200, 60,
      new THREE.MeshLambertMaterial({ color: 0xe6d3a3 }), 0, 0.0, WORLD.beachZ + 20, true,
    );
    this.water = new THREE.Mesh(
      new THREE.PlaneGeometry(half * 2 + 400, 200),
      new THREE.MeshPhongMaterial({ color: 0x2e7f9e, shininess: 120, transparent: true, opacity: 0.88 }),
    );
    this.water.rotation.x = -Math.PI / 2;
    this.water.position.set(0, 0.15, WORLD.waterZ + 90);
    this.group.add(this.water);
  }

  // Streets: every block step, both directions.
  _roadGrid() {
    const half = WORLD.halfSize;
    const block = WORLD.block;
    const roadTex = this._roadTexture();
    const roadMat = new THREE.MeshLambertMaterial({ map: roadTex });
    for (let s = -half; s <= half; s += block) {
      this.streetXs.push(s);
      this.streetZs.push(s);
      const rx = new THREE.Mesh(new THREE.PlaneGeometry(half * 2, WORLD.roadWidth), roadMat.clone());
      rx.material.map = roadTex.clone();
      rx.material.map.repeat.set(half * 2 / 16, 1);
      rx.material.map.needsUpdate = true;
      rx.rotation.x = -Math.PI / 2;
      rx.position.set(0, 0.02, s);
      rx.receiveShadow = true;
      this.group.add(rx);
      const rz = new THREE.Mesh(new THREE.PlaneGeometry(WORLD.roadWidth, half * 2), roadMat.clone());
      rz.material.map = roadTex.clone();
      rz.material.map.repeat.set(1, half * 2 / 16);
      rz.material.map.needsUpdate = true;
      rz.rotation.x = -Math.PI / 2;
      // No rotation.z: with rotation.x alone the plane's long axis maps
      // to world z (an avenue). An extra rotation.z = PI/2 would turn
      // it back into a street along x and the city would have no
      // north-south roads at all.
      rz.position.set(s, 0.02, 0);
      rz.receiveShadow = true;
      this.group.add(rz);
    }
  }

  // Sidewalks and crosswalks at every intersection.
  _intersections() {
    const walkMat = new THREE.MeshLambertMaterial({ color: 0xb8b0a0 });
    const crossMat = new THREE.MeshBasicMaterial({ color: 0xe8e4d8 });
    for (const sx of this.streetXs) {
      for (const sz of this.streetZs) {
        if (sz > WORLD.beachZ) continue;
        for (let i = -2; i <= 2; i++) {
          groundPlane(this.group, 2.2, 9, crossMat, sx + i * 2.8, 0.04, sz - WORLD.roadWidth / 2 - 2);
        }
        groundPlane(this.group, 20, 20, walkMat, sx + 14, 0.01, sz + 14, true);
      }
    }
  }

  // Buildings: one per block, taller downtown. Heights use a bell
  // curve, not a flat spread, so most blocks read mid-rise and only a
  // few towers break the skyline. Some lots become pocket parks.
  _blocks() {
    const rng = this.rng;
    const half = WORLD.halfSize;
    const block = WORLD.block;
    const facades = FACADE_COLORS.map((c) => new THREE.MeshLambertMaterial({
      map: this._windowTexture('#' + c.toString(16).padStart(6, '0'), 0.25),
    }));
    const roofMat = new THREE.MeshLambertMaterial({ color: 0x4a4238 });
    const trunkMat = new THREE.MeshLambertMaterial({ color: 0x6a4a2a });
    const crownMat = new THREE.MeshLambertMaterial({ color: 0x4a8f3f });
    for (let bx = -half + block / 2; bx < half; bx += block) {
      for (let bz = -half + block / 2; bz < WORLD.beachZ - 10; bz += block) {
        if (chance(rng, 0.12)) {
          this._pocketPark(bx, bz, trunkMat, crownMat);
          continue;
        }
        this._blockTower(bx, bz, facades, roofMat);
      }
    }
  }

  // An empty lot becomes a pocket park: a few trees, no collider, so
  // the block stays walkable.
  _pocketPark(bx, bz, trunkMat, crownMat) {
    const rng = this.rng;
    const trees = rangeInt(rng, 2, 4);
    for (let t = 0; t < trees; t++) {
      const tx = bx + range(rng, -18, 18);
      const tz = bz + range(rng, -18, 18);
      const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.6, 5, 5), trunkMat);
      trunk.position.set(tx, 2.5, tz);
      trunk.castShadow = true;
      this.group.add(trunk);
      const crown = new THREE.Mesh(new THREE.ConeGeometry(3.2, 7, 6), crownMat);
      crown.position.set(tx, 8, tz);
      crown.castShadow = true;
      this.group.add(crown);
    }
  }

  // One building: a lit-window slab, a roof cap, an optional rooftop
  // box for silhouette variety, and its collision footprint.
  _blockTower(bx, bz, facades, roofMat) {
    const rng = this.rng;
    const d = this.districtAt(bx, bz);
    const downtown = d.id === 'downtown';
    const h = downtown ? gaussRange(rng, 40, 95) : gaussRange(rng, 12, 42);
    const w = range(rng, 22, 40);
    const dep = range(rng, 22, 40);
    const mat = pick(rng, facades);
    boxAt(this.group, w, h, dep, mat, bx, h / 2, bz, true);
    boxAt(this.group, w + 1, 1.2, dep + 1, roofMat, bx, h + 0.6, bz);
    this.colliders.push({ x0: bx - w / 2, z0: bz - dep / 2, x1: bx + w / 2, z1: bz + dep / 2 });
    if (chance(rng, 0.3)) {
      boxAt(this.group, 4, 4, 4, roofMat, bx + range(rng, -8, 8), h + 3, bz + range(rng, -8, 8));
    }
  }

  // Palm trees along the beach and marina, plus a scatter inland.
  _palms() {
    const rng = this.rng;
    const trunkMat = new THREE.MeshLambertMaterial({ color: 0x7a5a3a });
    const leafMat = new THREE.MeshLambertMaterial({ color: 0x3f8f4f });
    const spots = [];
    for (let x = -320; x <= 320; x += 22) {
      spots.push([x + range(rng, -6, 6), WORLD.beachZ - 8 + range(rng, -4, 4)]);
    }
    for (let i = 0; i < 40; i++) {
      spots.push([range(rng, -320, 320), range(rng, -320, 280)]);
    }
    for (const [x, z] of spots) this._palm(x, z, trunkMat, leafMat);
  }

  _palm(x, z, trunkMat, leafMat) {
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.8, 9, 5), trunkMat);
    trunk.position.set(x, 4.5, z);
    trunk.castShadow = true;
    this.group.add(trunk);
    for (let k = 0; k < 5; k++) {
      const leaf = new THREE.Mesh(new THREE.ConeGeometry(1.6, 6, 4), leafMat);
      const a = (k / 5) * Math.PI * 2;
      leaf.position.set(x + Math.cos(a) * 2.2, 10, z + Math.sin(a) * 2.2);
      leaf.rotation.z = Math.cos(a) * 1.1;
      leaf.rotation.x = -Math.sin(a) * 1.1;
      leaf.castShadow = true;
      this.group.add(leaf);
    }
  }

  // Streetlights along every other street.
  _streetlights() {
    const poleMat = new THREE.MeshLambertMaterial({ color: 0x3a3f46 });
    const lampMat = new THREE.MeshBasicMaterial({ color: 0xffe9a8 });
    for (const sx of this.streetXs) {
      for (let z = -300; z <= 280; z += 120) {
        const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.35, 9, 5), poleMat);
        pole.position.set(sx + 9, 4.5, z);
        this.group.add(pole);
        const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.7, 6, 5), lampMat);
        lamp.position.set(sx + 9, 9.2, z);
        this.group.add(lamp);
      }
    }
  }

  // Landmarks: bank (Downtown), vault (Harbor), safehouse, gun shop, garage.
  _landmarks() {
    this._landmark('bank', 90, -150, 0x8a7a5a, 'MERIDIAN BANK');
    this._landmark('vault', 270, 60, 0x6a7a8a, 'HARBOR VAULT');
    this._landmark('safehouse', -30, 150, 0xa8c69a, 'SAFEHOUSE');
    this._landmark('gunshop', -150, -30, 0x9a8a6a, 'IRON & OAK');
    this._landmark('garage', 90, 210, 0x7a9ab0, 'WRENCH GARAGE');
  }

  _landmark(id, x, z, color, label) {
    boxAt(this.group, 26, 14, 20, new THREE.MeshLambertMaterial({ color }), x, 7, z, true);
    boxAt(this.group, 22, 3, 1, new THREE.MeshBasicMaterial({ color: 0xffe9a8 }), x, 15.5, z - 10.5);
    this.colliders.push({ x0: x - 13, z0: z - 10, x1: x + 13, z1: z + 10 });
    this.landmarks[id] = { x, z, label };
  }

  // Stunt ramps, tilted toward the jump.
  _ramps() {
    const rampMat = new THREE.MeshLambertMaterial({ color: 0xd8b13a });
    for (const s of STUNTS) {
      const ramp = boxAt(this.group, 8, 1, 12, rampMat, s.ramp[0], 1.5, s.ramp[1]);
      ramp.rotation.x = -0.45;
      ramp.castShadow = true;
    }
  }

  // Beach boardwalk: planks along the sand, three lifeguard towers at
  // distinct spots, and umbrellas for the bathers who never come.
  _beachfront() {
    const rng = this.rng;
    const half = WORLD.halfSize;
    const plankMat = new THREE.MeshLambertMaterial({ color: 0x9a7a4a });
    groundPlane(this.group, half * 2 + 200, 8, plankMat, 0, 0.03, WORLD.beachZ - 6, true);
    const towerMat = new THREE.MeshLambertMaterial({ color: 0xe8e4d8 });
    const towerRoofMat = new THREE.MeshLambertMaterial({ color: 0xd43a2f });
    for (const tx of pickN(rng, [-240, -160, -80, 0, 80, 160, 240], 3)) {
      this._lifeguardTower(tx, plankMat, towerMat, towerRoofMat);
    }
    const umbrellaCols = [0xd43a2f, 0x2f6fd0, 0xf2c230, 0x4a8f3f, 0x7a2fd0];
    for (let i = 0; i < 10; i++) {
      const ux = -300 + i * 66 + range(rng, -12, 12);
      const uz = WORLD.beachZ + 8 + range(rng, -4, 10);
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 2.6, 5), plankMat);
      pole.position.set(ux, 1.3, uz);
      this.group.add(pole);
      const canopy = new THREE.Mesh(
        new THREE.ConeGeometry(2.2, 0.9, 8),
        new THREE.MeshLambertMaterial({ color: pick(rng, umbrellaCols) }),
      );
      canopy.position.set(ux, 2.8, uz);
      canopy.castShadow = true;
      this.group.add(canopy);
    }
  }

  _lifeguardTower(tx, plankMat, towerMat, towerRoofMat) {
    const tower = new THREE.Group();
    for (const [lx, lz] of [[-1.4, -1.4], [1.4, -1.4], [-1.4, 1.4], [1.4, 1.4]]) {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.35, 4, 0.35), plankMat);
      leg.position.set(lx, 2, lz);
      tower.add(leg);
    }
    const cabin = boxAt(tower, 4, 2.6, 3.6, towerMat, 0, 5.3, 0);
    cabin.castShadow = true;
    const roof = new THREE.Mesh(new THREE.ConeGeometry(3.4, 1.6, 4), towerRoofMat);
    roof.position.y = 7.4;
    roof.rotation.y = Math.PI / 4;
    tower.add(roof);
    tower.position.set(tx, 0, WORLD.beachZ - 2);
    this.group.add(tower);
  }

  // Harbor: piers, crates, boats.
  _harbor() {
    const rng = this.rng;
    const pierMat = new THREE.MeshLambertMaterial({ color: 0x6a5a48 });
    for (let i = 0; i < 3; i++) {
      boxAt(this.group, 6, 1.5, 60, pierMat, 180 + i * 60, 0.6, WORLD.beachZ + 35);
    }
    const crateMat = new THREE.MeshLambertMaterial({ color: 0xb06a3a });
    for (let i = 0; i < 26; i++) {
      const c = boxAt(
        this.group, 4, 4, 4, crateMat,
        range(rng, 170, 310), 2, range(rng, 240, 300),
      );
      c.rotation.y = rng() * Math.PI;
      c.castShadow = true;
    }
    this._boat(210, WORLD.beachZ + 70, 0xd8d8d8);
    this._boat(300, WORLD.beachZ + 80, 0x3a6ad8);
  }

  _boat(x, z, color) {
    boxAt(this.group, 6, 2.5, 16, new THREE.MeshLambertMaterial({ color }), x, 0.8, z);
    boxAt(this.group, 4, 2.5, 6, new THREE.MeshLambertMaterial({ color: 0xf0ead8 }), x, 3, z - 1);
  }

  // Distant hills to the north for skyline depth.
  _hills() {
    const rng = this.rng;
    const hillMat = new THREE.MeshLambertMaterial({ color: 0x6a7a5a });
    for (let i = 0; i < 7; i++) {
      const hill = new THREE.Mesh(
        new THREE.ConeGeometry(range(rng, 60, 110), range(rng, 40, 80), 7),
        hillMat,
      );
      hill.position.set(-350 + i * 120, 0, -420 + range(rng, -30, 30));
      this.group.add(hill);
    }
  }

  update(dt, time) {
    if (this.water) {
      this.water.position.y = 0.15 + Math.sin(time * 0.5) * 0.12;
      // Gentle shimmer: the bay breathes with the swell.
      this.water.material.opacity = 0.85 + Math.sin(time * 0.8) * 0.05;
    }
  }
}
