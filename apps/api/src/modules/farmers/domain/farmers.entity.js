const { Entity } = require('../../../shared/kernel/entity');

const MODULE_ID = 'farmers';
const MODULE_NAME = 'Farmer Management';

const FARMER_GROUP_STATUSES = Object.freeze(['ACTIVE', 'SUSPENDED', 'DISSOLVED']);
const GROUP_MEMBER_ROLES = Object.freeze(['LEADER', 'MEMBER']);
const GROUP_MEMBER_STATUSES = Object.freeze(['PENDING', 'ACTIVE', 'REMOVED']);
const COOPERATIVE_CAMPAIGN_STATUSES = Object.freeze(['DRAFT', 'OPEN', 'CLOSED', 'CANCELLED']);
const GROUP_CONTRIBUTION_STATUSES = Object.freeze([
  'PENDING',
  'CONFIRMED',
  'REJECTED',
  'WITHDRAWN',
]);
const GROUP_PURCHASE_REQUEST_STATUSES = Object.freeze([
  'PENDING',
  'ACCEPTED',
  'REJECTED',
  'FULFILLED',
  'CANCELLED',
]);
const GROUP_ALLOCATION_STATUSES = Object.freeze(['PROPOSED', 'FINALIZED', 'CANCELLED']);
const GROUP_EARNING_STATUSES = Object.freeze(['ACCRUED', 'PAID', 'REVERSED']);
const ALLOCATION_POLICY_CODES = Object.freeze(['PROPORTIONAL', 'QUALITY_WEIGHTED']);

class FarmersEntity extends Entity {
  constructor({ id } = {}) {
    super({ id, moduleId: MODULE_ID, name: MODULE_NAME });
  }
}

module.exports = {
  MODULE_ID,
  MODULE_NAME,
  FarmersEntity,
  FARMER_GROUP_STATUSES,
  GROUP_MEMBER_ROLES,
  GROUP_MEMBER_STATUSES,
  COOPERATIVE_CAMPAIGN_STATUSES,
  GROUP_CONTRIBUTION_STATUSES,
  GROUP_PURCHASE_REQUEST_STATUSES,
  GROUP_ALLOCATION_STATUSES,
  GROUP_EARNING_STATUSES,
  ALLOCATION_POLICY_CODES,
};
