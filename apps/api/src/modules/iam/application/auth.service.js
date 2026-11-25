const {
  ConflictError,
  ForbiddenError,
  InfrastructureError,
  NotFoundError,
  TooManyRequestsError,
  UnauthorizedError,
  ValidationError,
} = require('../../../shared/kernel/errors');
const { createOtpCode, hashToken, secureEqual } = require('../../../shared/security/tokens');

function normalizeRoleCode(value) {
  return typeof value === 'string'
    ? value
        .trim()
        .toUpperCase()
        .replace(/[\s-]+/g, '_')
    : null;
}

function normalizePhone(value) {
  if (typeof value !== 'string') return null;
  const digits = value.trim().replace(/[\s()-]/g, '');
  const match = /^(?:\+?88)?(01[3-9]\d{8})$/.exec(digits);
  return match ? `+88${match[1]}` : null;
}

function clientIp(request) {
  const forwarded = request.headers['x-forwarded-for'];
  const value = Array.isArray(forwarded) ? forwarded[0] : forwarded;
  return String(value || request.ip || 'unknown')
    .split(',')[0]
    .trim()
    .slice(0, 64);
}

function requestMeta(request) {
  return {
    ipAddress: request ? clientIp(request) : null,
    userAgent: request?.headers?.['user-agent']
      ? String(request.headers['user-agent']).slice(0, 2000)
      : null,
    requestId: request?.requestId || null,
  };
}

function sanitizeSession(session, currentSessionId) {
  return {
    id: session.id,
    createdAt: session.created_at,
    expiresAt: session.expires_at,
    lastSeenAt: session.last_seen_at || null,
    revokedAt: session.revoked_at || null,
    ipAddress: session.ip_address || null,
    userAgent: session.user_agent || null,
    isCurrent: session.id === currentSessionId,
  };
}

class AuthService {
  constructor({
    store,
    passwordHasher,
    tokenManager,
    otpProviders,
    rateLimiter,
    authorization,
    eventBus,
    logger,
    env,
    policy,
  }) {
    if (
      !store ||
      !passwordHasher ||
      !tokenManager ||
      !otpProviders ||
      !rateLimiter ||
      !authorization ||
      !env
    ) {
      throw new TypeError('AuthService is missing a required dependency.');
    }
    this.store = store;
    this.passwordHasher = passwordHasher;
    this.tokenManager = tokenManager;
    this.otpProviders = otpProviders;
    this.rateLimiter = rateLimiter;
    this.authorization = authorization;
    this.eventBus = eventBus;
    this.logger = logger;
    this.env = env;
    this.policy = policy;
  }

  async audit(
    {
      action,
      entityType,
      entityId,
      actorUserId = null,
      organizationId = null,
      after = {},
      severity = 'INFO',
    },
    request,
  ) {
    const meta = requestMeta(request);
    const entry = {
      action,
      entityType,
      entityId: entityId || null,
      actorUserId,
      organizationId,
      after: { ...after, ...(meta.requestId ? { requestId: meta.requestId } : {}) },
      ipAddress: meta.ipAddress,
      userAgent: meta.userAgent,
      severity,
    };
    await this.store.appendAudit(entry);
    this.eventBus?.publish({
      type: action,
      moduleId: 'iam',
      aggregateId: actorUserId || entityId || 'anonymous',
      payload: entry.after,
    });
    return entry;
  }

  checkRateLimit(key, request) {
    const result = this.rateLimiter.consume(`${key}:${clientIp(request)}`);
    if (!result.allowed) {
      throw new TooManyRequestsError({
        message: 'Too many attempts. Try again later.',
        details: { retryAfterSeconds: result.retryAfterSeconds },
      });
    }
    return result;
  }

  async hashPolicyPassword(password) {
    try {
      return await this.passwordHasher.hashPassword(password, {
        minLength: this.env.AUTH_PASSWORD_MIN_LENGTH,
      });
    } catch (error) {
      if (error.code === 'PASSWORD_TOO_SHORT') {
        throw new ValidationError({
          message: error.message,
          details: { minLength: this.env.AUTH_PASSWORD_MIN_LENGTH },
        });
      }
      throw error;
    }
  }

