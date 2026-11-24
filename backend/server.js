const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const dotenv = require('dotenv');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { randomInt } = require('node:crypto');

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

app.use(cors({ 
  origin: true, // Allow any origin for now to prevent CORS issues
  credentials: true 
}));
app.use(express.json());
app.use(cookieParser());

// Mount modular routes
const uploadRoutes = require('./src/routes/upload');
const draftRoutes = require('./src/routes/draft');


app.use('/api', uploadRoutes);
app.use('/api/draft', draftRoutes);
app.use('/api', draftRoutes);
app.use('/api/syllabus', require('./src/routes/syllabus'));
app.use('/api/template', require('./src/routes/template'));
app.use('/api/notes', require('./src/routes/notes'));


const generateOTP = () => randomInt(100000, 1000000).toString();

// Route: Generate OTP
app.post(['/auth/otp/generate', '/api/auth/otp/generate'], async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: 'Email is required' });

    const { data: userData, error: userError } = await supabase
      .from('users')
      .select('id')
      .eq('email', email)
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

    await sendOTPEmail(email, otp, expiresAt);

    res.json({ message: 'OTP generated and sent successfully' });
  } catch (error) {
    console.error('Error generating OTP:', error.message);
    const status = [429, 502, 503].includes(error.status) ? error.status : 500;
    res.status(status).json({ error: status === 500 ? 'Failed to generate OTP' : error.message });
  }
});

// Route: Verify OTP
app.post(['/auth/otp/verify', '/api/auth/otp/verify'], async (req, res) => {
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

    // Set HttpOnly Cookie (session cookie - expires on browser close)
    res.cookie('jwt', token, {
      httpOnly: true,
      secure: true, // MUST be true for sameSite: 'none'
      sameSite: 'none', // MUST be 'none' for cross-domain requests
    });
    
    res.json({ message: 'Login successful', token, user: { email, role: userData.role } });
  } catch (error) {
    console.error('Error verifying OTP:', error);
    res.status(500).json({ error: 'Failed to verify OTP' });
  }
});

// Route: Logout (clear JWT cookie)
app.post(['/auth/logout', '/api/auth/logout'], (req, res) => {
  res.clearCookie('jwt', {
    httpOnly: true,
    secure: true,
    sameSite: 'none',
  });
  res.json({ message: 'Logged out successfully' });
});

// Route: Session check (returns current user from JWT)
app.get(['/auth/me', '/api/auth/me'], authenticate, (req, res) => {
  res.json({ user: req.user });
});

// Return actionable JSON for upload validation failures instead of HTML.
app.use((error, req, res, next) => {
  if (res.headersSent) return next(error);
  const status = error.code === 'LIMIT_FILE_SIZE' ? 413 : error.status || 500;
  res.status(status).json({ error: error.code === 'LIMIT_FILE_SIZE' ? 'Upload exceeds the 25 MB limit.' : error.message || 'Request failed.' });
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Backend server running on port ${PORT}`);
});
