/**
 * Generic object pool. Objects are created lazily by `factory` and recycled on release.
 * `onAcquire` / `onRelease` hooks let owners reset state or toggle visibility.
 */
export class ObjectPool {
  constructor(factory, { initial = 0, max = Infinity, onAcquire = null, onRelease = null } = {}) {
    this.factory = factory;
    this.max = max;
    this.onAcquire = onAcquire;
    this.onRelease = onRelease;
    this.free = [];
    this.active = [];
    this.created = 0;
    for (let i = 0; i < initial; i++) this.free.push(this.create());
  }

  create() {
    this.created++;
    return this.factory();
  }

  acquire() {
    let obj = this.free.pop();
    if (!obj) {
      if (this.created >= this.max) return null;
      obj = this.create();
    }
    this.active.push(obj);
    if (this.onAcquire) this.onAcquire(obj);
    return obj;
  }

  release(obj) {
    const i = this.active.indexOf(obj);
    if (i === -1) return;
    const last = this.active.pop();
    if (i < this.active.length) this.active[i] = last;
    this.free.push(obj);
    if (this.onRelease) this.onRelease(obj);
  }

  releaseAll() {
    while (this.active.length) this.release(this.active[this.active.length - 1]);
  }

  get activeCount() {
    return this.active.length;
  }
}
