// CALA LUNA — input: keyboard + mouse state, edge-triggered actions.
// The game polls down() every frame for held keys and consumes
// pressed() once per keystroke; the mouse reports clicks and drag
// deltas the same way, so no input is ever read twice.

export class Input {
  constructor() {
    this.keysDown = new Set();
    this.pressedQueue = new Set();
    this.mouseDown = false;
    this.mouseClicked = false;
    this.dragDX = 0;
    this.dragDY = 0;
    this.dragging = false;
    this.lastX = 0;
    this.lastY = 0;
    this._bindKeys();
    this._bindMouse();
    this._bindVisibility();
  }

  _bindKeys() {
    window.addEventListener('keydown', (e) => {
      if (e.repeat) return;
      this.keysDown.add(e.code);
      this.pressedQueue.add(e.code);
      if (['Space', 'ArrowUp', 'ArrowDown'].includes(e.code)) e.preventDefault();
    });
    window.addEventListener('keyup', (e) => this.keysDown.delete(e.code));
    window.addEventListener('blur', () => this._releaseAll());
  }

  _bindMouse() {
    // Right-drag orbits the camera like left-drag; the context menu
    // only ever got in the way of that.
    window.addEventListener('contextmenu', (e) => {
      if (e.target.closest('#game-root, canvas')) e.preventDefault();
    });
    window.addEventListener('mousedown', (e) => {
      // Clicks on menus and overlays are UI, not gameplay: dragging
      // on the title screen used to swing the chase yaw before play
      // even started.
      if (e.target.closest('button, .overlay, #start-screen, a')) return;
      this.mouseDown = true;
      this.mouseClicked = true;
      this.dragging = true;
      this.lastX = e.clientX; this.lastY = e.clientY;
    });
    window.addEventListener('mouseup', () => { this.mouseDown = false; this.dragging = false; });
    window.addEventListener('mousemove', (e) => {
      if (!this.dragging) return;
      this.dragDX += e.clientX - this.lastX;
      this.dragDY += e.clientY - this.lastY;
      this.lastX = e.clientX; this.lastY = e.clientY;
    });
  }

  _bindVisibility() {
    // A hidden tab gets no keyup events: without this, alt-tabbing
    // mid-drive left W stuck down and Luz drove on alone.
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) this._releaseAll();
    });
  }

  // Drop every held key and stop the drag: the window lost focus.
  _releaseAll() {
    this.keysDown.clear();
    this.pressedQueue.clear();
    this.dragging = false;
  }

  down(code) { return this.keysDown.has(code); }
  sprint() { return this.down('ShiftLeft') || this.down('ShiftRight'); }
  pressed(code) {
    if (this.pressedQueue.has(code)) { this.pressedQueue.delete(code); return true; }
    return false;
  }

  // One axis from two key pairs: +1 when a positive key is held, -1
  // when a negative key is held, 0 when both or neither are.
  _axis(neg, pos) {
    const up = pos.some((c) => this.down(c)) ? 1 : 0;
    const dn = neg.some((c) => this.down(c)) ? 1 : 0;
    return up - dn;
  }

  // WASD (or arrow keys) axes: x = strafe right, y = forward
  axes() {
    return {
      x: this._axis(['KeyA', 'ArrowLeft'], ['KeyD', 'ArrowRight']),
      y: this._axis(['KeyS', 'ArrowDown'], ['KeyW', 'ArrowUp']),
    };
  }

  consumeMouseClick() {
    const c = this.mouseClicked;
    this.mouseClicked = false;
    return c;
  }

  consumeDrag() {
    const d = { dx: this.dragDX, dy: this.dragDY };
    this.dragDX = 0; this.dragDY = 0;
    return d;
  }

  endFrame() { this.pressedQueue.clear(); }
}
