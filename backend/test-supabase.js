require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

async function test() {
  try {
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_KEY;
    const supabase = createClient(supabaseUrl, supabaseKey);
    
    const { data, error } = await supabase.storage.from('question-banks').list();
    if (error) throw error;
    
    console.log('Files in bucket:');
    for (const f of data) {
      console.log(f.name);
      if (f.name.toLowerCase().includes('os')) {
        const { data: fileData, error: fileError } = await supabase.storage.from('question-banks').download(f.name);
        if (fileData) {
            const buffer = await fileData.arrayBuffer();
            fs.writeFileSync('../' + f.name, Buffer.from(buffer));
            console.log('Downloaded: ' + f.name);
        }
      }
    }
  } catch (err) {
    console.error(err);
  }
}
test();
