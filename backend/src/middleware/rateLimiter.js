const rateLimit = require('express-rate-limit');
const supabase = require('../config/supabaseClient');

const downloadLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 5, // Limit each IP/user to 5 requests per windowMs
  handler: async (req, res, next, options) => {
    try {
      if (req.user && req.user.userId) {
        // Update user status to 'locked' in Supabase
        await supabase
          .from('users')
          .update({ status: 'locked' })
          .eq('id', req.user.userId);
        
        console.error(`User ${req.user.userId} locked out due to rate limit violation (downloadLimiter).`);
      }
      res.status(403).json({ error: 'Account locked due to suspicious activity. Please contact your administrator.' });
    } catch (err) {
      console.error('Error in rate limiter handler:', err);
      res.status(429).json({ error: options.message || 'Too many requests' });
    }
  },
  keyGenerator: (req) => {
    return req.user?.userId || req.ip;
  }
});

module.exports = {
  downloadLimiter
};
