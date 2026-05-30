const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.warn('Supabase URL or Key is missing. Storage uploads will fail.');
}

const supabase = createClient(supabaseUrl || '', supabaseKey || '');

module.exports = supabase;
