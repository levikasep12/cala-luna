// CALA LUNA — effects: particles, tracers, muzzle flashes, smoke and
// explosions. Short-lived meshes, pooled and recycled every frame.
// Everything here is a list of dying things: the four lists (particles,
// tracers, flashes, rings) all age the same way, so one reaper walks
// them all — each list just says what its members do while they live.

import * as THREE from 'three';

const MAX_PARTICLES = 300; // a long firefight must not grow the list unbounded
const MAX_TRACERS = 40;
const MAX_FLASHES = 12; // a rifle on full-auto must not grow the list unbounded
const PARTICLE_GRAVITY = 6;

export class Effects {
  constructor(scene) {
    this.scene = scene;
    this.particles = []; // {mesh, vel, life, maxLife}
    this.tracers = []; // {mesh, life}
    this.flashes = []; // {mesh, life}
    this.rings = []; // {mesh, life, maxLife} — shockwave rings from explosions
  }

  // One particle: a small coloured box with a velocity and a lifespan.
  _spawn(pos, color, size, vel, life) {
    if (this.particles.length > MAX_PARTICLES) return;
    const m = new THREE.Mesh(
      new THREE.BoxGeometry(size, size, size),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 1 }),
    );
    m.position.copy(pos);
    this.scene.add(m);
    this.particles.push({ mesh: m, vel: vel.clone(), life, maxLife: life });
  }

  // A spray of particles in random directions, fast ones and slow ones.
  burst(pos, color, count = 10, speed = 6, size = 0.35) {
    for (let i = 0; i < count; i++) {
      const v = new THREE.Vector3((Math.random() - 0.5) * 2, Math.random() * 1.5, (Math.random() - 0.5) * 2)
        .normalize().multiplyScalar(speed * (0.4 + Math.random() * 0.6));
      this._spawn(pos, color, size, v, 0.5 + Math.random() * 0.5);
    }
  }

  blood(pos) { this.burst(new THREE.Vector3(pos.x, 1.2, pos.z), 0xa02020, 8, 4, 0.3); }

  // Green sparkles rising from a heal: medkits, crew patches, district
  // captures. The player should SEE the health come back.
  heal(pos) {
    const at = new THREE.Vector3(pos.x, 1, pos.z);
    this.burst(at, 0x7ee787, 12, 3, 0.3);
    this.burst(at, 0xffffff, 5, 2, 0.2);
  }

  // White-grey tyre smoke for handbrake slides.
  tireSmoke(pos) {
    const at = new THREE.Vector3(pos.x + (Math.random() - 0.5) * 2, 0.4, pos.z + (Math.random() - 0.5) * 2);
    this._spawn(at, 0xd8d8d8, 0.8, new THREE.Vector3((Math.random() - 0.5), 1.4, (Math.random() - 0.5)), 0.8);
  }

  smoke(pos) {
    this._spawn(new THREE.Vector3(pos.x, 1.6, pos.z), 0x555555, 0.9,
      new THREE.Vector3((Math.random() - 0.5), 2.2, (Math.random() - 0.5)), 1.2);
  }

  explosion(pos) {
    this.burst(pos, 0xffa020, 26, 10, 0.7);
    this.burst(pos, 0xff5020, 18, 7, 0.9);
    this.burst(pos, 0x444444, 12, 4, 1.1);
    this.ring(pos);
  }

  // Metal-on-metal sparks for car bumps.
  sparks(pos) {
    this.burst(new THREE.Vector3(pos.x, 0.8, pos.z), 0xffd166, 6, 5, 0.18);
    this.burst(new THREE.Vector3(pos.x, 0.8, pos.z), 0xffffff, 4, 7, 0.12);
  }

  // A flat shockwave ring that expands and fades over half a second.
  ring(pos) {
    const m = new THREE.Mesh(
      new THREE.RingGeometry(0.5, 1.0, 24),
      new THREE.MeshBasicMaterial({ color: 0xffa020, transparent: true, opacity: 0.7, side: THREE.DoubleSide, depthWrite: false }),
    );
    m.rotation.x = -Math.PI / 2;
    m.position.set(pos.x, 0.3, pos.z);
    this.scene.add(m);
    this.rings.push({ mesh: m, life: 0.5, maxLife: 0.5 });
  }

  muzzleFlash(origin, heading) {
    if (this.flashes.length > MAX_FLASHES) return;
    const m = new THREE.Mesh(
      new THREE.PlaneGeometry(1.1, 1.1),
      new THREE.MeshBasicMaterial({ color: 0xffe066, transparent: true, opacity: 0.95, side: THREE.DoubleSide, depthWrite: false }),
    );
    const fwd = new THREE.Vector3(Math.cos(heading), 0, -Math.sin(heading));
    m.position.copy(origin).addScaledVector(fwd, 1.1);
    m.position.y = 1.45;
    m.lookAt(m.position.clone().add(fwd));
    // A flash that never varies reads as a sticker: roll it and jitter
    // its size so no two shots look alike.
    m.rotateZ(Math.random() * Math.PI);
    m.scale.setScalar(0.85 + Math.random() * 0.4);
    this.scene.add(m);
    this.flashes.push({ mesh: m, life: 0.09 });
  }

  tracer(from, to) {
    if (this.tracers.length > MAX_TRACERS) return;
    const dir = to.clone().sub(from);
    const len = dir.length();
    const geo = new THREE.CylinderGeometry(0.03, 0.03, len, 4);
    const mat = new THREE.MeshBasicMaterial({ color: 0xffe066, transparent: true, opacity: 0.9 });
    const m = new THREE.Mesh(geo, mat);
    m.position.copy(from).addScaledVector(dir, 0.5);
    m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
    this.scene.add(m);
    this.tracers.push({ mesh: m, life: 0.15 });
  }

  // Age every list: the dead are removed and disposed, the living get
  // their per-frame behaviour from the tick callback.
  update(dt) {
    this._reap(this.particles, dt, (p) => {
      p.vel.y -= PARTICLE_GRAVITY * dt;
      p.mesh.position.addScaledVector(p.vel, dt);
      p.mesh.material.opacity = p.life / p.maxLife;
    });
    this._reap(this.tracers, dt);
    this._reap(this.flashes, dt);
    this._reap(this.rings, dt, (r) => {
      const k = 1 - r.life / r.maxLife;
      r.mesh.scale.setScalar(1 + k * 9);
      r.mesh.material.opacity = 0.7 * (1 - k);
    });
  }

  // Walk a list backwards: count each member's life down, drop the dead,
  // tick the living. Backwards, so a splice never skips the next member.
  _reap(list, dt, tick = null) {
    for (let i = list.length - 1; i >= 0; i--) {
      const item = list[i];
      item.life -= dt;
      if (item.life <= 0) {
        this._discard(item.mesh);
        list.splice(i, 1);
        continue;
      }
      if (tick) tick(item, dt);
    }
  }

  _discard(mesh) {
    this.scene.remove(mesh);
    mesh.geometry.dispose();
    mesh.material.dispose();
  }
}
