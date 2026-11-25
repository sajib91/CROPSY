const HTTP_STATUS = Object.freeze({
  OK: 200,
  CREATED: 201,
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  INTERNAL_SERVER_ERROR: 500,
  SERVICE_UNAVAILABLE: 503,
});

function ok(data, meta) {
  return {
    success: true,
    data,
    ...(meta === undefined ? {} : { meta }),
  };
}

function fail(error, meta) {
  return {
    success: false,
    error,
    ...(meta === undefined ? {} : { meta }),
  };
}

function nowIso() {
  return new Date().toISOString();
}

module.exports = {
  HTTP_STATUS,
  ok,
  fail,
  nowIso,
};
