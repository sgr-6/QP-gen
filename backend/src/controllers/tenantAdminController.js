const supabase = require('../config/supabaseClient');

/**
 * Lists all users for the current tenant.
 */
const listUsers = async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('users')
      .select('*')
      .eq('tenant_id', req.user.tenantId);

    if (error) {
      return res.status(500).json({ error: error.message });
    }

    res.json(data);
  } catch (error) {
    console.error('Error listing users:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

/**
 * Creates a new user in the current tenant.
 */
const createUser = async (req, res) => {
  try {
    const { email, name, role, department } = req.body;
    
    if (!email || !name || !role) {
      return res.status(400).json({ error: 'Email, name, and role are required' });
    }

    const allowedRoles = ['professor', 'hod', 'controller_of_exams', 'tenant_admin', 'print_admin'];
    if (!allowedRoles.includes(role)) {
      return res.status(400).json({ error: 'Invalid role provided' });
    }

    const { data, error } = await supabase
      .from('users')
      .insert({
        email,
        name,
        role,
        department,
        tenant_id: req.user.tenantId
      })
      .select()
      .single();

    if (error) {
      return res.status(500).json({ error: error.message });
    }

    res.status(201).json({ message: 'User created', user: data });
  } catch (error) {
    console.error('Error creating user:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

/**
 * Updates a user belonging to the current tenant.
 */
const updateUser = async (req, res) => {
  try {
    const { id } = req.params;
    const { role, status } = req.body;
    
    const updateData = {};
    if (role) updateData.role = role;
    if (status) updateData.status = status;

    const { data, error } = await supabase
      .from('users')
      .update(updateData)
      .eq('id', id)
      .eq('tenant_id', req.user.tenantId)
      .select()
      .single();

    if (error) {
      return res.status(500).json({ error: error.message });
    }

    res.json({ message: 'User updated', user: data });
  } catch (error) {
    console.error('Error updating user:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

/**
 * Updates settings for the current tenant.
 */
const updateSettings = async (req, res) => {
  try {
    const { name, org_code, domain, logo_url } = req.body;
    
    const updateData = {};
    if (name) updateData.name = name;
    if (org_code) updateData.org_code = org_code;
    if (domain) updateData.domain = domain;
    if (logo_url) updateData.logo_url = logo_url;

    const { data, error } = await supabase
      .from('tenants')
      .update(updateData)
      .eq('id', req.user.tenantId)
      .select()
      .single();

    if (error) {
      return res.status(500).json({ error: error.message });
    }

    res.json({ message: 'Tenant settings updated', tenant: data });
  } catch (error) {
    console.error('Error updating settings:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

module.exports = {
  listUsers,
  createUser,
  updateUser,
  updateSettings
};
