const supabase = require('../config/supabaseClient');

/**
 * Creates a new tenant in the system.
 */
const createTenant = async (req, res) => {
  try {
    const { name, orgCode } = req.body;
    if (!name || !orgCode) {
      return res.status(400).json({ error: 'Name and orgCode are required' });
    }

    const { data, error } = await supabase
      .from('tenants')
      .insert({ name, org_code: orgCode })
      .select()
      .single();

    if (error) {
      return res.status(500).json({ error: error.message });
    }

    res.status(201).json({ message: 'Tenant created', tenant: data });
  } catch (error) {
    console.error('Error creating tenant:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

/**
 * Lists all tenants in the system.
 */
const listTenants = async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('tenants')
      .select('*');

    if (error) {
      return res.status(500).json({ error: error.message });
    }

    res.json(data);
  } catch (error) {
    console.error('Error listing tenants:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

/**
 * Creates a tenant admin for a specific tenant.
 */
const createTenantAdmin = async (req, res) => {
  try {
    const { id } = req.params;
    const { email, name } = req.body;

    if (!email || !name) {
      return res.status(400).json({ error: 'Email and name are required' });
    }

    const { data, error } = await supabase
      .from('users')
      .insert({
        email,
        name,
        role: 'tenant_admin',
        tenant_id: id
      })
      .select()
      .single();

    if (error) {
      return res.status(500).json({ error: error.message });
    }

    res.status(201).json({ message: 'Tenant admin created', user: data });
  } catch (error) {
    console.error('Error creating tenant admin:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

module.exports = {
  createTenant,
  listTenants,
  createTenantAdmin
};
