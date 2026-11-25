class Container {
  constructor() {
    this.entries = new Map();
    this.instances = new Map();
  }

  register(token, factory, { singleton = true } = {}) {
    if (token === undefined || token === null) {
      throw new TypeError('A DI token is required.');
    }
    if (typeof factory !== 'function') {
      throw new TypeError(`A factory function is required for ${String(token)}.`);
    }
    if (this.entries.has(token)) {
      throw new Error(`Duplicate DI registration for ${String(token)}.`);
    }

    this.entries.set(token, { factory, singleton });
    return this;
  }

  resolve(token) {
    const entry = this.entries.get(token);
    if (!entry) {
      throw new Error(`No DI registration for ${String(token)}.`);
    }

    if (!entry.singleton) {
      return entry.factory(this);
    }

    if (!this.instances.has(token)) {
      this.instances.set(token, entry.factory(this));
    }
    return this.instances.get(token);
  }

  has(token) {
    return this.entries.has(token);
  }

  tokens() {
    return [...this.entries.keys()];
  }
}

module.exports = { Container };
