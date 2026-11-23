// CALA LUNA — weather: the day/night cycle, golden-hour sun, sky and fog.
// The sun swings from dawn gold to noon white to dusk ember; at night the
// streetlights are the only warm thing left. The constructor builds the
// sky in pieces — sun, hemisphere light, clouds, stars, moon — and each
// frame re-aims them from the hour: the sun's angle drives its colour
// and height, the sky's colour, and how much of the night shows.

import * as THREE from 'three';
import { WORLD } from './config.js';

const SHADOW_SPAN = 260; // the shadow camera covers the city centre
const CLOUD_COUNT = 8;
const STAR_COUNT = 300;
const SKY_RADIUS = 700; // the stars sit on a dome this far out

export class Weather {
  constructor(scene) {
    this.scene = scene;
    this.hour = WORLD.startHour;
    this._buildSun(scene);
    this._buildSky(scene);
    // Drifting clouds: flat white puffs high above the city, bright by
    // day and nearly gone by night.
    this.cloudMat = new THREE.MeshLambertMaterial({ color: 0xffffff, transparent: true, opacity: 0.8 });
    this.clouds = this._makeClouds();
    scene.add(this.clouds);
    // Stars and a moon: invisible in daylight, out after dark.
    this.stars = this._makeStars();
    scene.add(this.stars);
    this.moon = this._makeMoon();
    scene.add(this.moon);
    this.scene.background = new THREE.Color(0xffcf9e);
    this.scene.fog = new THREE.Fog(0xf2c48d, 180, 700);
  }

  // The sun: a shadow-casting directional light aimed at a target the
  // frame update keeps centred on the action.
  _buildSun(scene) {
    this.sun = new THREE.DirectionalLight(0xffd9a0, 2.4);
    this.sun.position.set(120, 90, 60);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(1024, 1024);
    this.sun.shadow.camera.left = -SHADOW_SPAN;
    this.sun.shadow.camera.right = SHADOW_SPAN;
    this.sun.shadow.camera.top = SHADOW_SPAN;
    this.sun.shadow.camera.bottom = -SHADOW_SPAN;
    this.sun.shadow.camera.far = 600;
    this.sun.shadow.bias = -0.0005;
    scene.add(this.sun);
    this.sunTarget = new THREE.Object3D();
    this.sunTarget.position.set(0, 0, 0);
    scene.add(this.sunTarget);
    this.sun.target = this.sunTarget;
  }

  // The ambient wash: blue sky above, warm ground below.
  _buildSky(scene) {
    this.hemi = new THREE.HemisphereLight(0xbfd9ff, 0x8a7a5a, 0.85);
    scene.add(this.hemi);
  }

  _makeClouds() {
    const group = new THREE.Group();
    this.cloudSpeeds = [];
    for (let i = 0; i < CLOUD_COUNT; i++) {
      const cloud = new THREE.Group();
      // Two or three flattened boxes read as a puff from the ground.
      const puffs = 2 + Math.floor(Math.random() * 2);
      for (let p = 0; p < puffs; p++) {
        const m = new THREE.Mesh(
          new THREE.BoxGeometry(26 + Math.random() * 22, 5 + Math.random() * 3, 14 + Math.random() * 8),
          this.cloudMat,
        );
        m.position.set(p * 18 - puffs * 9, Math.random() * 2, (Math.random() - 0.5) * 8);
        cloud.add(m);
      }
      cloud.position.set(-400 + Math.random() * 800, 150 + Math.random() * 60, -350 + Math.random() * 600);
      group.add(cloud);
      this.cloudSpeeds.push(1.5 + Math.random() * 2);
    }
    return group;
  }

