const supabase = require('../config/supabaseClient');

/**
 * Audit log middleware factory.
 * @param {string} action - e.g. 'UPLOAD', 'GENERATE_DRAFT', 'DOWNLOAD', etc.
 * @param {string} resourceType - e.g. 'question_bank', 'draft_paper', 'final_paper'
 */
const auditLog = (action, resourceType = null) => {
  return async (req, res, next) => {
    // Store original json method to intercept response
    const originalJson = res.json.bind(res);
    
    res.json = async (body) => {
      // Only log on successful responses
      if (res.statusCode >= 200 && res.statusCode < 400) {
        try {
          await supabase.from('audit_logs').insert({
            tenant_id: req.user?.tenantId || null,
            user_id: req.user?.userId || null,
            user_email: req.user?.email || 'anonymous',
            user_role: req.user?.role || null,
            action: action,
            resource_type: resourceType,
            resource_id: req.params?.id || req.body?.courseTitle || null,
            metadata: {
              method: req.method,
              path: req.originalUrl,
              statusCode: res.statusCode,
            },
            ip_address: req.ip || req.headers['x-forwarded-for'] || req.connection?.remoteAddress,
            user_agent: req.headers['user-agent'],
          });
        } catch (err) {
          console.error('Audit log write failed:', err.message);
          // Don't block the response on audit log failure
        }
      }
      return originalJson(body);
    };

    next();
  };
};

module.exports = { auditLog };
