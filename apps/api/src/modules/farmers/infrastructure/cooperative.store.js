const { randomUUID } = require('node:crypto');

const { ConflictError, NotFoundError } = require('../../../shared/kernel/errors');

const COLLECTIONS = Object.freeze([
  'farmerGroups',
  'groupMembers',
  'campaigns',
  'contributions',
  'purchaseRequests',
  'allocations',
  'earnings',
]);

const PRISMA_DELEGATES = Object.freeze({
  farmerGroups: 'farmerGroup',
  groupMembers: 'farmerGroupMember',
  campaigns: 'cooperativeCampaign',
  contributions: 'groupContribution',
  purchaseRequests: 'groupPurchaseRequest',
  allocations: 'groupAllocation',
  earnings: 'groupEarning',
});

function clone(value) {
  return value === null || value === undefined ? value : structuredClone(value);
}

function normalize(value) {
  if (value === null || value === undefined) return value;
  if (value instanceof Date) return value;
  if (typeof value === 'object' && typeof value.toNumber === 'function') return Number(value);
  if (Array.isArray(value)) return value.map(normalize);
  if (typeof value === 'object') {
    const result = {};
    for (const [key, item] of Object.entries(value)) result[key] = normalize(item);
    return result;
  }
  return value;
}

function matches(record, filters) {
  return Object.entries(filters || {}).every(([key, value]) => {
    if (value === undefined) return true;
    if (key === 'since') return record.created_at >= value;
    if (key === 'until') return record.created_at <= value;
    return record[key] === value;
  });
}

function whereFrom(filters = {}) {
  const where = {};
  for (const [key, value] of Object.entries(filters)) {
    if (value === undefined) continue;
    if (key === 'since') {
      where.created_at = { ...(where.created_at || {}), gte: value };
    } else if (key === 'until') {
      where.created_at = { ...(where.created_at || {}), lte: value };
    } else {
      where[key] = Array.isArray(value) ? { in: value } : value;
    }
  }
  return where;
}

function translateError(error) {
  if (error instanceof ConflictError || error instanceof NotFoundError) return error;
  if (error?.code === 'P2002') {
    return new ConflictError({ message: 'A cooperative record is already in use.' });
  }
  if (error?.code === 'P2025') {
    return new NotFoundError({ message: 'Cooperative record was not found.' });
  }
  return error;
}

/**
 * Adds cooperative selling persistence methods to the existing farm store.
 * Records use snake_case fields and number values in both implementations.
 */
function attachInMemoryCooperative(store) {
  for (const name of COLLECTIONS) store[name] = new Map();

  function insert(name, input) {
    const timestamp = new Date();
    const record = {
      ...input,
      id: input.id || randomUUID(),
      created_at: input.created_at ? new Date(input.created_at) : timestamp,
      updated_at: input.updated_at ? new Date(input.updated_at) : timestamp,
    };
    store[name].set(record.id, clone(record));
    return clone(record);
  }

  function update(name, id, patch) {
    const record = store[name].get(id);
    if (!record) throw new NotFoundError({ message: 'Cooperative record was not found.' });
    const next = { ...record, ...patch, updated_at: new Date() };
    store[name].set(id, clone(next));
    return clone(next);
  }

  function list(name, filters) {
    return Promise.resolve(
      [...store[name].values()]
        .filter((record) => matches(record, filters))
        .sort((a, b) => b.created_at.getTime() - a.created_at.getTime())
        .map(clone),
    );
  }

  function find(name, id) {
    return Promise.resolve(clone(store[name].get(id) || null));
  }

  store.listFarmerGroups = (filters) => list('farmerGroups', filters);
  store.findFarmerGroup = (id) => find('farmerGroups', id);
  store.createFarmerGroup = (input) => Promise.resolve(insert('farmerGroups', input));
  store.updateFarmerGroup = (id, patch) => Promise.resolve(update('farmerGroups', id, patch));

  store.findGroupMember = (groupId, userId) =>
    Promise.resolve(
      clone(
        [...store.groupMembers.values()].find(
          (item) => item.group_id === groupId && item.user_id === userId,
        ) || null,
      ),
    );
  store.listGroupMembers = (filters) => list('groupMembers', filters);
  store.createGroupMember = (input) => Promise.resolve(insert('groupMembers', input));
  store.updateGroupMember = (id, patch) => Promise.resolve(update('groupMembers', id, patch));

  store.listCampaigns = (filters) => list('campaigns', filters);
  store.findCampaign = (id) => find('campaigns', id);
  store.createCampaign = (input) => Promise.resolve(insert('campaigns', input));
  store.updateCampaign = (id, patch) => Promise.resolve(update('campaigns', id, patch));

  store.listContributions = (filters) => list('contributions', filters);
  store.findContribution = (id) => find('contributions', id);
  store.createContribution = (input) => Promise.resolve(insert('contributions', input));
  store.updateContribution = (id, patch) => Promise.resolve(update('contributions', id, patch));

  store.listPurchaseRequests = (filters) => list('purchaseRequests', filters);
  store.findPurchaseRequest = (id) => find('purchaseRequests', id);
  store.createPurchaseRequest = (input) => Promise.resolve(insert('purchaseRequests', input));
  store.updatePurchaseRequest = (id, patch) =>
    Promise.resolve(update('purchaseRequests', id, patch));

  store.listAllocations = (filters) => list('allocations', filters);
  store.findAllocation = (id) => find('allocations', id);
  store.createAllocation = (input) => Promise.resolve(insert('allocations', input));
  store.updateAllocation = (id, patch) => Promise.resolve(update('allocations', id, patch));

  store.listEarnings = (filters) => list('earnings', filters);
  store.findEarning = (id) => find('earnings', id);
  store.createEarning = (input) => Promise.resolve(insert('earnings', input));
  store.updateEarning = (id, patch) => Promise.resolve(update('earnings', id, patch));
}

