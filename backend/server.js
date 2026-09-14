const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const dotenv = require('dotenv');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');

dotenv.config();

// Initialize Firebase Admin (throws on failure)
const { db } = require('./src/config/firebaseAdmin');

// Supabase client (throws on failure)
const supabase = require('./src/config/supabaseClient');

// Services
const { sendOTPEmail } = require('./src/services/emailService');

// Middleware
const { authenticate, JWT_SECRET } = require('./src/middleware/auth');

const app = express();

app.use(cors({ origin: ['http://localhost:3000', process.env.FRONTEND_URL], credentials: true }));
app.use(express.json());
app.use(cookieParser());

// Import Routes
const uploadRoutes = require('./src/routes/upload');
const draftRoutes = require('./src/routes/draft');
const superAdminRoutes = require('./src/routes/superAdmin');
const tenantAdminRoutes = require('./src/routes/tenantAdmin');

app.use('/api', uploadRoutes);
app.use('/api', draftRoutes);
app.use('/api/syllabus', require('./src/routes/syllabus'));
app.use('/api/template', require('./src/routes/template'));
app.use('/api/super-admin', superAdminRoutes);
app.use('/api/tenant-admin', tenantAdminRoutes);
app.use('/api/print-admin', require('./src/routes/printAdmin'));

// Generate 6-digit OTP
const generateOTP = () => Math.floor(100000 + Math.random() * 900000).toString();

// Route: Generate OTP
app.post('/auth/otp/generate', async (req, res) => {
  try {
    const { email, orgCode } = req.body;
    if (!email || !orgCode) return res.status(400).json({ error: 'Email and orgCode are required' });

    // Look up user in Supabase
    const { data: tenantData, error: tenantError } = await supabase
      .from('tenants')
      .select('id')
      .eq('org_code', orgCode)
      .single();

    if (tenantError || !tenantData) {
      return res.status(403).json({ error: 'Invalid organization code' });
    }

    const { data: userData, error: userError } = await supabase
      .from('users')
      .select('id')
      .eq('email', email)
      .eq('tenant_id', tenantData.id)
      .single();

    if (userError || !userData) {
      return res.status(403).json({ error: 'User not registered. Contact your institution admin.' });
    }

    const otp = generateOTP();
    const hashedOTP = await bcrypt.hash(otp, 10);
    const expiresAt = Date.now() + 5 * 60 * 1000; // 5 minutes

    // Store in Supabase otp_store
    const { error: otpError } = await supabase
      .from('otp_store')
      .insert({
        email: email,
        hash: hashedOTP,
        expires_at: expiresAt
      });

    if (otpError) throw otpError;

    // Send via Resend
    await sendOTPEmail(email, otp);

    res.json({ message: 'OTP generated and sent successfully' });
  } catch (error) {
    console.error('Error generating OTP:', error.message);
    res.status(500).json({ error: 'Failed to generate OTP' });
  }
});

// Route: Verify OTP
app.post('/auth/otp/verify', async (req, res) => {
  try {
    const { email, otp } = req.body;
    if (!email || !otp) return res.status(400).json({ error: 'Email and OTP are required' });

    // Fetch latest OTP for email
    const { data: otpData, error: otpError } = await supabase
      .from('otp_store')
      .select('*')
      .eq('email', email)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (otpError || !otpData) {
      return res.status(400).json({ error: 'No OTP found or OTP expired' });
    }

    if (Date.now() > otpData.expires_at) {
      await supabase.from('otp_store').delete().eq('id', otpData.id);
      return res.status(400).json({ error: 'OTP has expired' });
    }

    const isValid = await bcrypt.compare(otp, otpData.hash);
    if (!isValid) {
      return res.status(400).json({ error: 'Invalid OTP' });
    }

    // OTP is valid. Delete all OTPs for this email.
    await supabase.from('otp_store').delete().eq('email', email);
    
    // Fetch user's role + tenantId
    const { data: userData, error: userError } = await supabase
      .from('users')
      .select('id, role, tenant_id')
      .eq('email', email)
      .single();

    if (userError || !userData) {
      return res.status(403).json({ error: 'User not found in system.' });
    }

    // Generate JWT
    const token = jwt.sign(
      { email, role: userData.role, tenantId: userData.tenant_id, userId: userData.id },
      JWT_SECRET,
      { expiresIn: '12h' }
    );

    // Set HttpOnly Cookie
    res.cookie('jwt', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 12 * 60 * 60 * 1000 // 12 hours
    });
    
    res.json({ message: 'Login successful', user: { email, role: userData.role } });
  } catch (error) {
    console.error('Error verifying OTP:', error);
    res.status(500).json({ error: 'Failed to verify OTP' });
  }
});

// Route: Logout (clear JWT cookie)
app.post('/auth/logout', (req, res) => {
  res.clearCookie('jwt', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
  });
  res.json({ message: 'Logged out successfully' });
});

// Route: Session check (returns current user from JWT)
app.get('/auth/me', authenticate, (req, res) => {
  res.json({ user: req.user });
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Backend server running on port ${PORT}`);
});
