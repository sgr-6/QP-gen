const { Resend } = require('resend');

const resendApiKey = process.env.RESEND_API_KEY;
if (!resendApiKey) {
  console.warn('⚠️ RESEND_API_KEY not set. OTP emails will be logged to console instead.');
}

const resend = resendApiKey ? new Resend(resendApiKey) : null;
const FROM_EMAIL = process.env.OTP_FROM_EMAIL || 'QP Generator <onboarding@resend.dev>';

/**
 * Send OTP email via Resend.
 * @param {string} toEmail
 * @param {string} otp
 * @returns {Promise<void>}
 */
const sendOTPEmail = async (toEmail, otp) => {
  if (!resend) {
    console.log(`[DEV MODE] OTP for ${toEmail}: ${otp}`);
    return;
  }

  await resend.emails.send({
    from: FROM_EMAIL,
    to: toEmail,
    subject: 'Your QP Generator Login OTP',
    html: `
      <div style="font-family: 'Inter', sans-serif; max-width: 480px; margin: 0 auto; padding: 32px;">
        <h2 style="color: #8A2BE2; margin-bottom: 8px;">QP Generator</h2>
        <p style="color: #2D3748; font-size: 16px;">Your one-time verification code is:</p>
        <div style="background: #F0E6FF; padding: 20px; border-radius: 12px; text-align: center; margin: 24px 0;">
          <span style="font-size: 32px; font-weight: 700; letter-spacing: 6px; color: #8A2BE2;">${otp}</span>
        </div>
        <p style="color: #718096; font-size: 14px;">This code expires in 5 minutes. Do not share it with anyone.</p>
        <p style="color: #718096; font-size: 12px; margin-top: 24px;">If you didn't request this, please ignore this email.</p>
      </div>
    `,
  });
};

module.exports = { sendOTPEmail };
