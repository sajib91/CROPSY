const assert = require('node:assert/strict');
const test = require('node:test');

const {
  bearer,
  createApp,
  createTenantFixture,
  loginUser,
  register,
  verifyOtp,
} = require('./support/auth-fixtures');

const BASE = '/api/v1/users';

async function login(app, email) {
  const result = await loginUser(app, email);
  assert.equal(result.response.statusCode, 200, result.response.body);
  return result.tokens.accessToken;
}

test('self-service profile API updates identity fields, resets changed contact verification, and audits writes', async (t) => {
  const { app, store } = await createApp(t);
  const email = 'profile-self@example.com';
  const registration = await register(app, {
    email,
    roles: ['FARMER'],
    profile: { firstName: 'Self', lastName: 'Service' },
  });
  assert.equal(registration.response.statusCode, 201, registration.response.body);
  assert.match(registration.code, /^\d{6}$/);

  const verified = await verifyOtp(app, {
    channel: 'email',
    purpose: 'EMAIL_VERIFICATION',
    destination: email,
    code: registration.code,
  });
  assert.equal(verified.response.statusCode, 200, verified.response.body);
  const token = await login(app, email);

  const initial = await app.inject({ method: 'GET', url: `${BASE}/me`, headers: bearer(token) });
  assert.equal(initial.statusCode, 200, initial.body);
  assert.equal(initial.json().data.firstName, 'Self');
  assert.equal(initial.json().data.isEmailVerified, true);
  assert.equal(initial.json().data.verificationStatus, 'PENDING');
  assert.ok(initial.json().data.roleCodes.includes('FARMER'));

  const patched = await app.inject({
    method: 'PATCH',
    url: `${BASE}/me/profile`,
    headers: bearer(token),
    payload: {
      firstName: 'Updated',
      nameBn: 'আপডেটকৃত',
      avatarUrl: 'https://cdn.example.com/avatar.png',
      dateOfBirth: '1994-05-20',
      gender: 'UNDISCLOSED',
      preferredLanguage: 'BN',
      defaultCurrency: 'BDT',
    },
  });
  assert.equal(patched.statusCode, 200, patched.body);
  assert.equal(patched.json().data.firstName, 'Updated');
  assert.equal(patched.json().data.nameBn, 'আপডেটকৃত');
  assert.equal(patched.json().data.avatarUrl, 'https://cdn.example.com/avatar.png');
  assert.equal(patched.json().data.preferredLanguage, 'BN');
  assert.equal(patched.json().data.gender, 'UNDISCLOSED');

  const changedContact = await app.inject({
    method: 'PATCH',
    url: `${BASE}/me/contact`,
    headers: bearer(token),
    payload: { email: 'profile-self-updated@example.com', phone: '01712345678' },
  });
  assert.equal(changedContact.statusCode, 200, changedContact.body);
  assert.equal(changedContact.json().data.email, 'profile-self-updated@example.com');
  assert.equal(changedContact.json().data.phone, '01712345678');
  assert.equal(changedContact.json().data.isEmailVerified, false);
  assert.equal(changedContact.json().data.isPhoneVerified, false);
  assert.equal(changedContact.json().data.verificationStatus, 'UNVERIFIED');

  const emptyPatch = await app.inject({
    method: 'PATCH',
    url: `${BASE}/me/profile`,
    headers: bearer(token),
    payload: {},
  });
  assert.equal(emptyPatch.statusCode, 400);

  const invalidContact = await app.inject({
    method: 'PATCH',
    url: `${BASE}/me/contact`,
    headers: bearer(token),
    payload: { email: 'not-an-email' },
  });
  assert.equal(invalidContact.statusCode, 400);

  assert.ok(
    (await store.listAudit({ action: 'users.profile.updated' })).some(
      (entry) => entry.actor_user_id === registration.user.id,
    ),
  );
  assert.ok(
    (await store.listAudit({ action: 'users.contact.updated' })).some(
      (entry) => entry.after?.email === 'profile-self-updated@example.com',
    ),
  );
});

