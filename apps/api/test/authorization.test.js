const assert = require('node:assert/strict');
const test = require('node:test');

const {
  BASE,
  bearer,
  createTenantFixture,
  loginUser,
  register,
} = require('./support/auth-fixtures');

test('user lookup and role assignment deny cross-organization targets', async (t) => {
  const fixture = await createTenantFixture(t);
  const { app, adminToken, sameOrgUserId, otherOrgUserId } = fixture;

  const sameOrg = await app.inject({
    method: 'GET',
    url: `${BASE}/users/${sameOrgUserId}`,
    headers: bearer(adminToken),
  });
  assert.equal(sameOrg.statusCode, 200);
  assert.equal(sameOrg.json().data.id, sameOrgUserId);

  const crossOrg = await app.inject({
    method: 'GET',
    url: `${BASE}/users/${otherOrgUserId}`,
    headers: bearer(adminToken),
  });
  assert.equal(crossOrg.statusCode, 403);
  assert.equal(crossOrg.json().error, 'forbidden');
  assert.equal(crossOrg.json().meta.details.code, 'resource_access_denied');

  const deniedAssignment = await app.inject({
    method: 'POST',
    url: `${BASE}/users/${otherOrgUserId}/roles`,
    headers: bearer(adminToken),
    payload: { roleCode: 'FARMER' },
  });
  assert.equal(deniedAssignment.statusCode, 403);

  const allowedAssignment = await app.inject({
    method: 'POST',
    url: `${BASE}/users/${sameOrgUserId}/roles`,
    headers: bearer(adminToken),
    payload: { roleCode: 'FARMER' },
  });
  assert.equal(allowedAssignment.statusCode, 200);
  const roles = await fixture.store.listUserRoles(sameOrgUserId);
  assert.ok(roles.some((assignment) => assignment.role_code === 'FARMER'));
});

test('tenant admins cannot grant privileged platform roles', async (t) => {
  const fixture = await createTenantFixture(t);
  const { app, store, adminToken, adminId, orgA } = fixture;

  const denied = await app.inject({
    method: 'POST',
    url: `${BASE}/users/${adminId}/roles`,
    headers: { ...bearer(adminToken), 'x-organization-id': orgA.id },
    payload: { roleCode: 'CROPSY_SUPER_ADMIN' },
  });
  assert.equal(denied.statusCode, 403);
  assert.equal(denied.json().meta.details.code, 'privileged_role_assignment_denied');

  const roles = await store.listUserRoles(adminId);
  assert.ok(!roles.some((role) => role.role_code === 'CROPSY_SUPER_ADMIN'));

  const orgRole = await app.inject({
    method: 'POST',
    url: `${BASE}/users/${adminId}/roles`,
    headers: { ...bearer(adminToken), 'x-organization-id': orgA.id },
    payload: { roleCode: 'ORGANIZATION_MEMBER', organizationId: orgA.id },
  });
  assert.equal(orgRole.statusCode, 200);

  const root = await register(app, { email: 'privileged-root@example.com', roles: ['FARMER'] });
  await store.addUserRole({
    userId: root.user.id,
    roleCode: 'CROPSY_SUPER_ADMIN',
    grantedBy: root.user.id,
  });
  const rootLogin = await loginUser(app, 'privileged-root@example.com');
  const allowed = await app.inject({
    method: 'POST',
    url: `${BASE}/users/${adminId}/roles`,
    headers: bearer(rootLogin.tokens.accessToken),
    payload: { roleCode: 'CROPSY_SUPER_ADMIN' },
  });
  assert.equal(allowed.statusCode, 200);
});

test('client-supplied organization identifiers cannot switch tenant context', async (t) => {
  const { app, adminToken, orgA, orgB } = await createTenantFixture(t);

  const crossOrgHeader = await app.inject({
    method: 'GET',
    url: `${BASE}/organizations/${orgB.id}/members`,
    headers: { ...bearer(adminToken), 'x-organization-id': orgB.id },
  });
  assert.equal(crossOrgHeader.statusCode, 403);
  assert.equal(crossOrgHeader.json().meta.details.code, 'cross_organization_access_denied');

  const crossOrgPath = await app.inject({
    method: 'GET',
    url: `${BASE}/organizations/${orgB.id}/members`,
    headers: bearer(adminToken),
  });
  assert.equal(crossOrgPath.statusCode, 403);

  const ownOrg = await app.inject({
    method: 'GET',
    url: `${BASE}/organizations/${orgA.id}/members`,
    headers: { ...bearer(adminToken), 'x-organization-id': orgA.id },
  });
  assert.equal(ownOrg.statusCode, 200);
  assert.equal(ownOrg.json().data.organizationId, orgA.id);
});

