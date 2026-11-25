const assert = require('node:assert/strict');
const test = require('node:test');

const {
  bearer,
  createApp,
  createTenantFixture,
  loginUser,
  register,
} = require('./support/auth-fixtures');
const { TokenManagerToken } = require('../src/modules/iam/application/tokens');

const BASE = '/api/v1/organizations';

async function login(app, email) {
  const result = await loginUser(app, email);
  assert.equal(result.response.statusCode, 200, result.response.body);
  return result.tokens.accessToken;
}

test('organization registration creates an owner membership, admin grant, and audit trail', async (t) => {
  const { app, store } = await createApp(t);
  const registration = await register(app, { email: 'owner@example.com', roles: ['FARMER'] });
  assert.equal(registration.response.statusCode, 201);
  const token = await login(app, 'owner@example.com');

  const created = await app.inject({
    method: 'POST',
    url: BASE,
    headers: bearer(token),
    payload: {
      name: 'Green Fields Cooperative',
      slug: 'green-fields-cooperative',
      organizationType: 'FARMER_COOPERATIVE',
      description: 'Producer-owned cooperative.',
      contactEmail: 'hello@greenfields.example',
      contactPhone: '01711111111',
      defaultCurrency: 'BDT',
    },
  });
  assert.equal(created.statusCode, 201, created.body);
  const organization = created.json().data.organization;
  assert.equal(organization.name, 'Green Fields Cooperative');
  assert.equal(organization.organizationType, 'FARMER_COOPERATIVE');
  assert.equal(organization.verificationStatus, 'UNVERIFIED');
  assert.equal(organization.ownerUserId, registration.user.id);

  const memberships = await store.listOrganizationMemberships(registration.user.id);
  assert.equal(memberships.length, 1);
  assert.equal(memberships[0].organization_id, organization.id);
  assert.ok(memberships[0].roleCodes.includes('ORGANIZATION_ADMIN'));

  const listed = await app.inject({ method: 'GET', url: BASE, headers: bearer(token) });
  assert.equal(listed.statusCode, 200);
  assert.deepEqual(
    listed.json().data.organizations.map((item) => item.id),
    [organization.id],
  );

  const read = await app.inject({
    method: 'GET',
    url: `${BASE}/${organization.id}`,
    headers: bearer(token),
  });
  assert.equal(read.statusCode, 200);
  assert.equal(read.json().data.slug, 'green-fields-cooperative');

  const updated = await app.inject({
    method: 'PATCH',
    url: `${BASE}/${organization.id}`,
    headers: bearer(token),
    payload: { legalName: 'Green Fields Cooperative Ltd.', description: 'Updated description.' },
  });
  assert.equal(updated.statusCode, 200);
  assert.equal(updated.json().data.legalName, 'Green Fields Cooperative Ltd.');

  const duplicates = await app.inject({
    method: 'POST',
    url: BASE,
    headers: bearer(token),
    payload: { name: 'Duplicate', slug: 'green-fields-cooperative' },
  });
  assert.equal(duplicates.statusCode, 409);

  const types = await app.inject({ method: 'GET', url: `${BASE}/types`, headers: bearer(token) });
  assert.equal(types.statusCode, 200);
  assert.deepEqual(
    types.json().data.types.map((type) => type.code),
    [
      'AGRICULTURAL_COMPANY',
      'FARMER_COOPERATIVE',
      'WHOLESALE_BUSINESS',
      'RETAIL_BUSINESS',
      'AGRICULTURAL_SUPPLIER',
      'LOGISTICS_COMPANY',
      'WAREHOUSE',
      'OTHER',
    ],
  );

  const audit = await store.listAudit({ action: 'organizations.created' });
  assert.equal(audit.length, 1);
  assert.equal(audit[0].organization_id, organization.id);
  assert.ok(
    (await store.listAudit({ action: 'organizations.updated' })).some(
      (entry) => entry.actor_user_id === registration.user.id,
    ),
  );
});

