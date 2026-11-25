const { InfrastructureError } = require('../kernel/errors');

/**
 * Real OTP delivery adapter. The API never verifies an OTP by comparing against
 * the value sent to the provider; it only verifies a salted hash stored by the
 * auth store. Provider-specific behavior is configured through an HTTP endpoint
 * so no SMS vendor, email vendor, price, or template policy is invented here.
 */
class HttpOtpProvider {
  constructor({ url, token = '', timeoutMs = 5000, channel, fetchImpl = globalThis.fetch } = {}) {
    if (typeof url !== 'string' || url.length === 0) {
      throw new TypeError(`A URL is required for the ${channel} OTP provider.`);
    }
    if (typeof fetchImpl !== 'function') {
      throw new TypeError('Global fetch or an injected fetch implementation is required.');
    }
    this.url = url;
    this.token = token;
    this.timeoutMs = timeoutMs;
    this.channel = channel;
    this.fetchImpl = fetchImpl;
  }

  async send({ destination, code, purpose, expiresAt, requestId }) {
    let response;
    try {
      response = await this.fetchImpl(this.url, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          ...(this.token ? { authorization: `Bearer ${this.token}` } : {}),
          ...(requestId ? { 'x-request-id': requestId } : {}),
        },
        body: JSON.stringify({
          channel: this.channel,
          destination,
          purpose,
          code,
          expiresAt: expiresAt.toISOString(),
          requestId: requestId || null,
        }),
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch (cause) {
      throw new InfrastructureError({
        message: `OTP provider request failed for ${this.channel}.`,
        cause,
      });
    }

    if (!response.ok) {
      throw new InfrastructureError({
        message: `OTP provider rejected the ${this.channel} delivery request (${response.status}).`,
        details: { status: response.status },
      });
    }
    return { delivered: true, channel: this.channel };
  }
}

/**
 * Development-only adapter. It returns the generated code in the API response
 * so local and automated clients can complete a flow. It does not bypass OTP
 * verification: the submitted code is still hashed and checked by AuthService.
 */
class PreviewOtpProvider {
  constructor({ channel } = {}) {
    this.channel = channel;
  }

  async send({ destination, code, purpose, expiresAt }) {
    return {
      delivered: true,
      channel: this.channel,
      previewCode: code,
      destination,
      purpose,
      expiresAt: expiresAt.toISOString(),
    };
  }
}

function createOtpProviders(env, overrides = {}) {
  if (overrides.sms && overrides.email) return overrides;

  const mode = env.AUTH_OTP_PROVIDER_MODE;
  if (mode === 'http') {
    return {
      sms:
        overrides.sms ||
        new HttpOtpProvider({
          channel: 'sms',
          url: env.AUTH_SMS_PROVIDER_URL,
          token: env.AUTH_SMS_PROVIDER_TOKEN,
          timeoutMs: env.AUTH_OTP_PROVIDER_TIMEOUT_MS,
        }),
      email:
        overrides.email ||
        new HttpOtpProvider({
          channel: 'email',
          url: env.AUTH_EMAIL_PROVIDER_URL,
          token: env.AUTH_EMAIL_PROVIDER_TOKEN,
          timeoutMs: env.AUTH_OTP_PROVIDER_TIMEOUT_MS,
        }),
    };
  }

  if (env.NODE_ENV === 'production') {
    throw new InfrastructureError({
      message: 'Preview OTP provider is not allowed in production.',
    });
  }

  return {
    sms: overrides.sms || new PreviewOtpProvider({ channel: 'sms' }),
    email: overrides.email || new PreviewOtpProvider({ channel: 'email' }),
  };
}

module.exports = {
  HttpOtpProvider,
  PreviewOtpProvider,
  createOtpProviders,
};
