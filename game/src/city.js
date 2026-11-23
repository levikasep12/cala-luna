// CALA LUNA — city: builds the whole procedural city from a seed.
// Grid streets, five districts, beach and harbor, palms, streetlights,
// the bank, the vault, ramps and the safehouse. Also answers collisions
// (building AABBs) and district lookups for the HUD and territory.

import * as THREE from 'three';
import { WORLD, DISTRICTS, SHOPS, STUNTS } from './config.js';
import { makeRng, pick, range, rangeInt, chance, gauss } from './random.js';

const PALETTE = [0xd8c49a, 0xc9a06c, 0xb08a5e, 0x9db3c8, 0xc98d7a, 0xa8b89a, 0xd9c9a3, 0x8fa3b8];

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
      const cx = Math.max(b.x0, Math.min(pos.x, b.x1));
      const cz = Math.max(b.z0, Math.min(pos.z, b.z1));
      const dx = pos.x - cx, dz = pos.z - cz;
      const d2 = dx * dx + dz * dz;
      if (d2 < radius * radius) {
        hit = true;
        if (d2 > 1e-6) {
          const d = Math.sqrt(d2);
          pos.x = cx + (dx / d) * radius;
          pos.z = cz + (dz / d) * radius;
        } else {
          pos.x = b.x1 + radius;
        }
      }
    }
    // World bounds
    const m = WORLD.halfSize;
    pos.x = Math.max(-m, Math.min(m, pos.x));
    pos.z = Math.max(-m, Math.min(WORLD.waterZ - 6, pos.z));
    return hit;
  }

  nearestStreet(x, z) {
    // Snap a point to the nearest street centreline (used by traffic).
    let bx = this.streetXs[0], bz = this.streetZs[0];
    for (const s of this.streetXs) if (Math.abs(s - x) < Math.abs(bx - x)) bx = s;
    for (const s of this.streetZs) if (Math.abs(s - z) < Math.abs(bz - z)) bz = s;
    return { x: bx, z: bz };
  }

  _windowTexture(base, litRatio) {
    const c = document.createElement('canvas');
    c.width = 64; c.height = 128;
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

  _roadTexture() {
    const c = document.createElement('canvas');
    c.width = 64; c.height = 64;
    const g = c.getContext('2d');
    g.fillStyle = '#23262b';
    g.fillRect(0, 0, 64, 64);
    g.fillStyle = 'rgba(255,255,255,0.05)';
    for (let i = 0; i < 40; i++) g.fillRect(this.rng() * 64, this.rng() * 64, 2, 2);
    g.fillStyle = '#e8d98a';
    g.fillRect(30, 4, 4, 22);
    g.fillRect(30, 38, 4, 22);
    const tex = new THREE.CanvasTexture(c);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }

  _build() {
    const rng = this.rng;
    const half = WORLD.halfSize;
    const block = WORLD.block;

    // Ground: grass-ish base, then the road grid on top.
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(half * 2 + 200, half * 2 + 260),
      new THREE.MeshLambertMaterial({ color: 0x8a9a6a }),
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.set(0, -0.05, 40);
    ground.receiveShadow = true;
    this.group.add(ground);

    // Beach sand + water to the south.
    const sand = new THREE.Mesh(
      new THREE.PlaneGeometry(half * 2 + 200, 60),
      new THREE.MeshLambertMaterial({ color: 0xe6d3a3 }),
    );
    sand.rotation.x = -Math.PI / 2;
    sand.position.set(0, 0.0, WORLD.beachZ + 20);
    sand.receiveShadow = true;
    this.group.add(sand);
    this.water = new THREE.Mesh(
      new THREE.PlaneGeometry(half * 2 + 400, 200),
      new THREE.MeshPhongMaterial({ color: 0x2e7f9e, shininess: 120, transparent: true, opacity: 0.88 }),
    );
    this.water.rotation.x = -Math.PI / 2;
    this.water.position.set(0, 0.15, WORLD.waterZ + 90);
    this.group.add(this.water);

    // Streets: every block step, both directions.
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

    // Sidewalks + crosswalks at intersections.
    const walkMat = new THREE.MeshLambertMaterial({ color: 0xb8b0a0 });
    const crossMat = new THREE.MeshBasicMaterial({ color: 0xe8e4d8 });
    for (const sx of this.streetXs) {
      for (const sz of this.streetZs) {
        if (sz > WORLD.beachZ) continue;
        for (let i = -2; i <= 2; i++) {
          const stripe = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 9), crossMat);
          stripe.rotation.x = -Math.PI / 2;
          stripe.position.set(sx + i * 2.8, 0.04, sz - WORLD.roadWidth / 2 - 2);
          this.group.add(stripe);
        }
        const corner = new THREE.Mesh(new THREE.PlaneGeometry(20, 20), walkMat);
        corner.rotation.x = -Math.PI / 2;
        corner.position.set(sx + 14, 0.01, sz + 14);
        corner.receiveShadow = true;
        this.group.add(corner);
      }
    }

    // Buildings: one or two per block, taller downtown. Heights use a
    // bell curve, not a flat spread, so most blocks read mid-rise and
    // only a few towers break the skyline.
    const winMats = PALETTE.map((c) => new THREE.MeshLambertMaterial({
      map: this._windowTexture('#' + c.toString(16).padStart(6, '0'), 0.25),
    }));
    const roofMat = new THREE.MeshLambertMaterial({ color: 0x4a4238 });
    const treeTrunkMat = new THREE.MeshLambertMaterial({ color: 0x6a4a2a });
    const treeLeafMat = new THREE.MeshLambertMaterial({ color: 0x4a8f3f });
    for (let bx = -half + block / 2; bx < half; bx += block) {
      for (let bz = -half + block / 2; bz < WORLD.beachZ - 10; bz += block) {
        if (chance(rng, 0.12)) {
          // Empty lot becomes a pocket park: a few trees, no collider,
          // so the block stays walkable.
          const trees = rangeInt(rng, 2, 4);
          for (let t = 0; t < trees; t++) {
            const tx = bx + range(rng, -18, 18);
            const tz = bz + range(rng, -18, 18);
            const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.6, 5, 5), treeTrunkMat);
            trunk.position.set(tx, 2.5, tz);
            trunk.castShadow = true;
            this.group.add(trunk);
            const crown = new THREE.Mesh(new THREE.ConeGeometry(3.2, 7, 6), treeLeafMat);
            crown.position.set(tx, 8, tz);
            crown.castShadow = true;
            this.group.add(crown);
          }
          continue;
        }
        const d = this.districtAt(bx, bz);
        const downtown = d.id === 'downtown';
        const h = downtown ? 40 + gauss(rng) * 55 : 12 + gauss(rng) * 30;
        const w = range(rng, 22, 40);
        const dep = range(rng, 22, 40);
        const mat = pick(rng, winMats);
        const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, dep), mat);
        b.position.set(bx, h / 2, bz);
        b.castShadow = true;
        b.receiveShadow = true;
        this.group.add(b);
        const roof = new THREE.Mesh(new THREE.BoxGeometry(w + 1, 1.2, dep + 1), roofMat);
        roof.position.set(bx, h + 0.6, bz);
        this.group.add(roof);
        this.colliders.push({ x0: bx - w / 2, z0: bz - dep / 2, x1: bx + w / 2, z1: bz + dep / 2 });
        if (chance(rng, 0.3)) {
          // Rooftop water tower / AC box for silhouette variety.
          const tw = new THREE.Mesh(new THREE.BoxGeometry(4, 4, 4), roofMat);
          tw.position.set(bx + range(rng, -8, 8), h + 3, bz + range(rng, -8, 8));
          this.group.add(tw);
        }
      }
    }

    // Palm trees along the beach and marina.
    const trunkMat = new THREE.MeshLambertMaterial({ color: 0x7a5a3a });
    const leafMat = new THREE.MeshLambertMaterial({ color: 0x3f8f4f });
    const palmSpots = [];
    for (let x = -320; x <= 320; x += 22) palmSpots.push([x + range(rng, -6, 6), WORLD.beachZ - 8 + range(rng, -4, 4)]);
    for (let i = 0; i < 40; i++) palmSpots.push([range(rng, -320, 320), range(rng, -320, 280)]);
    for (const [x, z] of palmSpots) {
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

    // Landmarks: bank (Downtown), vault (Harbor), safehouse, gun shop, garage.
    this._landmark('bank', 90, -150, 0x8a7a5a, 'MERIDIAN BANK');
    this._landmark('vault', 270, 60, 0x6a7a8a, 'HARBOR VAULT');
    this._landmark('safehouse', -30, 150, 0xa8c69a, 'SAFEHOUSE');
    this._landmark('gunshop', -150, -30, 0x9a8a6a, 'IRON & OAK');
    this._landmark('garage', 90, 210, 0x7a9ab0, 'WRENCH GARAGE');

    // Stunt ramps.
    const rampMat = new THREE.MeshLambertMaterial({ color: 0xd8b13a });
    for (const s of STUNTS) {
      const ramp = new THREE.Mesh(new THREE.BoxGeometry(8, 1, 12), rampMat);
      ramp.position.set(s.ramp[0], 1.5, s.ramp[1]);
      ramp.rotation.x = -0.45;
      ramp.castShadow = true;
      this.group.add(ramp);
    }

    // Harbor: piers, crates, boats.
    const pierMat = new THREE.MeshLambertMaterial({ color: 0x6a5a48 });
    for (let i = 0; i < 3; i++) {
      const pier = new THREE.Mesh(new THREE.BoxGeometry(6, 1.5, 60), pierMat);
      pier.position.set(180 + i * 60, 0.6, WORLD.beachZ + 35);
      this.group.add(pier);
    }
    const crateMat = new THREE.MeshLambertMaterial({ color: 0xb06a3a });
    for (let i = 0; i < 26; i++) {
      const c = new THREE.Mesh(new THREE.BoxGeometry(4, 4, 4), crateMat);
      c.position.set(range(rng, 170, 310), 2, range(rng, 240, 300));
      c.rotation.y = rng() * Math.PI;
      c.castShadow = true;
      this.group.add(c);
    }
    this._boat(210, WORLD.beachZ + 70, 0xd8d8d8);
    this._boat(300, WORLD.beachZ + 80, 0x3a6ad8);

    // Distant hills to the north for skyline depth.
    const hillMat = new THREE.MeshLambertMaterial({ color: 0x6a7a5a });
    for (let i = 0; i < 7; i++) {
      const hill = new THREE.Mesh(new THREE.ConeGeometry(range(rng, 60, 110), range(rng, 40, 80), 7), hillMat);
      hill.position.set(-350 + i * 120, 0, -420 + range(rng, -30, 30));
      this.group.add(hill);
    }
  }

  _landmark(id, x, z, color, label) {
    const base = new THREE.Mesh(
      new THREE.BoxGeometry(26, 14, 20),
      new THREE.MeshLambertMaterial({ color }),
    );
    base.position.set(x, 7, z);
    base.castShadow = true;
    base.receiveShadow = true;
    this.group.add(base);
    const sign = new THREE.Mesh(
      new THREE.BoxGeometry(22, 3, 1),
      new THREE.MeshBasicMaterial({ color: 0xffe9a8 }),
    );
    sign.position.set(x, 15.5, z - 10.5);
    this.group.add(sign);
    this.colliders.push({ x0: x - 13, z0: z - 10, x1: x + 13, z1: z + 10 });
    this.landmarks[id] = { x, z, label };
  }

  _boat(x, z, color) {
    const hull = new THREE.Mesh(
      new THREE.BoxGeometry(6, 2.5, 16),
      new THREE.MeshLambertMaterial({ color }),
    );
    hull.position.set(x, 0.8, z);
    this.group.add(hull);
    const cabin = new THREE.Mesh(
      new THREE.BoxGeometry(4, 2.5, 6),
      new THREE.MeshLambertMaterial({ color: 0xf0ead8 }),
    );
    cabin.position.set(x, 3, z - 1);
    this.group.add(cabin);
  }

  update(dt, time) {
    if (this.water) {
      this.water.position.y = 0.15 + Math.sin(time * 0.5) * 0.12;
      // Gentle shimmer: the bay breathes with the swell.
      this.water.material.opacity = 0.85 + Math.sin(time * 0.8) * 0.05;
    }
  }
}