test('self-service addresses and notification preferences are validated and audited', async (t) => {
  const { app, store } = await createApp(t);
  await register(app, { email: 'profile-address@example.com', roles: ['BUYER'] });
  const token = await login(app, 'profile-address@example.com');

  const created = await app.inject({
    method: 'POST',
    url: `${BASE}/me/addresses`,
    headers: bearer(token),
    payload: {
      label: 'Home',
      addressLine1: '123 Farm Road',
      city: 'Dhaka',
      divisionId: '11111111-1111-4111-8111-111111111111',
      districtId: '22222222-2222-4222-8222-222222222222',
      postalCode: '1000',
      isPrimary: true,
    },
  });
  assert.equal(created.statusCode, 201, created.body);
  const addressId = created.json().data.id;
  assert.equal(created.json().data.isPrimary, true);
  assert.equal(created.json().data.city, 'Dhaka');

  const duplicate = await app.inject({
    method: 'POST',
    url: `${BASE}/me/addresses`,
    headers: bearer(token),
    payload: { label: 'Home', addressLine1: 'Duplicate' },
  });
  assert.equal(duplicate.statusCode, 409);

  const listed = await app.inject({
    method: 'GET',
    url: `${BASE}/me/addresses`,
    headers: bearer(token),
  });
  assert.equal(listed.statusCode, 200);
  assert.equal(listed.json().data.addresses.length, 1);

  const updated = await app.inject({
    method: 'PATCH',
    url: `${BASE}/me/addresses/${addressId}`,
    headers: bearer(token),
    payload: { city: 'Chattogram', postalCode: '4000', isPrimary: true },
  });
  assert.equal(updated.statusCode, 200, updated.body);
  assert.equal(updated.json().data.city, 'Chattogram');
  assert.equal(updated.json().data.postalCode, '4000');
  assert.equal(updated.json().data.isPrimary, true);

  const preferences = await app.inject({
    method: 'PUT',
    url: `${BASE}/me/preferences`,
    headers: bearer(token),
    payload: [
      { channel: 'EMAIL', eventType: 'ORDER_CREATED', enabled: true },
      { channel: 'IN_APP', eventType: 'ORDER_CREATED', enabled: false },
    ],
  });
  assert.equal(preferences.statusCode, 200, preferences.body);
  assert.equal(preferences.json().data.preferences.length, 2);
  assert.equal(preferences.json().data.preferences[1].enabled, false);

  const duplicatePreferences = await app.inject({
    method: 'PUT',
    url: `${BASE}/me/preferences`,
    headers: bearer(token),
    payload: [
      { channel: 'EMAIL', eventType: 'ORDER_CREATED' },
      { channel: 'email', eventType: 'ORDER_CREATED' },
    ],
  });
  assert.equal(duplicatePreferences.statusCode, 400);

  const listedPreferences = await app.inject({
    method: 'GET',
    url: `${BASE}/me/preferences`,
    headers: bearer(token),
  });
  assert.equal(listedPreferences.statusCode, 200);
  assert.equal(listedPreferences.json().data.preferences.length, 2);

  assert.ok((await store.listAudit({ action: 'users.address.created' })).length >= 1);
  assert.ok((await store.listAudit({ action: 'users.address.updated' })).length >= 1);
  assert.ok((await store.listAudit({ action: 'users.preferences.updated' })).length >= 1);
});

test('role-specific profile extensions reject farmer data and unassigned roles', async (t) => {
  const { app, store } = await createApp(t);
  await register(app, { email: 'role-profile@example.com', roles: ['BUYER'] });
  const token = await login(app, 'role-profile@example.com');

  const created = await app.inject({
    method: 'PUT',
    url: `${BASE}/me/roles/BUYER/profile`,
    headers: bearer(token),
    payload: { data: { preferredContactMethod: 'EMAIL', procurementNotes: 'Morning delivery' } },
  });
  assert.equal(created.statusCode, 200, created.body);
  assert.equal(created.json().data.roleCode, 'BUYER');
  assert.equal(created.json().data.scopeKey, 'PLATFORM');
  assert.equal(created.json().data.storage, 'role_profile_extension');
  assert.equal(created.json().data.data.preferredContactMethod, 'EMAIL');

  const listed = await app.inject({
    method: 'GET',
    url: `${BASE}/me/role-profiles`,
    headers: bearer(token),
  });
  assert.equal(listed.statusCode, 200);
  assert.ok(listed.json().data.roleCodes.includes('BUYER'));
  assert.equal(listed.json().data.extensions.length, 1);
  assert.equal(listed.json().data.farmerProfile, null);

  const farmerRejected = await app.inject({
    method: 'PUT',
    url: `${BASE}/me/roles/FARMER/profile`,
    headers: bearer(token),
    payload: { data: { farmSizeHectares: 5 } },
  });
  assert.equal(farmerRejected.statusCode, 400);
  assert.equal(farmerRejected.json().meta.details.code, 'use_farmer_profile_endpoint');

  const unassigned = await app.inject({
    method: 'PUT',
    url: `${BASE}/me/roles/WHOLESALER/profile`,
    headers: bearer(token),
    payload: { data: { licenseNumber: 'X' } },
  });
  assert.equal(unassigned.statusCode, 403);
  assert.equal(unassigned.json().meta.details.code, 'role_not_assigned');

  assert.ok((await store.listAudit({ action: 'users.role_profile.updated' })).length >= 1);
});

