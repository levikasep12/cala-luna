// CALA LUNA — effects: particles, tracers, muzzle flashes, smoke and
// explosions. Short-lived meshes pooled and recycled every frame.

import * as THREE from 'three';

export class Effects {
  constructor(scene) {
    this.scene = scene;
    this.particles = []; // {mesh, vel, life, maxLife}
    this.tracers = [];
    this.flashes = [];
  }

  _spawn(pos, color, size, vel, life) {
    const m = new THREE.Mesh(
      new THREE.BoxGeometry(size, size, size),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 1 }),
    );
    m.position.copy(pos);
    this.scene.add(m);
    this.particles.push({ mesh: m, vel: vel.clone(), life, maxLife: life });
  }

  burst(pos, color, count = 10, speed = 6, size = 0.35) {
    for (let i = 0; i < count; i++) {
      const v = new THREE.Vector3((Math.random() - 0.5) * 2, Math.random() * 1.5, (Math.random() - 0.5) * 2)
        .normalize().multiplyScalar(speed * (0.4 + Math.random() * 0.6));
      this._spawn(pos, color, size, v, 0.5 + Math.random() * 0.5);
    }
  }

  blood(pos) { this.burst(new THREE.Vector3(pos.x, 1.2, pos.z), 0xa02020, 8, 4, 0.3); }

  smoke(pos) {
    this._spawn(new THREE.Vector3(pos.x, 1.6, pos.z), 0x555555, 0.9,
      new THREE.Vector3((Math.random() - 0.5), 2.2, (Math.random() - 0.5)), 1.2);
  }

  explosion(pos) {
    this.burst(pos, 0xffa020, 26, 10, 0.7);
    this.burst(pos, 0xff5020, 18, 7, 0.9);
    this.burst(pos, 0x444444, 12, 4, 1.1);
  }

  muzzleFlash(origin, heading) {
    const m = new THREE.Mesh(
      new THREE.PlaneGeometry(1.1, 1.1),
      new THREE.MeshBasicMaterial({ color: 0xffe066, transparent: true, opacity: 0.95, side: THREE.DoubleSide, depthWrite: false }),
    );
    const fwd = new THREE.Vector3(Math.cos(heading), 0, -Math.sin(heading));
    m.position.copy(origin).addScaledVector(fwd, 1.1);
    m.position.y = 1.45;
    m.lookAt(m.position.clone().add(fwd));
    this.scene.add(m);
    this.flashes.push({ mesh: m, life: 0.06 });
  }

  tracer(from, to) {
    const dir = to.clone().sub(from);
    const len = dir.length();
    const geo = new THREE.CylinderGeometry(0.03, 0.03, len, 4);
    const mat = new THREE.MeshBasicMaterial({ color: 0xffe066, transparent: true, opacity: 0.9 });
    const m = new THREE.Mesh(geo, mat);
    m.position.copy(from).addScaledVector(dir, 0.5);
    m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
    this.scene.add(m);
    this.tracers.push({ mesh: m, life: 0.08 });
  }

  update(dt) {
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.life -= dt;
      if (p.life <= 0) {
        this.scene.remove(p.mesh);
        p.mesh.geometry.dispose();
        p.mesh.material.dispose();
        this.particles.splice(i, 1);
        continue;
      }
      p.vel.y -= 6 * dt;
      p.mesh.position.addScaledVector(p.vel, dt);
      p.mesh.material.opacity = p.life / p.maxLife;
    }
    for (let i = this.tracers.length - 1; i >= 0; i--) {
      const t = this.tracers[i];
      t.life -= dt;
      if (t.life <= 0) {
        this.scene.remove(t.mesh);
        t.mesh.geometry.dispose();
        t.mesh.material.dispose();
        this.tracers.splice(i, 1);
      }
    }
    for (let i = this.flashes.length - 1; i >= 0; i--) {
      const f = this.flashes[i];
      f.life -= dt;
      if (f.life <= 0) {
        this.scene.remove(f.mesh);
        f.mesh.geometry.dispose();
        f.mesh.material.dispose();
        this.flashes.splice(i, 1);
      }
    }
  }
}
