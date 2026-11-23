// CALA LUNA — input: keyboard + mouse state, edge-triggered actions.
// The game polls keysDown each frame and consumes pressed() actions once.

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
    this._bind();
  }

  _bind() {
    window.addEventListener('keydown', (e) => {
      if (e.repeat) return;
      this.keysDown.add(e.code);
      this.pressedQueue.add(e.code);
      if (['Space', 'ArrowUp', 'ArrowDown'].includes(e.code)) e.preventDefault();
    });
    window.addEventListener('keyup', (e) => this.keysDown.delete(e.code));
    window.addEventListener('blur', () => { this.keysDown.clear(); this.pressedQueue.clear(); this.dragging = false; });
    window.addEventListener('mousedown', (e) => {
      if (e.target.closest('button')) return;
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

  down(code) { return this.keysDown.has(code); }
  sprint() { return this.down('ShiftLeft') || this.down('ShiftRight'); }
  pressed(code) {
    if (this.pressedQueue.has(code)) { this.pressedQueue.delete(code); return true; }
    return false;
  }
  // WASD (or arrow keys) axes: x = strafe right, y = forward
  axes() {
    const x = (this.down('KeyD') || this.down('ArrowRight') ? 1 : 0) - (this.down('KeyA') || this.down('ArrowLeft') ? 1 : 0);
    const y = (this.down('KeyW') || this.down('ArrowUp') ? 1 : 0) - (this.down('KeyS') || this.down('ArrowDown') ? 1 : 0);
    return { x, y };
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