test('farmer agricultural information lives in FarmerProfile and self-service cannot set verification', async (t) => {
  const { app, store } = await createApp(t);
  await register(app, { email: 'farmer-profile@example.com', roles: ['FARMER'] });
  const token = await login(app, 'farmer-profile@example.com');

  const initial = await app.inject({
    method: 'GET',
    url: `${BASE}/me/farmer-profile`,
    headers: bearer(token),
  });
  assert.equal(initial.statusCode, 200);
  assert.equal(initial.json().data, null);

  const created = await app.inject({
    method: 'PUT',
    url: `${BASE}/me/farmer-profile`,
    headers: bearer(token),
    payload: {
      farmerCode: 'FRM-SELF-01',
      farmSizeHectares: 2.5,
      experienceYears: 4,
      verificationStatus: 'UNVERIFIED',
    },
  });
  assert.equal(created.statusCode, 200, created.body);
  assert.equal(created.json().data.farmerCode, 'FRM-SELF-01');
  assert.equal(created.json().data.verificationStatus, 'UNVERIFIED');
  assert.equal(created.json().data.storage, 'farmer_profile');

  const fetched = await app.inject({
    method: 'GET',
    url: `${BASE}/me/farmer-profile`,
    headers: bearer(token),
  });
  assert.equal(fetched.statusCode, 200);
  assert.equal(fetched.json().data.farmerCode, 'FRM-SELF-01');

  const roleProfiles = await app.inject({
    method: 'GET',
    url: `${BASE}/me/role-profiles`,
    headers: bearer(token),
  });
  assert.equal(roleProfiles.statusCode, 200);
  assert.ok(roleProfiles.json().data.farmerProfile);
  assert.equal(roleProfiles.json().data.farmerProfile.storage, 'farmer_profile');

  const selfVerification = await app.inject({
    method: 'PUT',
    url: `${BASE}/me/farmer-profile`,
    headers: bearer(token),
    payload: { verificationStatus: 'VERIFIED' },
  });
  assert.equal(selfVerification.statusCode, 403);
  assert.equal(selfVerification.json().meta.details.code, 'verification_status_forbidden');

  const partial = await app.inject({
    method: 'PUT',
    url: `${BASE}/me/farmer-profile`,
    headers: bearer(token),
    payload: { farmSizeHectares: 3.75, experienceYears: null },
  });
  assert.equal(partial.statusCode, 200, partial.body);
  assert.equal(partial.json().data.farmerCode, 'FRM-SELF-01');
  assert.equal(partial.json().data.verificationStatus, 'UNVERIFIED');
  assert.equal(partial.json().data.experienceYears, null);
  assert.equal(Number(partial.json().data.farmSizeHectares), 3.75);

  const invalidCode = await app.inject({
    method: 'PUT',
    url: `${BASE}/me/farmer-profile`,
    headers: bearer(token),
    payload: { farmerCode: 'frm-invalid' },
  });
  assert.equal(invalidCode.statusCode, 400);

  assert.ok((await store.listAudit({ action: 'users.farmer_profile.updated' })).length >= 2);
});

