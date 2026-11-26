const { PaymentProviderRegistryToken } = require('../../../shared/di/tokens');
const { assertRepository } = require('../../../shared/domain/repository');

/**
 * Domain-level payment provider contract. Concrete adapters translate this
 * port to a provider SDK or HTTP API; no module imports a provider SDK.
 *
 * initiate(input) -> { providerReference, status, redirectUrl?, instruction? }
 * verify(input)   -> { providerReference, status, failureCode?, failureMessage? }
 * refund(input)   -> { providerReference, status, failureCode?, failureMessage? }
 * verifyWebhook(input) -> boolean; throws DomainError when authenticity fails
 * normalizeWebhook(payload) -> {
 *   providerEventId, providerReference, status, amount?, currency?, failureCode?
 * }
 * describe() -> { code, methods, capabilities }
 */
const PAYMENT_PROVIDER_METHODS = Object.freeze([
  'initiate',
  'verify',
  'refund',
  'verifyWebhook',
  'normalizeWebhook',
  'describe',
]);

function assertProvider(provider) {
  return assertRepository(provider, PAYMENT_PROVIDER_METHODS, PaymentProviderRegistryToken);
}

module.exports = { PAYMENT_PROVIDER_METHODS, PaymentProviderRegistryToken, assertProvider };
