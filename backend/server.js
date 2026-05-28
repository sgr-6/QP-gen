const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const axios = require('axios');
const admin = require('firebase-admin');

dotenv.config();

const app = express();

app.use(cors({ origin: true, credentials: true }));
app.use(express.json());

// Import Routes
const uploadRoutes = require('./src/routes/upload');
const draftRoutes = require('./src/routes/draft');

app.use('/api', uploadRoutes);
app.use('/api', draftRoutes);

// Initialize Firebase Admin (Wrapped in try-catch to allow server to start even if missing keys)
let db;
try {
  const serviceAccount = require('./firebase-service-account.json');
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });
  db = admin.firestore();
  console.log("Firebase Admin initialized successfully");
} catch (error) {
  console.warn("⚠️ Firebase Admin SDK failed to initialize. Please add 'firebase-service-account.json' to the backend folder.");
}

// Ensure JWT_SECRET is set
const JWT_SECRET = process.env.JWT_SECRET || 'fallback-secret-key-do-not-use-in-production';

// Generate 6-digit OTP
const generateOTP = () => Math.floor(100000 + Math.random() * 900000).toString();

// Route: Generate OTP and send via EmailJS
app.post('/auth/otp/generate', async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: 'Email is required' });

    const otp = generateOTP();
    const hashedOTP = await bcrypt.hash(otp, 10);
    const expiresAt = Date.now() + 5 * 60 * 1000; // 5 minutes

    if (db) {
      // Store in Firestore
      await db.collection('otps').doc(email).set({
        hash: hashedOTP,
        expiresAt: expiresAt
      });
      
      // Audit log
      await db.collection('audit_logs').add({
        action: 'OTP_GENERATED',
        email: email,
        timestamp: admin.firestore.FieldValue.serverTimestamp()
      });
    } else {
      console.log(`[MOCK] Storing OTP ${otp} for ${email}`);
    }

    // Send via EmailJS API
    const emailJsPayload = {
      service_id: process.env.EMAILJS_SERVICE_ID,
      template_id: process.env.EMAILJS_TEMPLATE_ID,
      user_id: process.env.EMAILJS_PUBLIC_KEY,
      accessToken: process.env.EMAILJS_PRIVATE_KEY,
      template_params: {
        to_email: email,
        otp: otp
      }
    };

    const response = await axios.post('https://api.emailjs.com/api/v1.0/email/send', emailJsPayload, {
      headers: { 'Content-Type': 'application/json' }
    });
    
    console.log(`EmailJS response status: ${response.status}`);

    res.json({ message: 'OTP generated and sent successfully' });
  } catch (error) {
    console.error('Error generating OTP:', error.response?.data || error.message);
    res.status(500).json({ error: 'Failed to generate OTP' });
  }
});

// Route: Verify OTP
app.post('/auth/otp/verify', async (req, res) => {
  try {
    const { email, otp } = req.body;
    if (!email || !otp) return res.status(400).json({ error: 'Email and OTP are required' });

    let hashToCompare = '';
    let expiration = 0;
    
    if (db) {
      const doc = await db.collection('otps').doc(email).get();
      if (!doc.exists) {
        return res.status(400).json({ error: 'No OTP found or OTP expired' });
      }
      
      const data = doc.data();
      hashToCompare = data.hash;
      expiration = data.expiresAt;
    } else {
      // Mock logic if no DB
      return res.status(400).json({ error: 'Database not configured' });
    }

    if (Date.now() > expiration) {
      if (db) await db.collection('otps').doc(email).delete();
      return res.status(400).json({ error: 'OTP has expired' });
    }

    const isValid = await bcrypt.compare(otp, hashToCompare);
    if (!isValid) {
      return res.status(400).json({ error: 'Invalid OTP' });
    }

    // OTP is valid. Delete it.
    if (db) {
      await db.collection('otps').doc(email).delete();
      
      // Attempt to find user role. Default to Professor if not found
      let role = 'Professor';
      const userDoc = await db.collection('users').doc(email).get();
      if (userDoc.exists) {
        role = userDoc.data().role || 'Professor';
      }
      
      // Audit log
      await db.collection('audit_logs').add({
        action: 'LOGIN_SUCCESS',
        email: email,
        role: role,
        timestamp: admin.firestore.FieldValue.serverTimestamp()
      });

      // Generate JWT
      const token = jwt.sign({ email, role }, JWT_SECRET, { expiresIn: '12h' });

      // Set HttpOnly Cookie
      res.cookie('jwt', token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict',
        maxAge: 12 * 60 * 60 * 1000 // 12 hours
      });
      
      res.json({ message: 'Login successful', user: { email, role } });
    }
  } catch (error) {
    console.error('Error verifying OTP:', error);
    res.status(500).json({ error: 'Failed to verify OTP' });
  }
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Backend server running on port ${PORT}`);
});