  _makeStars() {
    const pos = new Float32Array(STAR_COUNT * 3);
    for (let i = 0; i < STAR_COUNT; i++) {
      const a = Math.random() * Math.PI * 2;
      const e = Math.random() * Math.PI * 0.45 + 0.08; // above the horizon
      pos[i * 3] = Math.cos(a) * Math.cos(e) * SKY_RADIUS;
      pos[i * 3 + 1] = Math.sin(e) * SKY_RADIUS;
      pos[i * 3 + 2] = Math.sin(a) * Math.cos(e) * SKY_RADIUS;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    return new THREE.Points(geo, new THREE.PointsMaterial({
      color: 0xffffff, size: 2.2, transparent: true, opacity: 0, sizeAttenuation: false,
    }));
  }

  _makeMoon() {
    const moon = new THREE.Mesh(
      new THREE.CircleGeometry(14, 24),
      new THREE.MeshBasicMaterial({ color: 0xf0ead8, transparent: true, opacity: 0 }),
    );
    moon.position.set(-260, 220, -320);
    moon.lookAt(0, 0, 0);
    return moon;
  }

  // hour: 0-24. Returns the clock string for the HUD.
  clockString() {
    const h = Math.floor(this.hour);
    const m = Math.floor((this.hour - h) * 60);
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  }

  setHour(h) { this.hour = ((h % 24) + 24) % 24; this._apply(0); }

  // Re-aim the sky from the current hour. The sun's angle (6h = east
  // horizon, 12h = noon, 18h = west horizon) drives everything.
  _apply(dt) {
    const h = this.hour;
    const ang = ((h - 6) / 12) * Math.PI;
    const elev = Math.sin(ang);
    const dayness = Math.max(0, Math.min(1, elev * 2 + 0.25));
    const golden = Math.max(0, 1 - Math.abs(elev) * 2.2); // near horizon = golden
    this._aimSun(ang, elev, dayness, golden);
    this._paintSky(elev, golden);
    this._nightfall(elev, dayness);
  }

  // The sun: position from the angle, intensity and colour from how
  // high and how golden it is.
  _aimSun(ang, elev, dayness, golden) {
    this.sun.position.set(Math.cos(ang) * 220, 30 + Math.max(8, elev * 200), 90);
    this.sun.intensity = 0.25 + dayness * 2.2;
    const sunColor = new THREE.Color().setHSL(0.09 - golden * 0.03, 0.75, 0.55 + dayness * 0.15);
    this.sun.color.copy(sunColor);
    this.hemi.intensity = 0.25 + dayness * 0.65;
  }

  // Sky: deep blue noon, ember dusk, dark navy night. The fog takes the
  // sky's colour, warmed toward sand at golden hour.
  _paintSky(elev, golden) {
    const sky = new THREE.Color();
    if (elev > 0.25) sky.setHSL(0.58, 0.55, 0.62);
    else if (elev > -0.08) sky.setHSL(0.08, 0.65, 0.55 + elev * 0.5);
    else sky.setHSL(0.62, 0.5, 0.08);
    this.scene.background.copy(sky);
    this.scene.fog.color.copy(sky).lerp(new THREE.Color(0xf2c48d), golden * 0.5);
  }

  // Night falls: stars and moon fade in once the sun is well down, and
  // the clouds fade out with the light.
  _nightfall(elev, dayness) {
    const night = Math.max(0, Math.min(1, -elev * 3));
    this.stars.material.opacity = night * 0.9;
    this.moon.material.opacity = night * 0.95;
    this.cloudMat.opacity = 0.1 + dayness * 0.65;
  }

  update(dt, focusPos) {
    this.hour = (this.hour + (dt / WORLD.dayLengthSec) * 24) % 24;
    this._apply(dt);
    this._driftClouds(dt);
    // Keep the shadow camera centred on the action.
    if (focusPos) {
      this.sunTarget.position.set(focusPos.x, 0, focusPos.z);
      this.sun.position.set(focusPos.x + 140, 120, focusPos.z + 70);
    }
  }

  // Clouds drift east and wrap around the sky.
  _driftClouds(dt) {
    for (let i = 0; i < this.clouds.children.length; i++) {
      const c = this.clouds.children[i];
      c.position.x += this.cloudSpeeds[i] * dt;
      if (c.position.x > 480) c.position.x = -480;
    }
  }
}
