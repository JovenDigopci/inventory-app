function requireAuth(req, res, next) {
  if (!req.session.user) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  next();
}

function isAllowedRole(userRole, roles) {
  if (!userRole) return false;
  if (roles.includes(userRole)) return true;
  return userRole === 'admin' && roles.includes('owner');
}

function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.session.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    if (!isAllowedRole(req.session.user.role_name, roles)) {
      return res.status(403).json({ error: 'You do not have permission for this action' });
    }
    next();
  };
}

module.exports = { requireAuth, requireRole, isAllowedRole };
