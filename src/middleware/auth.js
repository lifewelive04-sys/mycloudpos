const { verifyStaffToken, verifyCustomerToken } = require('../lib/jwt');

function getBearerToken(req) {
  const header = req.headers.authorization || '';
  const [scheme, token] = header.split(' ');
  if (scheme !== 'Bearer' || !token) return null;
  return token;
}

// Requires a valid staff (owner/manager/cashier) JWT.
function requireStaff(req, res, next) {
  const token = getBearerToken(req);
  if (!token) return res.status(401).json({ error: 'Missing bearer token' });
  try {
    const payload = verifyStaffToken(token);
    if (payload.type !== 'staff') throw new Error('wrong token type');
    req.staff = payload; // { sub, businessId, role }
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid or expired staff token' });
  }
}

// Restricts a route to specific staff roles, e.g. requireRole('OWNER', 'MANAGER')
function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.staff || !roles.includes(req.staff.role)) {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }
    next();
  };
}

// Requires a valid customer (online shop) JWT. Attaches req.customer.
function requireCustomer(req, res, next) {
  const token = getBearerToken(req);
  if (!token) return res.status(401).json({ error: 'Missing bearer token' });
  try {
    const payload = verifyCustomerToken(token);
    if (payload.type !== 'customer') throw new Error('wrong token type');
    req.customer = payload; // { sub, businessId }
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid or expired customer token' });
  }
}

// Optional customer auth — attaches req.customer if a valid token is present,
// but does not reject the request if it's missing (used for public shop routes
// that behave slightly differently for signed-in customers).
function optionalCustomer(req, res, next) {
  const token = getBearerToken(req);
  if (!token) return next();
  try {
    req.customer = verifyCustomerToken(token);
  } catch (err) {
    // ignore invalid token on optional routes
  }
  next();
}

module.exports = { requireStaff, requireRole, requireCustomer, optionalCustomer };
