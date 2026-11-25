const { HTTP_STATUS, fail } = require('@cropsy/shared');

const {
  InfrastructureError,
  NotFoundError,
  ValidationError,
  isAppError,
} = require('../kernel/errors');

function normalizeError(error) {
  if (isAppError(error)) return error;

  if (error && (error.validation || error.code === 'FST_ERR_VALIDATION')) {
    return new ValidationError({
      message: 'Request validation failed',
      details: error.validation || error.details,
      cause: error,
    });
  }

  const status = error && Number.isInteger(error.statusCode) ? error.statusCode : 500;

  if (status === HTTP_STATUS.NOT_FOUND) {
    return new NotFoundError({ message: 'Route not found', cause: error });
  }

  if (status >= 400 && status < 500) {
    return new ValidationError({
      message: error.message || 'Invalid request',
      details: error.details,
      cause: error,
    });
  }

  return new InfrastructureError({
    message: 'Internal server error',
    cause: error,
  });
}

function registerErrorHandling(app) {
  app.setNotFoundHandler((request, reply) => {
    const error = new NotFoundError({ message: 'Route not found' });
    reply.code(error.status).send(
      fail(error.code, {
        message: error.message,
        requestId: request.requestId || null,
        method: request.method,
        path: request.url.split('?')[0],
      }),
    );
  });

  app.setErrorHandler((error, request, reply) => {
    const normalized = normalizeError(error);
    const context = {
      requestId: request.requestId || null,
      apiVersion: request.apiVersion || null,
      moduleId: request.moduleId || null,
      method: request.method,
      path: request.url.split('?')[0],
      code: normalized.code,
      status: normalized.status,
    };

    if (normalized.status >= 500) {
      app.log.error({ ...context, err: error }, 'request.failed');
    } else {
      app.log.warn({ ...context, err: error }, 'request.rejected');
    }

    reply.code(normalized.status).send(
      fail(normalized.code, {
        message: normalized.message,
        ...(normalized.details === undefined ? {} : { details: normalized.details }),
        requestId: context.requestId,
        method: context.method,
        path: context.path,
      }),
    );
  });
}

module.exports = { normalizeError, registerErrorHandling };
