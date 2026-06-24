const test = require('node:test');
const assert = require('node:assert/strict');
const { isAllowedRole, requireRole } = require('../src/middleware/auth');

test('admin is allowed through owner-level checks', () => {
  assert.equal(isAllowedRole('admin', ['owner']), true);
});

test('non-admin roles are not allowed through owner-level checks', () => {
  assert.equal(isAllowedRole('manager', ['owner']), false);
});

test('requireRole returns forbidden for disallowed authenticated roles', () => {
  const req = { session: { user: { role_name: 'inventory_staff' } } };
  const res = {
    statusCode: null,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.body = body;
      return this;
    }
  };
  let nextCalled = false;

  requireRole('owner')(req, res, () => {
    nextCalled = true;
  });

  assert.equal(nextCalled, false);
  assert.equal(res.statusCode, 403);
  assert.deepEqual(res.body, { error: 'You do not have permission for this action' });
});
