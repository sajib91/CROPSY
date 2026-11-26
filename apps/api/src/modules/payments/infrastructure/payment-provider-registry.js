const { NotFoundError, ValidationError } = require('../../../shared/kernel/errors');
const { assertProvider } = require('../domain/payment-provider');

const REGISTRY_METHODS = Object.freeze(['get', 'list']);

/**
 * Configured provider adapters. Metadata is safe to expose publicly; secrets
 * remain inside adapters and are never included in describe() responses.
 */
class PaymentProviderRegistry {
  constructor(providers = []) {
    this.providers = new Map();
    for (const provider of providers) {
      const adapter = assertProvider(provider.adapter);
      this.providers.set(provider.code, {
        code: provider.code,
        methods: [...(provider.methods || [])],
        adapter,
      });
    }
    for (const method of REGISTRY_METHODS) {
      if (typeof this[method] !== 'function') {
        throw new TypeError(`PaymentProviderRegistry is missing ${method}.`);
      }
    }
  }

  get(code) {
    const provider = this.providers.get(code);
    if (!provider) {
      throw new NotFoundError({ message: `Payment provider '${code}' is not configured.` });
    }
    return provider;
  }

  list() {
    return [...this.providers.values()].map((provider) => ({
      code: provider.code,
      methods: [...provider.methods],
      capabilities: provider.adapter.describe().capabilities || [],
    }));
  }

  assertMethod(code, method) {
    const provider = this.get(code);
    if (!provider.methods.includes(method)) {
      throw new ValidationError({
        message: `Payment provider '${code}' does not support method '${method}'.`,
      });
    }
    return provider;
  }
}

function parseProviderConfig(raw) {
  if (typeof raw !== 'string' || raw.trim().length === 0) return [];
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new ValidationError({ message: 'PAYMENT_PROVIDERS_JSON must contain valid JSON.' });
  }
  if (!Array.isArray(parsed)) {
    throw new ValidationError({ message: 'PAYMENT_PROVIDERS_JSON must contain an array.' });
  }
  return parsed;
}

module.exports = { PaymentProviderRegistry, REGISTRY_METHODS, parseProviderConfig };