test('tenant-scoped organization routes deny cross-organization access', async (t) => {
  const fixture = await createTenantFixture(t);
  const { app, adminToken, orgA, orgB } = fixture;

  const crossOrgRead = await app.inject({
    method: 'GET',
    url: `${BASE}/${orgB.id}`,
    headers: bearer(adminToken),
  });
  assert.equal(crossOrgRead.statusCode, 403);
  assert.equal(crossOrgRead.json().meta.details.code, 'cross_organization_access_denied');

  const crossOrgHeader = await app.inject({
    method: 'PATCH',
    url: `${BASE}/${orgA.id}`,
    headers: { ...bearer(adminToken), 'x-organization-id': orgB.id },
    payload: { description: 'Should not be applied.' },
  });
  assert.equal(crossOrgHeader.statusCode, 403);

  const ownOrg = await app.inject({
    method: 'GET',
    url: `${BASE}/${orgA.id}`,
    headers: bearer(adminToken),
  });
  assert.equal(ownOrg.statusCode, 200);
  assert.equal(ownOrg.json().data.id, orgA.id);

  const deniedSwitch = await app.inject({
    method: 'POST',
    url: `${BASE}/switch`,
    headers: bearer(adminToken),
    payload: { organizationId: orgB.id },
  });
  assert.equal(deniedSwitch.statusCode, 403);
  assert.equal(deniedSwitch.json().meta.details.code, 'cross_organization_access_denied');
  assert.ok(
    (await fixture.store.listAudit({ action: 'organizations.switch.denied' })).some(
      (entry) => entry.entity_id === orgB.id,
    ),
  );

  const switched = await app.inject({
    method: 'POST',
    url: `${BASE}/switch`,
    headers: bearer(adminToken),
    payload: { organizationId: orgA.id },
  });
  assert.equal(switched.statusCode, 200, switched.body);
  const switchedToken = switched.json().data.accessToken;
  const payload = app.cropsyContainer.resolve(TokenManagerToken).verifyAccessToken(switchedToken);
  assert.equal(payload.org, orgA.id);

  const withSwitchedToken = await app.inject({
    method: 'GET',
    url: `${BASE}/${orgA.id}`,
    headers: bearer(switchedToken),
  });
  assert.equal(withSwitchedToken.statusCode, 200);
  assert.ok(
    (await fixture.store.listAudit({ action: 'organizations.switched' })).some(
      (entry) => entry.entity_id === orgA.id,
    ),
  );
});

test('invitations issue a hashed token, accept into a member role, and can be cancelled', async (t) => {
  const fixture = await createTenantFixture(t);
  const { app, adminToken, orgA } = fixture;

  const invited = await register(app, {
    email: 'invitee@example.com',
    roles: ['BUYER'],
  });
  assert.equal(invited.response.statusCode, 201);
  const inviteeToken = await login(app, 'invitee@example.com');

  const invitationResponse = await app.inject({
    method: 'POST',
    url: `${BASE}/${orgA.id}/invitations`,
    headers: bearer(adminToken),
    payload: { email: 'invitee@example.com', roleCode: 'ORGANIZATION_MEMBER' },
  });
  assert.equal(invitationResponse.statusCode, 201, invitationResponse.body);
  const { invitation, token } = invitationResponse.json().data;
  assert.equal(invitation.status, 'PENDING');
  assert.equal(invitation.roleCode, 'ORGANIZATION_MEMBER');
  assert.notEqual(token, invitation.id);

  const stored = await fixture.store.findOrganizationInvitationByTokenHash(
    app.cropsyContainer.resolve(TokenManagerToken).hashToken(token),
  );
  assert.ok(stored);
  assert.notEqual(stored.token_hash, token);

  const listed = await app.inject({
    method: 'GET',
    url: `${BASE}/${orgA.id}/invitations`,
    headers: bearer(adminToken),
  });
  assert.equal(listed.statusCode, 200);
  assert.equal(listed.json().data.invitations.length, 1);

  const accepted = await app.inject({
    method: 'POST',
    url: `${BASE}/invitations/accept`,
    headers: bearer(inviteeToken),
    payload: { token, email: 'invitee@example.com' },
  });
  assert.equal(accepted.statusCode, 200, accepted.body);
  assert.equal(accepted.json().data.organizationId, orgA.id);
  assert.equal(accepted.json().data.roleCode, 'ORGANIZATION_MEMBER');

  const members = await app.inject({
    method: 'GET',
    url: `${BASE}/${orgA.id}/members`,
    headers: bearer(inviteeToken),
  });
  assert.equal(members.statusCode, 200);
  assert.ok(members.json().data.members.some((member) => member.userId === invited.user.id));

  const documentsDenied = await app.inject({
    method: 'GET',
    url: `${BASE}/${orgA.id}/documents`,
    headers: bearer(inviteeToken),
  });
  assert.equal(documentsDenied.statusCode, 403);

  const second = await app.inject({
    method: 'POST',
    url: `${BASE}/${orgA.id}/invitations`,
    headers: bearer(adminToken),
    payload: { email: 'cancelled@example.com', roleCode: 'ORGANIZATION_MEMBER' },
  });
  assert.equal(second.statusCode, 201);
  const cancelled = await app.inject({
    method: 'DELETE',
    url: `${BASE}/${orgA.id}/invitations/${second.json().data.invitation.id}`,
    headers: bearer(adminToken),
  });
  assert.equal(cancelled.statusCode, 200);
  assert.equal(cancelled.json().data.status, 'CANCELLED');

  const acceptCancelled = await app.inject({
    method: 'POST',
    url: `${BASE}/invitations/accept`,
    headers: bearer(inviteeToken),
    payload: { token: second.json().data.token },
  });
  assert.equal(acceptCancelled.statusCode, 409);

  const removed = await app.inject({
    method: 'DELETE',
    url: `${BASE}/${orgA.id}/members/${invited.user.id}`,
    headers: bearer(adminToken),
  });
  assert.equal(removed.statusCode, 200, removed.body);
  assert.equal(removed.json().data.status, 'LEFT');
  assert.ok(removed.json().data.removedRoles >= 1);

  const afterRemoval = await app.inject({
    method: 'GET',
    url: `${BASE}/${orgA.id}/members`,
    headers: bearer(inviteeToken),
  });
  assert.equal(afterRemoval.statusCode, 403);
});