test('admin profile routes are reusable across an organization but deny cross-tenant targets', async (t) => {
  const fixture = await createTenantFixture(t);
  const { app, store, adminId, adminToken, sameOrgUserId, otherOrgUserId } = fixture;

  const peerLogin = await loginUser(app, 'peer@example.com');
  assert.equal(peerLogin.response.statusCode, 200, peerLogin.response.body);
  const peerToken = peerLogin.tokens.accessToken;
  const sameOrgToken = await login(app, 'same-org@example.com');

  const sameOrgProfile = await app.inject({
    method: 'GET',
    url: `${BASE}/${sameOrgUserId}`,
    headers: bearer(adminToken),
  });
  assert.equal(sameOrgProfile.statusCode, 200, sameOrgProfile.body);
  assert.equal(sameOrgProfile.json().data.userId, sameOrgUserId);

  const missingPermission = await app.inject({
    method: 'GET',
    url: `${BASE}/${sameOrgUserId}`,
    headers: bearer(peerToken),
  });
  assert.equal(missingPermission.statusCode, 403);

  const crossOrg = await app.inject({
    method: 'GET',
    url: `${BASE}/${otherOrgUserId}`,
    headers: bearer(adminToken),
  });
  assert.equal(crossOrg.statusCode, 403);
  assert.equal(crossOrg.json().meta.details.code, 'resource_access_denied');

  const unauthenticated = await app.inject({
    method: 'GET',
    url: `${BASE}/${sameOrgUserId}`,
  });
  assert.equal(unauthenticated.statusCode, 401);

  const crossOrgPatch = await app.inject({
    method: 'PATCH',
    url: `${BASE}/${otherOrgUserId}/profile`,
    headers: bearer(adminToken),
    payload: { firstName: 'Should not apply' },
  });
  assert.equal(crossOrgPatch.statusCode, 403);

  const adminPatch = await app.inject({
    method: 'PATCH',
    url: `${BASE}/${sameOrgUserId}/profile`,
    headers: bearer(adminToken),
    payload: { firstName: 'Admin Managed', preferredLanguage: 'EN' },
  });
  assert.equal(adminPatch.statusCode, 200, adminPatch.body);
  assert.equal(adminPatch.json().data.firstName, 'Admin Managed');

  const farmerSelf = await app.inject({
    method: 'PUT',
    url: `${BASE}/me/farmer-profile`,
    headers: bearer(sameOrgToken),
    payload: { farmerCode: 'FRM-TENANT-01', farmSizeHectares: 1 },
  });
  assert.equal(farmerSelf.statusCode, 200, farmerSelf.body);

  const verifiedByAdmin = await app.inject({
    method: 'PATCH',
    url: `${BASE}/${sameOrgUserId}/farmer-profile`,
    headers: bearer(adminToken),
    payload: { verificationStatus: 'VERIFIED' },
  });
  assert.equal(verifiedByAdmin.statusCode, 200, verifiedByAdmin.body);
  assert.equal(verifiedByAdmin.json().data.verificationStatus, 'VERIFIED');

  const partialByFarmer = await app.inject({
    method: 'PUT',
    url: `${BASE}/me/farmer-profile`,
    headers: bearer(sameOrgToken),
    payload: { farmSizeHectares: 1.25 },
  });
  assert.equal(partialByFarmer.statusCode, 200, partialByFarmer.body);
  assert.equal(partialByFarmer.json().data.farmerCode, 'FRM-TENANT-01');
  assert.equal(partialByFarmer.json().data.verificationStatus, 'VERIFIED');

  const crossOrgFarmer = await app.inject({
    method: 'PATCH',
    url: `${BASE}/${otherOrgUserId}/farmer-profile`,
    headers: bearer(adminToken),
    payload: { verificationStatus: 'VERIFIED' },
  });
  assert.equal(crossOrgFarmer.statusCode, 403);

  const profileAudit = await store.listAudit({ action: 'users.profile.updated' });
  assert.ok(profileAudit.some((entry) => entry.actor_user_id === adminId));
  const farmerAudit = await store.listAudit({ action: 'users.farmer_profile.updated' });
  assert.ok(
    farmerAudit.some(
      (entry) => entry.actor_user_id === adminId && entry.after?.verificationStatus === 'VERIFIED',
    ),
  );
});
