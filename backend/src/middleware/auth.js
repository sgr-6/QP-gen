const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET || JWT_SECRET.includes('fallback') || JWT_SECRET.length < 32) {
  throw new Error('FATAL: JWT_SECRET must be set to a strong secret (min 32 chars). Do not use fallback values.');
}

/**
 * Verify JWT from HttpOnly cookie OR Authorization Bearer header.
 * Attaches decoded user to req.user.
 */
const authenticate = async (req, res, next) => {
  // 1. Try cookie first, then Authorization header
  let token = req.cookies?.jwt;
  if (!token && req.headers.authorization && req.headers.authorization.startsWith('Bearer ')) {
    token = req.headers.authorization.split(' ')[1];
  }
  
  if (!token) {
    return res.status(401).json({ error: 'Authentication required. No token provided.' });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    // Attach { email, role, tenantId, userId } to request
    req.user = decoded;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid or expired token.' });
  }
};

/**
 * Role-based access control middleware factory.
 * @param {...string} allowedRoles
 */
const authorize = (...allowedRoles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required.' });
    }
    if (!allowedRoles.includes(req.user.role) && req.user.role !== 'super_admin') {
      return res.status(403).json({ error: 'Insufficient permissions.' });
    }
    next();
  };
};

module.exports = { authenticate, authorize, JWT_SECRET };
