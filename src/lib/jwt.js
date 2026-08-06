const jwt = require('jsonwebtoken');

const STAFF_SECRET = process.env.JWT_STAFF_SECRET || 'dev-staff-secret-change-me';
const CUSTOMER_SECRET = process.env.JWT_CUSTOMER_SECRET || 'dev-customer-secret-change-me';

function signStaffToken(user) {
  return jwt.sign(
    { sub: user.id, businessId: user.businessId, role: user.role, type: 'staff' },
    STAFF_SECRET,
    { expiresIn: '12h' }
  );
}

function verifyStaffToken(token) {
  return jwt.verify(token, STAFF_SECRET);
}

function signCustomerToken(customer) {
  return jwt.sign(
    { sub: customer.id, businessId: customer.businessId, type: 'customer' },
    CUSTOMER_SECRET,
    { expiresIn: '30d' }
  );
}

function verifyCustomerToken(token) {
  return jwt.verify(token, CUSTOMER_SECRET);
}

module.exports = { signStaffToken, verifyStaffToken, signCustomerToken, verifyCustomerToken };
