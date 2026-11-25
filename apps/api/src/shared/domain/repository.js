function defineRepositoryToken(name) {
  return Symbol.for(`cropsy.repository.${name}`);
}

function assertRepository(repository, methods = [], token) {
  const label = token === undefined ? 'Repository' : String(token);
  if (!repository || typeof repository !== 'object') {
    throw new TypeError(`${label} must be an object.`);
  }

  const missing = methods.filter((method) => typeof repository[method] !== 'function');
  if (missing.length > 0) {
    throw new TypeError(`${label} is missing required method(s): ${missing.join(', ')}.`);
  }

  return repository;
}

module.exports = { defineRepositoryToken, assertRepository };