test('expired invitations cannot be accepted', async (t) => {
  const fixture = await createTenantFixture(t);
  const { app, adminToken, orgA } = fixture;
  await register(app, { email: 'expired@example.com', roles: ['BUYER'] });
  const token = await login(app, 'expired@example.com');

  const created = await app.inject({
    method: 'POST',
    url: `${BASE}/${orgA.id}/invitations`,
    headers: bearer(adminToken),
    payload: { email: 'expired@example.com', roleCode: 'ORGANIZATION_MEMBER' },
  });
  assert.equal(created.statusCode, 201);
  const { invitation, token: invitationToken } = created.json().data;
  await fixture.store.updateOrganizationInvitation(invitation.id, {
    expiresAt: new Date(Date.now() - 1000),
  });

  const accepted = await app.inject({
    method: 'POST',
    url: `${BASE}/invitations/accept`,
    headers: bearer(token),
    payload: { token: invitationToken },
  });
  assert.equal(accepted.statusCode, 409);
  const expired = await fixture.store
    .listOrganizationInvitations(orgA.id)
    .then((items) => items.find((item) => item.id === invitation.id));
  assert.equal(expired.status, 'EXPIRED');
});

test('organization addresses and documents are tenant scoped and audited', async (t) => {
  const fixture = await createTenantFixture(t);
  const { app, adminToken, orgA } = fixture;
  const otherOrgToken = await login(app, 'other-org@example.com');

  const address = await app.inject({
    method: 'POST',
    url: `${BASE}/${orgA.id}/addresses`,
    headers: bearer(adminToken),
    payload: {
      label: 'HQ',
      addressLine1: '123 Farm Road',
      city: 'Dhaka',
      divisionId: '11111111-1111-4111-8111-111111111111',
      districtId: '22222222-2222-4222-8222-222222222222',
      postalCode: '1000',
      isPrimary: true,
    },
  });
  assert.equal(address.statusCode, 201, address.body);
  assert.equal(address.json().data.isPrimary, true);

  const duplicate = await app.inject({
    method: 'POST',
    url: `${BASE}/${orgA.id}/addresses`,
    headers: bearer(adminToken),
    payload: { label: 'HQ', addressLine1: 'Duplicate' },
  });
  assert.equal(duplicate.statusCode, 409);

  const addresses = await app.inject({
    method: 'GET',
    url: `${BASE}/${orgA.id}/addresses`,
    headers: bearer(adminToken),
  });
  assert.equal(addresses.statusCode, 200);
  assert.equal(addresses.json().data.addresses.length, 1);

  const updated = await app.inject({
    method: 'PATCH',
    url: `${BASE}/${orgA.id}/addresses/${address.json().data.id}`,
    headers: bearer(adminToken),
    payload: { city: 'Chattogram', isPrimary: true },
  });
  assert.equal(updated.statusCode, 200);
  assert.equal(updated.json().data.city, 'Chattogram');

  const document = await app.inject({
    method: 'POST',
    url: `${BASE}/${orgA.id}/documents`,
    headers: bearer(adminToken),
    payload: {
      documentType: 'TRADE_LICENSE',
      fileName: 'trade-license.pdf',
      fileUrl: 'https://storage.example.com/trade-license.pdf',
      mimeType: 'application/pdf',
      sizeBytes: 2048,
    },
  });
  assert.equal(document.statusCode, 201, document.body);
  assert.equal(document.json().data.verificationStatus, 'PENDING');

  const documentsDenied = await app.inject({
    method: 'POST',
    url: `${BASE}/${orgA.id}/documents`,
    headers: bearer(otherOrgToken),
    payload: {
      documentType: 'TAX_DOCUMENT',
      fileName: 'tax.pdf',
      fileUrl: 'https://storage.example.com/tax.pdf',
    },
  });
  assert.equal(documentsDenied.statusCode, 403);

  const verifiedDocument = await app.inject({
    method: 'PATCH',
    url: `${BASE}/${orgA.id}/documents/${document.json().data.id}`,
    headers: bearer(adminToken),
    payload: { verificationStatus: 'VERIFIED', notes: 'Reviewed by platform staff.' },
  });
  assert.equal(verifiedDocument.statusCode, 200);
  assert.equal(verifiedDocument.json().data.verificationStatus, 'VERIFIED');

  assert.ok(
    (await fixture.store.listAudit({ action: 'organizations.address.created' })).length >= 1,
  );
  assert.ok(
    (await fixture.store.listAudit({ action: 'organizations.document.created' })).length >= 1,
  );
});

