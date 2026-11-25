class AppError extends Error {
  constructor({ code, message, status = 500, details, cause } = {}) {
    super(message || code || 'Application error', cause === undefined ? undefined : { cause });
    this.name = new.target.name;
    this.code = code || 'application_error';
    this.status = status;
    this.details = details;
  }

  toJSON() {
    return {
      code: this.code,
      message: this.message,
      status: this.status,
      ...(this.details === undefined ? {} : { details: this.details }),
    };
  }
}

class DomainError extends AppError {
  constructor(options) {
    super({ code: options.code || 'domain_error', status: 400, ...options });
  }
}

class ValidationError extends AppError {
  constructor({ message = 'Request validation failed', details, cause } = {}) {
    super({ code: 'validation_error', message, status: 400, details, cause });
  }
}

class NotFoundError extends DomainError {
  constructor({ message = 'Resource not found', details } = {}) {
    super({ code: 'not_found', message, status: 404, details });
  }
}

class UnauthorizedError extends AppError {
  constructor({ message = 'Authentication is required', details, cause } = {}) {
    super({ code: 'unauthorized', message, status: 401, details, cause });
  }
}

class ForbiddenError extends AppError {
  constructor({ message = 'Access is denied', details, cause } = {}) {
    super({ code: 'forbidden', message, status: 403, details, cause });
  }
}

class ConflictError extends DomainError {
  constructor({ message = 'Resource conflict', details } = {}) {
    super({ code: 'conflict', message, status: 409, details });
  }
}

class TooManyRequestsError extends AppError {
  constructor({ message = 'Too many requests', details } = {}) {
    super({ code: 'rate_limited', message, status: 429, details });
  }
}

class InfrastructureError extends AppError {
  constructor({
    message = 'Infrastructure failure',
    details,
    cause,
    code = 'infrastructure_error',
  } = {}) {
    super({ code, message, status: 500, details, cause });
  }
}

class NotImplementedError extends InfrastructureError {
  constructor({ message = 'Not implemented', details } = {}) {
    super({ code: 'not_implemented', message, status: 501, details });
  }
}

function isAppError(error) {
  return error instanceof AppError;
}

module.exports = {
  AppError,
  DomainError,
  ValidationError,
  NotFoundError,
  UnauthorizedError,
  ForbiddenError,
  ConflictError,
  TooManyRequestsError,
  InfrastructureError,
  NotImplementedError,
  isAppError,
};
