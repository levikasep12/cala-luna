// CALA LUNA — weather: the day/night cycle, golden-hour sun, sky and fog.
// The sun swings from dawn gold to noon white to dusk ember; at night the
// streetlights are the only warm thing left.

import * as THREE from 'three';
import { WORLD } from './config.js';

export class Weather {
  constructor(scene) {
    this.scene = scene;
    this.hour = WORLD.startHour;
    this.sun = new THREE.DirectionalLight(0xffd9a0, 2.4);
    this.sun.position.set(120, 90, 60);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(1024, 1024);
    this.sun.shadow.camera.left = -260;
    this.sun.shadow.camera.right = 260;
    this.sun.shadow.camera.top = 260;
    this.sun.shadow.camera.bottom = -260;
    this.sun.shadow.camera.far = 600;
    this.sun.shadow.bias = -0.0005;
    scene.add(this.sun);
    this.sunTarget = new THREE.Object3D();
    this.sunTarget.position.set(0, 0, 0);
    scene.add(this.sunTarget);
    this.sun.target = this.sunTarget;
    this.hemi = new THREE.HemisphereLight(0xbfd9ff, 0x8a7a5a, 0.85);
    scene.add(this.hemi);
    // Stars and a moon: invisible in daylight, out after dark.
    this.stars = this._makeStars();
    scene.add(this.stars);
    this.moon = new THREE.Mesh(
      new THREE.CircleGeometry(14, 24),
      new THREE.MeshBasicMaterial({ color: 0xf0ead8, transparent: true, opacity: 0 }),
    );
    this.moon.position.set(-260, 220, -320);
    this.moon.lookAt(0, 0, 0);
    scene.add(this.moon);
    this.scene.background = new THREE.Color(0xffcf9e);
    this.scene.fog = new THREE.Fog(0xf2c48d, 180, 700);
  }

  _makeStars() {
    const n = 300;
    const pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const e = Math.random() * Math.PI * 0.45 + 0.08; // above the horizon
      const r = 700;
      pos[i * 3] = Math.cos(a) * Math.cos(e) * r;
      pos[i * 3 + 1] = Math.sin(e) * r;
      pos[i * 3 + 2] = Math.sin(a) * Math.cos(e) * r;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    return new THREE.Points(geo, new THREE.PointsMaterial({
      color: 0xffffff, size: 2.2, transparent: true, opacity: 0, sizeAttenuation: false,
    }));
  }

  // hour: 0-24. Returns the clock string for the HUD.
  clockString() {
    const h = Math.floor(this.hour);
    const m = Math.floor((this.hour - h) * 60);
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  }

  setHour(h) { this.hour = ((h % 24) + 24) % 24; this._apply(0); }

  _apply(dt) {
    const h = this.hour;
    // Sun angle: 6h = east horizon, 12h = noon, 18h = west horizon.
    const ang = ((h - 6) / 12) * Math.PI;
    const elev = Math.sin(ang);
    const dayness = Math.max(0, Math.min(1, elev * 2 + 0.25));
    const golden = Math.max(0, 1 - Math.abs(elev) * 2.2); // near horizon = golden
    this.sun.position.set(Math.cos(ang) * 220, 30 + Math.max(8, elev * 200), 90);
    this.sun.intensity = 0.25 + dayness * 2.2;
    const sunColor = new THREE.Color().setHSL(0.09 - golden * 0.03, 0.75, 0.55 + dayness * 0.15);
    this.sun.color.copy(sunColor);
    this.hemi.intensity = 0.25 + dayness * 0.65;
    // Sky: deep blue noon, ember dusk, dark navy night.
    const sky = new THREE.Color();
    if (elev > 0.25) sky.setHSL(0.58, 0.55, 0.62);
    else if (elev > -0.08) sky.setHSL(0.08, 0.65, 0.55 + elev * 0.5);
    else sky.setHSL(0.62, 0.5, 0.08);
    this.scene.background.copy(sky);
    this.scene.fog.color.copy(sky).lerp(new THREE.Color(0xf2c48d), golden * 0.5);
    // Night falls: stars and moon fade in once the sun is well down.
    const night = Math.max(0, Math.min(1, -elev * 3));
    this.stars.material.opacity = night * 0.9;
    this.moon.material.opacity = night * 0.95;
  }

  update(dt, focusPos) {
    this.hour = (this.hour + (dt / WORLD.dayLengthSec) * 24) % 24;
    this._apply(dt);
    // Keep the shadow camera centred on the action.
    if (focusPos) {
      this.sunTarget.position.set(focusPos.x, 0, focusPos.z);
      this.sun.position.set(focusPos.x + 140, 120, focusPos.z + 70);
    }
  }
}
