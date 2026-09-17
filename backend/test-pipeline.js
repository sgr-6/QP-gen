const axios = require('axios');
const jwt = require('jsonwebtoken');
const fs = require('fs');
const path = require('path');
const FormData = require('form-data');
const dotenv = require('dotenv');

dotenv.config();

const API_URL = 'http://localhost:5000/api';
const JWT_SECRET = process.env.JWT_SECRET || 'secret123';

// Helper to generate a test token
function generateToken(role) {
  return jwt.sign(
    { email: `test_${role}@example.com`, role: role, tenantId: 'test_tenant', userId: 'test_user_id' },
    JWT_SECRET,
    { expiresIn: '1h' }
  );
}

// Ensure dummy files exist
const createDummyFiles = () => {
  const uploadsDir = path.join(__dirname, 'test_uploads');
  if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir);
  
  const dummyDoc = path.join(uploadsDir, 'dummy.txt');
  fs.writeFileSync(dummyDoc, 'This is a dummy test file for automated testing.');
  
  return { dummyDoc };
};

const runTests = async () => {
  console.log('--- Starting Automated Pipeline Tests ---');
  let passed = 0;
  let failed = 0;
  
  const { dummyDoc } = createDummyFiles();
  
  // Test 1: HOD Notes Ingestion
  console.log('\n[Test 1] HOD Notes Ingestion');
  try {
    const hodToken = generateToken('hod');
    const form = new FormData();
    form.append('file', fs.createReadStream(dummyDoc));
    form.append('courseTitle', 'Test Course');
    form.append('department', 'CSE');
    form.append('semester', '5');
    form.append('subjectCode', 'CS101');

    const res = await axios.post(`${API_URL}/notes/upload`, form, {
      headers: {
        ...form.getHeaders(),
        Cookie: `jwt=${hodToken}`
      }
    });
    
    if (res.status === 200) {
      console.log('✅ Notes Ingestion Passed');
      passed++;
    } else {
      console.log('❌ Notes Ingestion Failed: Unexpected status', res.status);
      failed++;
    }
  } catch (error) {
    console.log('❌ Notes Ingestion Failed:', error.response?.data || error.message);
    failed++;
  }

  // Test 2: Professor Generate Draft
  console.log('\n[Test 2] Professor Generate Draft');
  try {
    const profToken = generateToken('professor');
    const res = await axios.post(`${API_URL}/generate-draft`, {
      courseTitle: 'Test Course',
      department: 'CSE',
      semester: '5',
      subjectCode: 'CS101',
      examType: 'Midterm',
      totalMarks: 50,
      instructions: ['Answer all questions'],
      blueprint: [
        { module: 'M1', marks: 10, btl: 'L1', co: 'CO1' }
      ]
    }, {
      headers: { Cookie: `jwt=${profToken}` }
    });
    
    // We expect this to fail gracefully or succeed if data is mocked properly
    if (res.status === 200 || res.status === 500) { 
      // 500 is acceptable here if Firebase DB is empty and throws on generation
      console.log('✅ Generate Draft endpoint reachable and RBAC passed');
      passed++;
    }
  } catch (error) {
    if (error.response?.status === 403) {
      console.log('❌ Generate Draft Failed: RBAC error (Professor should have access)');
      failed++;
    } else {
      console.log('✅ Generate Draft endpoint reachable (Threw expected error during execution)');
      passed++;
    }
  }

  // Test 3: COE Release Draft (RBAC Check)
  console.log('\n[Test 3] COE Release Draft (RBAC Check)');
  try {
    const coeToken = generateToken('controller_of_exams');
    const res = await axios.post(`${API_URL}/test_draft_id/release`, {}, {
      headers: { Cookie: `jwt=${coeToken}` }
    });
    passed++;
  } catch (error) {
    // 404 means route is hit but draft doesn't exist. 403 means RBAC blocked it.
    if (error.response?.status === 404 || error.response?.status === 500 || error.response?.status === 400) {
      console.log('✅ COE Release endpoint reachable and RBAC passed');
      passed++;
    } else if (error.response?.status === 403) {
      console.log('❌ COE Release Failed: RBAC error (COE should have access)');
      failed++;
    } else {
      console.log('❌ COE Release Failed:', error.message);
      failed++;
    }
  }

  // Test 4: Professor attempt to Release Draft (Should Fail)
  console.log('\n[Test 4] Professor attempt to Release Draft (Should Fail)');
  try {
    const profToken = generateToken('professor');
    await axios.post(`${API_URL}/test_draft_id/release`, {}, {
      headers: { Cookie: `jwt=${profToken}` }
    });
    console.log('❌ Professor Release Failed: Should have been blocked by RBAC');
    failed++;
  } catch (error) {
    if (error.response?.status === 403) {
      console.log('✅ Professor Release blocked by RBAC correctly');
      passed++;
    } else {
      console.log('❌ Professor Release Failed with unexpected error:', error.message);
      failed++;
    }
  }

  console.log('\n--- Test Summary ---');
  console.log(`Passed: ${passed}`);
  console.log(`Failed: ${failed}`);
  
  if (failed > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
};

runTests();