test('ordinary roles are denied privileged permissions and denials are audited', async (t) => {
  const fixture = await createTenantFixture(t);
  const { app, adminToken, otherOrgUserId } = fixture;

  const farmer = await register(app, { email: 'farmer@example.com', roles: ['FARMER'] });
  const farmerLogin = await loginUser(app, 'farmer@example.com');
  assert.equal(farmerLogin.response.statusCode, 200);

  const matrix = await app.inject({
    method: 'GET',
    url: `${BASE}/matrix`,
    headers: bearer(farmerLogin.tokens.accessToken),
  });
  assert.equal(matrix.statusCode, 403);
  assert.equal(matrix.json().error, 'forbidden');

  const check = await app.inject({
    method: 'GET',
    url: `${BASE}/access/check?permission=roles.manage`,
    headers: bearer(farmerLogin.tokens.accessToken),
  });
  assert.equal(check.statusCode, 200);
  assert.equal(check.json().data.allowed, false);
  assert.equal(check.json().data.reason, 'permission_denied');

  await app.inject({
    method: 'GET',
    url: `${BASE}/users/${otherOrgUserId}`,
    headers: bearer(adminToken),
  });

  const audit = await app.inject({
    method: 'GET',
    url: `${BASE}/audit`,
    headers: bearer(adminToken),
  });
  assert.equal(audit.statusCode, 200);
  const events = audit.json().data.events;
  assert.ok(
    events.some(
      (event) =>
        event.action === 'iam.authz.denied' &&
        event.after.reason === 'resource_access_denied' &&
        event.after.targetUserId === otherOrgUserId,
    ),
  );
  assert.equal(farmer.response.statusCode, 201);
});

test('platform super admin can inspect every tenant and every user', async (t) => {
  const fixture = await createTenantFixture(t);
  const { app, store, otherOrgUserId, orgB } = fixture;

  const root = await register(app, { email: 'root@example.com', roles: ['FARMER'] });
  await store.addUserRole({
    userId: root.user.id,
    roleCode: 'CROPSY_SUPER_ADMIN',
    grantedBy: root.user.id,
  });
  const rootLogin = await loginUser(app, 'root@example.com');
  assert.equal(rootLogin.response.statusCode, 200);

  const crossOrgUser = await app.inject({
    method: 'GET',
    url: `${BASE}/users/${otherOrgUserId}`,
    headers: bearer(rootLogin.tokens.accessToken),
  });
  assert.equal(crossOrgUser.statusCode, 200);

  const crossOrgMembers = await app.inject({
    method: 'GET',
    url: `${BASE}/organizations/${orgB.id}/members`,
    headers: bearer(rootLogin.tokens.accessToken),
  });
  assert.equal(crossOrgMembers.statusCode, 200);

  const matrix = await app.inject({
    method: 'GET',
    url: `${BASE}/matrix`,
    headers: bearer(rootLogin.tokens.accessToken),
  });
  assert.equal(matrix.statusCode, 200);
  assert.ok(matrix.json().data.matrix.length >= 11);
});

test('role permissions are configurable by super admins and take effect on the next request', async (t) => {
  const fixture = await createTenantFixture(t);
  const { app, store, adminToken } = fixture;

  const root = await register(app, { email: 'config-root@example.com', roles: ['FARMER'] });
  await store.addUserRole({
    userId: root.user.id,
    roleCode: 'CROPSY_SUPER_ADMIN',
    grantedBy: root.user.id,
  });
  const rootLogin = await loginUser(app, 'config-root@example.com');
  assert.equal(rootLogin.response.statusCode, 200);

  const farmer = await register(app, { email: 'config-farmer@example.com', roles: ['FARMER'] });
  const farmerLogin = await loginUser(app, 'config-farmer@example.com');
  assert.equal(farmerLogin.response.statusCode, 200);

  const before = await app.inject({
    method: 'GET',
    url: `${BASE}/access/check?permission=farms.read`,
    headers: bearer(farmerLogin.tokens.accessToken),
  });
  assert.equal(before.json().data.allowed, true);

  const tenantAdminAttempt = await app.inject({
    method: 'PUT',
    url: `${BASE}/roles/FARMER/permissions`,
    headers: bearer(adminToken),
    payload: { permissions: ['profile.read'] },
  });
  assert.equal(tenantAdminAttempt.statusCode, 403);
  assert.equal(tenantAdminAttempt.json().meta.details.code, 'global_role_mutation_denied');

  const updated = await app.inject({
    method: 'PUT',
    url: `${BASE}/roles/FARMER/permissions`,
    headers: bearer(rootLogin.tokens.accessToken),
    payload: { permissions: ['profile.read'] },
  });
  assert.equal(updated.statusCode, 200);
  assert.deepEqual(updated.json().data.permissions, ['profile.read']);

  const after = await app.inject({
    method: 'GET',
    url: `${BASE}/access/check?permission=farms.read`,
    headers: bearer(farmerLogin.tokens.accessToken),
  });
  assert.equal(after.json().data.allowed, false);

  const me = await app.inject({
    method: 'GET',
    url: `${BASE}/me`,
    headers: bearer(farmerLogin.tokens.accessToken),
  });
  assert.ok(!me.json().data.permissions.includes('farms.read'));
  assert.equal(farmer.response.statusCode, 201);
});
