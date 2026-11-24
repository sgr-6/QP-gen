const axios = require('axios');

const sendOTPEmail = async (toEmail, otp, expiresAt) => {
  const required = ['EMAILJS_SERVICE_ID', 'EMAILJS_TEMPLATE_ID', 'EMAILJS_PUBLIC_KEY', 'EMAILJS_PRIVATE_KEY'];
  const missing = required.filter(name => !process.env[name]?.trim());
  if (missing.length) {
    throw Object.assign(new Error(`EmailJS is not configured. Missing: ${missing.join(', ')}.`), { status: 503 });
  }

  let response;
  try {
    response = await axios.post('https://api.emailjs.com/api/v1.0/email/send', {
      service_id: process.env.EMAILJS_SERVICE_ID.trim(),
      template_id: process.env.EMAILJS_TEMPLATE_ID.trim(),
      user_id: process.env.EMAILJS_PUBLIC_KEY.trim(),
      accessToken: process.env.EMAILJS_PRIVATE_KEY.trim(),
      template_params: { email: toEmail, otp, time: new Date(expiresAt).toUTCString() }
    }, {
      headers: { 'Content-Type': 'application/json' },
      timeout: 15000,
      maxRedirects: 0
    });
  } catch (error) {
    if (error.response?.status === 403 && error.response.data === 'API access in strict mode, but no Private Key was provided') {
      throw Object.assign(new Error('EmailJS strict-mode authentication failed. Verify EMAILJS_PRIVATE_KEY and EMAILJS_PUBLIC_KEY belong to the same EmailJS account.'), { status: 503 });
    }
    const limited = error.response?.status === 429;
    throw Object.assign(new Error(limited
      ? 'EmailJS rate limit reached. Please wait before requesting another OTP.'
      : 'EmailJS could not deliver the OTP. Check the service ID, template, keys, and server-side API access.'), {
      status: limited ? 429 : 502
    });
  }

  if (response.status !== 200 || response.data !== 'OK') {
    throw Object.assign(new Error('EmailJS did not confirm OTP delivery.'), { status: 502 });
  }
};

module.exports = { sendOTPEmail };
