const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;

if (!supabaseUrl || !supabaseKey) {
  throw new Error(
    'FATAL: SUPABASE_URL and SUPABASE_KEY must be set. Server cannot start without Supabase access.'
  );
}

const supabase = createClient(supabaseUrl, supabaseKey);

module.exports = supabase;
