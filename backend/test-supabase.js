require('dotenv').config();
const supabase = require('./src/config/supabaseClient');
async function run() {
  const { data, error } = await supabase.storage.getBucket('qbanks');
  console.log('qbanks:', data, error);
}
run();