  normalizeDestination(channel, destination) {
    if (channel === 'email') {
      const value = String(destination || '')
        .trim()
        .toLowerCase();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
        throw new ValidationError({ message: 'Invalid email destination.' });
      }
      return value;
    }
    const value = normalizePhone(destination);
    if (!value) throw new ValidationError({ message: 'Invalid phone destination.' });
    return value;
  }

  channelForPurpose(channel, purpose) {
    if (purpose === 'EMAIL_VERIFICATION' && channel !== 'email') {
      throw new ValidationError({ message: 'Email verification requires the email channel.' });
    }
    if (purpose === 'PHONE_VERIFICATION' && channel !== 'phone') {
      throw new ValidationError({ message: 'Phone verification requires the phone channel.' });
    }
    return channel;
  }

  otpHash(purpose, channel, destination, code) {
    return hashToken(`otp:${purpose}:${channel}:${destination}:${code}`);
  }

  async createAndSendOtp({ channel, purpose, destination, userId = null, request }) {
    this.channelForPurpose(channel, purpose);
    const normalized = this.normalizeDestination(channel, destination);
    this.checkRateLimit(`otp:${purpose}:${channel}:${normalized}`, request);

    const latest = await this.store.findLatestOtp({
      destination: normalized,
      purpose,
      channel,
      includeConsumed: true,
    });
    if (
      latest &&
      Date.now() - new Date(latest.created_at).getTime() <
        this.env.AUTH_OTP_RESEND_COOLDOWN_SECONDS * 1000
    ) {
      const retryAfterSeconds = Math.max(
        1,
        Math.ceil(
          (new Date(latest.created_at).getTime() +
            this.env.AUTH_OTP_RESEND_COOLDOWN_SECONDS * 1000 -
            Date.now()) /
            1000,
        ),
      );
      throw new ConflictError({
        message: 'An OTP was sent recently.',
        details: { retryAfterSeconds },
      });
    }

    const otpCode = createOtpCode(this.env.AUTH_OTP_LENGTH);
    const expiresAt = new Date(Date.now() + this.env.AUTH_OTP_TTL_SECONDS * 1000);
    const record = await this.store.createOtp({
      userId,
      email: channel === 'email' ? normalized : null,
      phone: channel === 'phone' ? normalized : null,
      purpose,
      codeHash: this.otpHash(purpose, channel, normalized, otpCode),
      maxAttempts: this.env.AUTH_OTP_MAX_ATTEMPTS,
      expiresAt,
    });

    const provider = channel === 'phone' ? this.otpProviders.sms : this.otpProviders.email;
    if (!provider) throw new InfrastructureError({ message: `No OTP provider for ${channel}.` });
    const delivery = await provider.send({
      destination: normalized,
      code: otpCode,
      purpose,
      expiresAt,
      requestId: request?.requestId || null,
    });

    await this.audit(
      {
        action: 'iam.otp.requested',
        entityType: 'otp',
        entityId: record.id,
        actorUserId: userId,
        after: { purpose, channel, expiresAt: expiresAt.toISOString() },
      },
      request,
    );

    const previewCode =
      this.env.NODE_ENV === 'production' || !delivery.previewCode
        ? undefined
        : { previewCode: delivery.previewCode };
    return {
      delivered: Boolean(delivery.delivered),
      channel,
      purpose,
      expiresAt: expiresAt.toISOString(),
      ...previewCode,
    };
  }

  async register({ kind, input, request }) {
    this.checkRateLimit(`register:${kind}`, request);
    const passwordHash = await this.hashPolicyPassword(input.password);
    const roleCodes = await this.authorization.validateRoleSelection(input.requestedRoleCodes);
    const email = kind === 'email' ? input.email.trim().toLowerCase() : null;
    const phone = kind === 'phone' ? normalizePhone(input.phone) : null;

    const user = await this.store.createUser({
      email,
      phone,
      passwordHash,
      profile: {
        firstName: input.profile.firstName,
        lastName: input.profile.lastName,
        nameBn: input.profile.nameBn || null,
        preferredLanguage: input.profile.preferredLanguage || 'EN',
      },
      roleCodes,
    });

    const verification = await this.createAndSendOtp({
      channel: kind,
      purpose: kind === 'email' ? 'EMAIL_VERIFICATION' : 'PHONE_VERIFICATION',
      destination: kind === 'email' ? email : phone,
      userId: user.id,
      request,
    });

    await this.audit(
      {
        action: 'iam.user.registered',
        entityType: 'user',
        entityId: user.id,
        actorUserId: user.id,
        after: {
          channel: kind,
          roleCodes,
          emailVerified: false,
          phoneVerified: false,
        },
      },
      request,
    );

    return {
      user: {
        id: user.id,
        email: user.email,
        phone: user.phone,
        roles: roleCodes,
      },
      verification,
    };
  }

  async requestOtp({ input, request }) {
    const channel = this.channelForPurpose(input.channel, input.purpose);
    const normalized = this.normalizeDestination(channel, input.destination);
    const user = await this.store.findUserByIdentifier(normalized);
    const requiresUser = ['EMAIL_VERIFICATION', 'PHONE_VERIFICATION'].includes(input.purpose);
    if (requiresUser && !user) {
      throw new ValidationError({ message: 'No matching account was found.' });
    }

    const result = await this.createAndSendOtp({
      channel,
      purpose: input.purpose,
      destination: normalized,
      userId: user?.id || null,
      request,
    });
    return { accepted: true, ...result };
  }

  async verifyOtp({ input, request }) {
    this.checkRateLimit(`otp:verify:${input.purpose}:${input.destination}`, request);
    const channel = this.channelForPurpose(input.channel, input.purpose);
    const normalized = this.normalizeDestination(channel, input.destination);
    const otp = await this.store.findLatestOtp({
      destination: normalized,
      purpose: input.purpose,
      channel,
    });
    if (!otp) throw new ValidationError({ message: 'Invalid or expired OTP.' });

    if (new Date(otp.expires_at).getTime() <= Date.now()) {
      throw new ValidationError({ message: 'OTP has expired.' });
    }
    if (otp.attempts >= otp.max_attempts) {
      throw new TooManyRequestsError({
        message: 'OTP attempt limit reached. Request a new OTP.',
        details: { maxAttempts: otp.max_attempts },
      });
    }

    const candidate = this.otpHash(input.purpose, channel, normalized, input.code);
    if (!secureEqual(candidate, otp.code_hash)) {
      const attempts = otp.attempts + 1;
      await this.store.updateOtp(otp.id, { attempts });
      await this.audit(
        {
          action: 'iam.otp.failed',
          entityType: 'otp',
          entityId: otp.id,
          actorUserId: otp.user_id,
          after: { purpose: input.purpose, attempts, maxAttempts: otp.max_attempts },
          severity: 'WARN',
        },
        request,
      );
      throw new ValidationError({
        message: 'Invalid OTP.',
        details: { attemptsRemaining: Math.max(0, otp.max_attempts - attempts) },
      });
    }

    const userId = otp.user_id;
    if (input.purpose === 'EMAIL_VERIFICATION' || input.purpose === 'PHONE_VERIFICATION') {
      if (!userId) throw new ValidationError({ message: 'Invalid OTP owner.' });
      await this.store.updateUser(userId, {
        ...(input.purpose === 'EMAIL_VERIFICATION'
          ? { is_email_verified: true }
          : { is_phone_verified: true }),
      });
    }

    let token;
    if (['PASSWORD_RESET', 'LOGIN', 'ACCOUNT_RECOVERY'].includes(input.purpose)) {
      token = this.tokenManager.createPurposeToken(input.purpose, {
        userId,
        otpId: otp.id,
        destination: normalized,
      });
      const payload = this.tokenManager.verifyPurposeToken(token, input.purpose);
      await this.store.updateOtp(otp.id, {
        consumed_at: new Date(),
        code_hash: hashToken(`purpose:${payload.jti}`),
      });
    } else {
      await this.store.updateOtp(otp.id, { consumed_at: new Date() });
    }

    await this.audit(
      {
        action: 'iam.otp.verified',
        entityType: 'otp',
        entityId: otp.id,
        actorUserId: userId,
        after: { purpose: input.purpose, channel },
      },
      request,
    );

    return {
      verified: true,
      purpose: input.purpose,
      ...(input.purpose === 'PASSWORD_RESET' ? { resetToken: token } : {}),
      ...(input.purpose === 'LOGIN' ? { loginToken: token } : {}),
      ...(input.purpose === 'ACCOUNT_RECOVERY' ? { recoveryToken: token } : {}),
    };
  }

  async consumePurposeToken(token, purpose) {
    const payload = this.tokenManager.verifyPurposeToken(token, purpose);
    const otp = await this.store.findOtpById(payload.otp);
    if (
      !otp ||
      !otp.consumed_at ||
      !secureEqual(otp.code_hash, hashToken(`purpose:${payload.jti}`))
    ) {
      throw new UnauthorizedError({ message: 'Token is invalid or already used.' });
    }
    await this.store.updateOtp(otp.id, { code_hash: hashToken(`used:${payload.jti}`) });
    return { payload, otp };
  }

  async issueSession({ user, request, client, deviceName }) {
    const sessionToken = this.tokenManager.createOpaqueToken(32);
    const sessionTokenHash = hashToken(sessionToken);
    const csrfToken = this.tokenManager.createOpaqueToken(24);
    const expiresAt = new Date(Date.now() + this.env.AUTH_SESSION_TTL_SECONDS * 1000);

    const session = await this.store.createSession({
      userId: user.id,
      sessionTokenHash,
      ipAddress: clientIp(request),
      userAgent: request?.headers?.['user-agent'] || null,
      deviceName,
      expiresAt,
    });

    const accessToken = this.tokenManager.createAccessToken({
      userId: user.id,
      sessionId: session.id,
      sessionTokenHash,
      csrfToken,
    });
    const refreshToken = this.tokenManager.createOpaqueToken(48);
    await this.store.createRefreshToken({
      userId: user.id,
      sessionId: session.id,
      tokenHash: hashToken(refreshToken),
      expiresAt: new Date(Date.now() + this.env.AUTH_REFRESH_TOKEN_TTL_SECONDS * 1000),
    });

    return {
      accessToken,
      refreshToken,
      csrfToken,
      sessionToken,
      tokenType: 'Bearer',
      expiresIn: this.env.AUTH_ACCESS_TOKEN_TTL_SECONDS,
      sessionId: session.id,
      client,
    };
  }

  async login({ input, request }) {
    this.checkRateLimit(`login:${input.identifier}`, request);
    const identifier = input.identifier.trim();
    const user = await this.store.findUserByIdentifier(identifier);
    let validPassword = false;
    if (user) {
      validPassword = await this.passwordHasher.verifyPassword(input.password, user.password_hash);
    } else {
      await this.passwordHasher.verifyDummyPassword(input.password);
    }

    if (!user || !validPassword) {
      if (user) {
        const attempts = user.failed_login_attempts + 1;
        const lockedUntil =
          attempts >= this.env.AUTH_MAX_FAILED_LOGINS
            ? new Date(Date.now() + this.env.AUTH_LOCKOUT_MINUTES * 60 * 1000)
            : user.locked_until;
        await this.store.updateUser(user.id, {
          failed_login_attempts: attempts,
          locked_until: lockedUntil,
        });
        await this.audit(
          {
            action: 'iam.login.failed',
            entityType: 'user',
            entityId: user.id,
            after: { reason: 'invalid_credentials', attempts },
            severity: 'WARN',
          },
          request,
        );
      }
      throw new UnauthorizedError({ message: 'Invalid credentials.' });
    }

    if (user.locked_until && new Date(user.locked_until).getTime() > Date.now()) {
      throw new TooManyRequestsError({
        message: 'Account is temporarily locked.',
        details: {
          retryAfterSeconds: Math.ceil((new Date(user.locked_until).getTime() - Date.now()) / 1000),
        },
      });
    }
    if (user.account_status !== 'ACTIVE') {
      throw new UnauthorizedError({ message: 'Account is not active.' });
    }

    await this.store.updateUser(user.id, {
      failed_login_attempts: 0,
      locked_until: null,
      last_login_at: new Date(),
    });

    const tokens = await this.issueSession({
      user,
      request,
      client: input.client,
      deviceName: input.deviceName,
    });
    await this.audit(
      {
        action: 'iam.login.succeeded',
        entityType: 'user',
        entityId: user.id,
        actorUserId: user.id,
        after: { client: input.client, sessionId: tokens.sessionId },
      },
      request,
    );
    return tokens;
  }

  async loginWithOtp({ input, request }) {
    const { payload } = await this.consumePurposeToken(input.loginToken, 'LOGIN');
    const user = await this.store.findUserById(payload.sub);
    if (!user || user.account_status !== 'ACTIVE') {
      throw new UnauthorizedError({ message: 'Account is not active.' });
    }
    const tokens = await this.issueSession({
      user,
      request,
      client: input.client,
      deviceName: input.deviceName,
    });
    await this.audit(
      {
        action: 'iam.login.otp.succeeded',
        entityType: 'user',
        entityId: user.id,
        actorUserId: user.id,
        after: { client: input.client, sessionId: tokens.sessionId },
      },
      request,
    );
    return tokens;
  }

  async refresh({ input, request }) {
    this.checkRateLimit('refresh', request);
    const token = input.refreshToken;
    if (!token) throw new UnauthorizedError({ message: 'A refresh token is required.' });

    const stored = await this.store.findRefreshTokenByHash(hashToken(token));
    if (!stored) throw new UnauthorizedError({ message: 'Invalid refresh token.' });
    if (stored.rotated_to_id) {
      const staleSession = stored.session_id
        ? await this.store.findSession(stored.session_id)
        : null;
      if (staleSession && !staleSession.revoked_at) {
        await this.store.updateSession(staleSession.id, { revoked_at: new Date() });
        await this.store.revokeRefreshTokensForSession(staleSession.id);
      }
      await this.audit(
        {
          action: 'iam.refresh.reuse_detected',
          entityType: 'session',
          entityId: staleSession?.id || null,
          actorUserId: stored.user_id,
          after: { reason: 'refresh_token_reuse', tokenId: stored.id },
          severity: 'WARN',
        },
        request,
      );
      throw new UnauthorizedError({ message: 'Refresh token reuse detected. Session revoked.' });
    }

    if (new Date(stored.expires_at).getTime() <= Date.now() || stored.revoked_at) {
      throw new UnauthorizedError({ message: 'Refresh token is expired or revoked.' });
    }

    const session = stored.session_id ? await this.store.findSession(stored.session_id) : null;
    if (!session || session.revoked_at || new Date(session.expires_at).getTime() <= Date.now()) {
      throw new UnauthorizedError({ message: 'Session is invalid or expired.' });
    }

    const user = await this.store.findUserById(stored.user_id);
    if (!user || user.account_status !== 'ACTIVE') {
      throw new UnauthorizedError({ message: 'Account is not active.' });
    }

    const refreshedToken = this.tokenManager.createOpaqueToken(48);
    const next = await this.store.createRefreshToken({
      userId: stored.user_id,
      sessionId: session.id,
      tokenHash: hashToken(refreshedToken),
      expiresAt: new Date(Date.now() + this.env.AUTH_REFRESH_TOKEN_TTL_SECONDS * 1000),
    });
    await this.store.updateRefreshToken(stored.id, {
      rotated_to_id: next.id,
      revoked_at: new Date(),
    });

    const csrfToken = this.tokenManager.createOpaqueToken(24);
    const accessToken = this.tokenManager.createAccessToken({
      userId: user.id,
      sessionId: session.id,
      sessionTokenHash: session.session_token_hash,
      csrfToken,
    });

    await this.audit(
      {
        action: 'iam.refresh.rotated',
        entityType: 'session',
        entityId: session.id,
        actorUserId: user.id,
        after: { oldTokenId: stored.id, newTokenId: next.id },
      },
      request,
    );

    return {
      accessToken,
      refreshToken: refreshedToken,
      csrfToken,
      tokenType: 'Bearer',
      expiresIn: this.env.AUTH_ACCESS_TOKEN_TTL_SECONDS,
      sessionId: session.id,
      client: input.client,
    };
  }

  async logout({ accessToken, via, refreshToken, request }) {
    const sessionIds = new Set();
    let userId = null;

    if (accessToken) {
      try {
        const context = await this.authorization.authenticateAccessToken(accessToken, {
          via,
          request,
        });
        userId = context.user.id;
        if (context.session?.id) sessionIds.add(context.session.id);
      } catch {
        // A stale access token must not prevent refresh-cookie logout.
      }
    }

    if (refreshToken) {
      const stored = await this.store.findRefreshTokenByHash(hashToken(refreshToken));
      if (stored && !stored.revoked_at) {
        userId = stored.user_id;
        if (stored.session_id) sessionIds.add(stored.session_id);
        await this.store.updateRefreshToken(stored.id, { revoked_at: new Date() });
      }
    }

    for (const sessionId of sessionIds) {
      const session = await this.store.findSession(sessionId);
      if (session && !session.revoked_at) {
        await this.store.updateSession(sessionId, { revoked_at: new Date() });
      }
      await this.store.revokeRefreshTokensForSession(sessionId);
    }

    await this.audit(
      {
        action: 'iam.logout',
        entityType: 'session',
        entityId: [...sessionIds][0] || null,
        actorUserId: userId,
        after: { sessionsRevoked: sessionIds.size },
      },
      request,
    );
    return { loggedOut: true, sessionsRevoked: sessionIds.size };
  }

  async revokeAllSessions(userId) {
    const sessions = await this.store.listSessions(userId);
    for (const session of sessions) {
      if (!session.revoked_at)
        await this.store.updateSession(session.id, { revoked_at: new Date() });
      await this.store.revokeRefreshTokensForSession(session.id);
    }
    return sessions.length;
  }

  async logoutAll({ context, request }) {
    const revoked = await this.revokeAllSessions(context.user.id);
    await this.audit(
      {
        action: 'iam.logout.all',
        entityType: 'user',
        entityId: context.user.id,
        actorUserId: context.user.id,
        after: { sessionsRevoked: revoked },
      },
      request,
    );
    return { loggedOut: true, sessionsRevoked: revoked };
  }

  async changePassword({ context, input, request }) {
    const user = await this.store.findUserById(context.user.id);
    if (!user) throw new UnauthorizedError({ message: 'Account was not found.' });
    const currentValid = await this.passwordHasher.verifyPassword(
      input.currentPassword,
      user.password_hash,
    );
    if (!currentValid) {
      await this.audit(
        {
          action: 'iam.password.change.failed',
          entityType: 'user',
          entityId: user.id,
          actorUserId: user.id,
          after: { reason: 'invalid_current_password' },
          severity: 'WARN',
        },
        request,
      );
      throw new UnauthorizedError({ message: 'Current password is incorrect.' });
    }

    const passwordHash = await this.hashPolicyPassword(input.newPassword);
    await this.store.updateUser(user.id, { password_hash: passwordHash });
    let revoked = 0;
    if (input.revokeOtherSessions) {
      const sessions = await this.store.listSessions(user.id);
      for (const session of sessions) {
        if (session.id === context.session?.id) continue;
        if (!session.revoked_at)
          await this.store.updateSession(session.id, { revoked_at: new Date() });
        await this.store.revokeRefreshTokensForSession(session.id);
        revoked += 1;
      }
    }
    await this.audit(
      {
        action: 'iam.password.changed',
        entityType: 'user',
        entityId: user.id,
        actorUserId: user.id,
        after: { otherSessionsRevoked: revoked },
      },
      request,
    );
    return { changed: true, otherSessionsRevoked: revoked };
  }

  async forgotPassword({ input, request }) {
    const identifier = input.identifier.trim();
    this.checkRateLimit(`forgot:${identifier}`, request);
    const user = await this.store.findUserByIdentifier(identifier);
    let delivery = null;
    if (user) {
      const channel = /@/.test(identifier) ? 'email' : 'phone';
      delivery = await this.createAndSendOtp({
        channel,
        purpose: 'PASSWORD_RESET',
        destination: channel === 'email' ? user.email : user.phone,
        userId: user.id,
        request,
      });
    }
    return {
      accepted: true,
      message: 'If the account exists, a reset OTP has been sent.',
      ...(delivery?.previewCode ? { previewCode: delivery.previewCode } : {}),
    };
  }

  async resetPassword({ input, request }) {
    const { payload } = await this.consumePurposeToken(input.resetToken, 'PASSWORD_RESET');
    const user = await this.store.findUserById(payload.sub || payload.otp?.user_id);
    if (!user) throw new UnauthorizedError({ message: 'Reset request is invalid.' });

    const passwordHash = await this.hashPolicyPassword(input.newPassword);
    await this.store.updateUser(user.id, {
      password_hash: passwordHash,
      failed_login_attempts: 0,
      locked_until: null,
    });
    const revoked = await this.revokeAllSessions(user.id);
    await this.audit(
      {
        action: 'iam.password.reset',
        entityType: 'user',
        entityId: user.id,
        actorUserId: user.id,
        after: { sessionsRevoked: revoked },
      },
      request,
    );
    return { reset: true, sessionsRevoked: revoked };
  }

  async deactivate({ context, input, request }) {
    await this.store.updateUser(context.user.id, { account_status: 'DEACTIVATED' });
    const revoked = await this.revokeAllSessions(context.user.id);
    await this.audit(
      {
        action: 'iam.account.deactivated',
        entityType: 'user',
        entityId: context.user.id,
        actorUserId: context.user.id,
        after: { reason: input.reason || null, sessionsRevoked: revoked },
      },
      request,
    );
    return { deactivated: true, sessionsRevoked: revoked };
  }

  async reactivateRequest({ input, request }) {
    const identifier = input.identifier.trim();
    this.checkRateLimit(`reactivate:${identifier}`, request);
    const user = await this.store.findUserByIdentifier(identifier);
    let delivery = null;
    if (user && ['DEACTIVATED', 'LOCKED'].includes(user.account_status)) {
      const channel = /@/.test(identifier) ? 'email' : 'phone';
      delivery = await this.createAndSendOtp({
        channel,
        purpose: 'ACCOUNT_RECOVERY',
        destination: channel === 'email' ? user.email : user.phone,
        userId: user.id,
        request,
      });
    }
    return {
      accepted: true,
      message: 'If the account is recoverable, an OTP has been sent.',
      ...(delivery?.previewCode ? { previewCode: delivery.previewCode } : {}),
    };
  }

  async reactivate({ input, request }) {
    const { payload } = await this.consumePurposeToken(input.recoveryToken, 'ACCOUNT_RECOVERY');
    const user = await this.store.findUserById(payload.sub);
    if (!user) throw new UnauthorizedError({ message: 'Recovery request is invalid.' });

    const patch = {
      account_status: 'ACTIVE',
      failed_login_attempts: 0,
      locked_until: null,
    };
    if (input.newPassword) patch.password_hash = await this.hashPolicyPassword(input.newPassword);
    await this.store.updateUser(user.id, patch);
    await this.audit(
      {
        action: 'iam.account.reactivated',
        entityType: 'user',
        entityId: user.id,
        actorUserId: user.id,
        after: { passwordChanged: Boolean(input.newPassword) },
      },
      request,
    );
    return { reactivated: true };
  }

  me(context) {
    return this.authorization.serializeContext(context);
  }

  async listSessions(context) {
    const sessions = await this.store.listSessions(context.user.id);
    return sessions.map((session) => sanitizeSession(session, context.session?.id));
  }

  async revokeSession({ context, sessionId, request }) {
    const session = await this.store.findSession(sessionId);
    if (!session) throw new NotFoundError({ message: 'Session was not found.' });
    if (session.user_id !== context.user.id && !context.isSuperAdmin) {
      throw new ForbiddenError({ message: 'Access to this session is denied.' });
    }
    if (!session.revoked_at) await this.store.updateSession(sessionId, { revoked_at: new Date() });
    await this.store.revokeRefreshTokensForSession(sessionId);
    await this.audit(
      {
        action: 'iam.session.revoked',
        entityType: 'session',
        entityId: sessionId,
        actorUserId: context.user.id,
        after: { ownerUserId: session.user_id },
      },
      request,
    );
    return { revoked: true, sessionId };
  }

  async assignRole({ context, userId, roleCode, organizationId, request }) {
    await this.authorization.assertPermission(context, 'roles.manage');
    const user = await this.store.findUserById(userId);
    if (!user) throw new NotFoundError({ message: 'User was not found.' });

    const role = await this.store.findRoleByCode(roleCode);
    if (!role) throw new NotFoundError({ message: `Role '${roleCode}' was not found.` });

    let scopedOrganizationId = organizationId || null;
    if (role.scope === 'ORGANIZATION') {
      if (!scopedOrganizationId) {
        throw new ValidationError({
          message: 'organizationId is required for organization roles.',
        });
      }
      await this.authorization.assertOrganization(context, scopedOrganizationId);
      await this.store.addOrganizationMember({
        organizationId: scopedOrganizationId,
        userId,
        status: 'ACTIVE',
      });
    } else {
      scopedOrganizationId = null;
    }

    const assignment = await this.store.addUserRole({
      userId,
      roleCode: role.code,
      organizationId: scopedOrganizationId,
      grantedBy: context.user.id,
    });
    await this.audit(
      {
        action: 'iam.role.assigned',
        entityType: 'user',
        entityId: userId,
        actorUserId: context.user.id,
        organizationId: scopedOrganizationId,
        after: { roleCode: role.code, assignmentId: assignment.id },
      },
      request,
    );
    return {
      userId,
      roleCode: role.code,
      organizationId: scopedOrganizationId,
    };
  }

  async updateRolePermissions({ context, roleCode, permissionCodes, request }) {
    await this.authorization.assertPermission(context, 'roles.manage');
    const code = normalizeRoleCode(roleCode);
    const role = await this.store.findRoleByCode(code);
    if (!role) throw new NotFoundError({ message: `Role '${roleCode}' was not found.` });

    // Permission codes are dot-separated and case-sensitive; only role codes
    // use the uppercasing normalizer.
    const known = new Set(this.policy.permissions.map((permission) => permission.code));
    const normalized = [...new Set(permissionCodes.map((permission) => permission.trim()))];
    const unknown = normalized.find((permission) => !known.has(permission));
    if (unknown) throw new ValidationError({ message: `Unknown permission '${unknown}'.` });

    const updated = await this.store.replaceRolePermissions(code, normalized);
    this.policy.rolePermissions[code] = [...normalized];
    await this.audit(
      {
        action: 'iam.role.permissions.updated',
        entityType: 'role',
        entityId: code,
        actorUserId: context.user.id,
        after: { permissionCodes: normalized },
      },
      request,
    );
    return { roleCode: code, permissions: updated.permissions };
  }

  listRoles(_context) {
    return this.policy.roles.map((role) => ({
      ...role,
      permissions: this.policy.rolePermissions[role.code] || [],
    }));
  }

  listPermissions(_context) {
    return this.policy.permissions.map((permission) => ({ ...permission }));
  }

  permissionMatrix(_context) {
    return this.policy.roles.map((role) => ({
      roleCode: role.code,
      roleName: role.name,
      scope: role.scope,
      permissions: [...(this.policy.rolePermissions[role.code] || [])],
    }));
  }

  listOrganizations(context) {
    return context.organizations;
  }

  async getOrganizationMembers(organizationId) {
    const members = await this.store.listOrganizationMembers(organizationId);
    return members.map((member) => ({
      userId: member.user_id,
      status: member.status,
      email: member.user?.email || null,
      phone: member.user?.phone || null,
    }));
  }

  async getUserSummary(userId) {
    const user = await this.store.findUserById(userId);
    if (!user) throw new NotFoundError({ message: 'User was not found.' });
    return {
      id: user.id,
      email: user.email,
      phone: user.phone,
      accountStatus: user.account_status,
    };
  }
}

module.exports = { AuthService, normalizePhone, clientIp, requestMeta };
