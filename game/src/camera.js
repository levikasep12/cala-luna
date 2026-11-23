// CALA LUNA — camera: third-person chase camera with mouse orbit.
// Sits behind the player (or the car), pulls back with speed, and
// smooths every move so the drive feels right.

import * as THREE from 'three';

export class Camera {
  constructor(scene, renderer) {
    this.camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.1, 900);
    this.yaw = 0;       // orbit around the player
    this.pitch = 0.32;  // 0 = level, up to ~0.9 looking down
    this.dist = 11;
    this.pos = new THREE.Vector3(0, 8, -12);
    this.lookAt = new THREE.Vector3();
    this.shake = 0;
    this.mode = 'chase'; // chase | vista
    window.addEventListener('resize', () => {
      this.camera.aspect = window.innerWidth / window.innerHeight;
      this.camera.updateProjectionMatrix();
      renderer.setSize(window.innerWidth, window.innerHeight);
    });
  }

  orbit(dx, dy) {
    this.yaw -= dx * 0.004;
    this.pitch = Math.max(0.05, Math.min(1.0, this.pitch + dy * 0.003));
  }

  addShake(amount) { this.shake = Math.min(1, this.shake + amount); }

  // Vista mode: a slow cinematic orbit for the title screen.
  vista(time, center) {
    const a = time * 0.05;
    this.pos.set(center.x + Math.cos(a) * 120, 55 + Math.sin(time * 0.1) * 8, center.z + Math.sin(a) * 120);
    this.lookAt.set(center.x, 10, center.z);
    this.camera.position.copy(this.pos);
    this.camera.lookAt(this.lookAt);
  }

  update(dt, targetPos, targetHeading, speedKmh, inCar) {
    // Chase: behind the target's heading, blended toward the orbit yaw.
    const back = targetHeading + Math.PI + this.yaw;
    const wantDist = inCar ? 12 + Math.min(6, speedKmh / 30) : 9;
    const wantHeight = inCar ? 5.2 : 4.4;
    const want = new THREE.Vector3(
      targetPos.x + Math.cos(back) * wantDist * Math.cos(this.pitch),
      targetPos.y + wantHeight + Math.sin(this.pitch) * wantDist * 0.6,
      targetPos.z - Math.sin(back) * wantDist * Math.cos(this.pitch),
    );
    const k = Math.min(1, dt * 5);
    this.pos.lerp(want, k);
    if (this.pos.y < 1.6) this.pos.y = 1.6;
    this.lookAt.lerp(new THREE.Vector3(targetPos.x, targetPos.y + 2.2, targetPos.z), Math.min(1, dt * 8));
    this.shake = Math.max(0, this.shake - dt * 2.2);
    const sh = this.shake * this.shake;
    const sx = (Math.random() - 0.5) * sh * 0.7;
    const sy = (Math.random() - 0.5) * sh * 0.7;
    this.camera.position.set(this.pos.x + sx, this.pos.y + sy, this.pos.z);
    this.camera.lookAt(this.lookAt);
  }
}