test('only authorized verifiers can change verification and status', async (t) => {
  const fixture = await createTenantFixture(t);
  const { app, adminToken, orgA, store } = fixture;

  const deniedVerification = await app.inject({
    method: 'PATCH',
    url: `${BASE}/${orgA.id}/verification`,
    headers: bearer(adminToken),
    payload: { verificationStatus: 'VERIFIED' },
  });
  assert.equal(deniedVerification.statusCode, 403);

  const root = await register(app, { email: 'verifier@example.com', roles: ['FARMER'] });
  await store.addUserRole({
    userId: root.user.id,
    roleCode: 'CROPSY_SUPER_ADMIN',
    grantedBy: root.user.id,
  });
  const verifierToken = await login(app, 'verifier@example.com');

  const verified = await app.inject({
    method: 'PATCH',
    url: `${BASE}/${orgA.id}/verification`,
    headers: { ...bearer(verifierToken), 'x-organization-id': orgA.id },
    payload: { verificationStatus: 'VERIFIED', verificationNote: 'Documents checked.' },
  });
  assert.equal(verified.statusCode, 200, verified.body);
  assert.equal(verified.json().data.verificationStatus, 'VERIFIED');
  assert.ok(verified.json().data.verifiedAt);

  const rejectedWithoutNote = await app.inject({
    method: 'PATCH',
    url: `${BASE}/${orgA.id}/verification`,
    headers: { ...bearer(verifierToken), 'x-organization-id': orgA.id },
    payload: { verificationStatus: 'REJECTED' },
  });
  assert.equal(rejectedWithoutNote.statusCode, 400);

  const suspended = await app.inject({
    method: 'PATCH',
    url: `${BASE}/${orgA.id}/status`,
    headers: bearer(adminToken),
    payload: { status: 'SUSPENDED' },
  });
  assert.equal(suspended.statusCode, 200);
  assert.equal(suspended.json().data.status, 'SUSPENDED');

  const filtered = await app.inject({
    method: 'GET',
    url: `${BASE}?status=SUSPENDED`,
    headers: bearer(adminToken),
  });
  assert.equal(filtered.statusCode, 200);
  assert.deepEqual(
    filtered.json().data.organizations.map((item) => item.id),
    [orgA.id],
  );
  assert.ok((await store.listAudit({ action: 'organizations.verification.updated' })).length >= 1);
  assert.ok((await store.listAudit({ action: 'organizations.status.updated' })).length >= 1);
});