/**
 * Adds the same cooperative persistence methods backed by Prisma delegates.
 */
function attachPrismaCooperative(store) {
  function delegate(name) {
    return store.prisma[PRISMA_DELEGATES[name]];
  }

  async function list(name, filters) {
    try {
      const records = await delegate(name).findMany({
        where: whereFrom(filters),
        orderBy: { created_at: 'desc' },
      });
      return records.map(normalize);
    } catch (error) {
      throw translateError(error);
    }
  }

  async function find(name, id) {
    try {
      const record = await delegate(name).findUnique({ where: { id } });
      return record ? normalize(record) : null;
    } catch (error) {
      throw translateError(error);
    }
  }

  async function create(name, input) {
    try {
      return normalize(await delegate(name).create({ data: input }));
    } catch (error) {
      throw translateError(error);
    }
  }

  async function update(name, id, patch) {
    try {
      return normalize(await delegate(name).update({ where: { id }, data: patch }));
    } catch (error) {
      throw translateError(error);
    }
  }

  store.listFarmerGroups = (filters) => list('farmerGroups', filters);
  store.findFarmerGroup = (id) => find('farmerGroups', id);
  store.createFarmerGroup = (input) => create('farmerGroups', input);
  store.updateFarmerGroup = (id, patch) => update('farmerGroups', id, patch);

  store.findGroupMember = async (groupId, userId) => {
    try {
      const record = await delegate('groupMembers').findUnique({
        where: { group_id_user_id: { group_id: groupId, user_id: userId } },
      });
      return record ? normalize(record) : null;
    } catch (error) {
      throw translateError(error);
    }
  };
  store.listGroupMembers = (filters) => list('groupMembers', filters);
  store.createGroupMember = (input) => create('groupMembers', input);
  store.updateGroupMember = (id, patch) => update('groupMembers', id, patch);

  store.listCampaigns = (filters) => list('campaigns', filters);
  store.findCampaign = (id) => find('campaigns', id);
  store.createCampaign = (input) => create('campaigns', input);
  store.updateCampaign = (id, patch) => update('campaigns', id, patch);

  store.listContributions = (filters) => list('contributions', filters);
  store.findContribution = (id) => find('contributions', id);
  store.createContribution = (input) => create('contributions', input);
  store.updateContribution = (id, patch) => update('contributions', id, patch);

  store.listPurchaseRequests = (filters) => list('purchaseRequests', filters);
  store.findPurchaseRequest = (id) => find('purchaseRequests', id);
  store.createPurchaseRequest = (input) => create('purchaseRequests', input);
  store.updatePurchaseRequest = (id, patch) => update('purchaseRequests', id, patch);

  store.listAllocations = (filters) => list('allocations', filters);
  store.findAllocation = (id) => find('allocations', id);
  store.createAllocation = (input) => create('allocations', input);
  store.updateAllocation = (id, patch) => update('allocations', id, patch);

  store.listEarnings = (filters) => list('earnings', filters);
  store.findEarning = (id) => find('earnings', id);
  store.createEarning = (input) => create('earnings', input);
  store.updateEarning = (id, patch) => update('earnings', id, patch);
}

module.exports = {
  attachInMemoryCooperative,
  attachPrismaCooperative,
  normalizeCooperative: normalize,
};
