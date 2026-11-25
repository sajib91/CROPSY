const { randomUUID } = require('node:crypto');

class DomainEvent {
  constructor({ id, type, moduleId, aggregateId, payload = {}, occurredAt } = {}) {
    if (!type || !moduleId) {
      throw new TypeError('DomainEvent requires type and moduleId.');
    }

    this.id = id || randomUUID();
    this.type = type;
    this.moduleId = moduleId;
    this.aggregateId = aggregateId;
    this.payload = payload;
    this.occurredAt = occurredAt || new Date();
  }

  toJSON() {
    return {
      id: this.id,
      type: this.type,
      moduleId: this.moduleId,
      aggregateId: this.aggregateId,
      payload: this.payload,
      occurredAt: this.occurredAt.toISOString(),
    };
  }
}

class InProcessEventBus {
  constructor({ logger, historySize = 100 } = {}) {
    this.logger = logger;
    this.historySize = historySize;
    this.handlers = new Map();
    this.history = [];
  }

  subscribe(eventType, handler) {
    if (typeof handler !== 'function') {
      throw new TypeError('Event handler must be a function.');
    }
    const handlers = this.handlers.get(eventType) || [];
    handlers.push(handler);
    this.handlers.set(eventType, handlers);
    return () => {
      this.handlers.set(
        eventType,
        (this.handlers.get(eventType) || []).filter((candidate) => candidate !== handler),
      );
    };
  }

  publish(event) {
    const domainEvent = event instanceof DomainEvent ? event : new DomainEvent(event);
    this.history.push(domainEvent);
    if (this.history.length > this.historySize) {
      this.history.splice(0, this.history.length - this.historySize);
    }

    this.logger?.info(
      { eventType: domainEvent.type, moduleId: domainEvent.moduleId, eventId: domainEvent.id },
      'Domain event published',
    );

    for (const handler of this.handlers.get(domainEvent.type) || []) {
      handler(domainEvent);
    }
    for (const handler of this.handlers.get('*') || []) {
      handler(domainEvent);
    }
    return domainEvent;
  }

  recent(limit = 20) {
    const count = Math.max(0, Math.min(limit, this.historySize));
    return this.history
      .slice(-count)
      .reverse()
      .map((event) => event.toJSON());
  }
}

module.exports = { DomainEvent, InProcessEventBus };
