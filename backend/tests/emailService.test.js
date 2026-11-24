jest.mock('axios', () => ({ post: jest.fn() }));

const axios = require('axios');
const { sendOTPEmail } = require('../src/services/emailService');
const expiresAt = Date.UTC(2026, 10, 17, 10, 5);
const settings = {
  EMAILJS_SERVICE_ID: 'service_offline',
  EMAILJS_TEMPLATE_ID: 'template_offline',
  EMAILJS_PUBLIC_KEY: 'offline-public-key',
  EMAILJS_PRIVATE_KEY: 'offline-private-key'
};
const original = Object.fromEntries(Object.keys(settings).map(name => [name, process.env[name]]));

beforeEach(() => {
  jest.resetAllMocks();
  Object.assign(process.env, settings);
  axios.post.mockResolvedValue({ status: 200, data: 'OK' });
});

afterEach(() => {
  for (const [name, value] of Object.entries(original)) {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
  jest.restoreAllMocks();
});

test('sends the configured template fields and exact expiration with server-side authentication', async () => {
  await expect(sendOTPEmail('member@offline.invalid', '735291', expiresAt)).resolves.toBeUndefined();
  expect(axios.post).toHaveBeenCalledTimes(1);
  expect(axios.post).toHaveBeenCalledWith('https://api.emailjs.com/api/v1.0/email/send', {
    service_id: settings.EMAILJS_SERVICE_ID,
    template_id: settings.EMAILJS_TEMPLATE_ID,
    user_id: settings.EMAILJS_PUBLIC_KEY,
    accessToken: settings.EMAILJS_PRIVATE_KEY,
    template_params: { email: 'member@offline.invalid', otp: '735291', time: 'Tue, 17 Nov 2026 10:05:00 GMT' }
  }, {
    headers: { 'Content-Type': 'application/json' }, timeout: 15000, maxRedirects: 0
  });
});

test.each(Object.keys(settings))('fails closed when %s is absent', async name => {
  delete process.env[name];
  await expect(sendOTPEmail('member@offline.invalid', '735291', expiresAt)).rejects.toMatchObject({
    status: 503, message: expect.stringContaining(name)
  });
  expect(axios.post).not.toHaveBeenCalled();
});

test.each(Object.keys(settings))('rejects a blank %s', async name => {
  process.env[name] = '  ';
  await expect(sendOTPEmail('member@offline.invalid', '735291', expiresAt)).rejects.toMatchObject({ status: 503 });
  expect(axios.post).not.toHaveBeenCalled();
});

test('trims accidental whitespace around configured IDs and keys', async () => {
  for (const [name, value] of Object.entries(settings)) process.env[name] = ` ${value} `;
  await sendOTPEmail('member@offline.invalid', '735291', expiresAt);
  expect(axios.post.mock.calls[0][1]).toMatchObject({ service_id: settings.EMAILJS_SERVICE_ID, accessToken: settings.EMAILJS_PRIVATE_KEY });
});

test.each([400, 401, 403, 422, 500])('reports provider HTTP %i without exposing credentials or retrying', async status => {
  axios.post.mockRejectedValue({
    message: 'request containing secret-value',
    response: { status, data: 'secret-value' }, config: { data: 'secret-value' }
  });
  await expect(sendOTPEmail('member@offline.invalid', '735291', expiresAt)).rejects.toMatchObject({
    status: 502, message: 'EmailJS could not deliver the OTP. Check the service ID, template, keys, and server-side API access.'
  });
  expect(axios.post).toHaveBeenCalledTimes(1);
});

test('identifies strict-mode authentication failure without exposing either key', async () => {
  axios.post.mockRejectedValue({
    response: { status: 403, data: 'API access in strict mode, but no Private Key was provided' }
  });
  await expect(sendOTPEmail('member@offline.invalid', '735291', expiresAt)).rejects.toMatchObject({
    status: 503,
    message: 'EmailJS strict-mode authentication failed. Verify EMAILJS_PRIVATE_KEY and EMAILJS_PUBLIC_KEY belong to the same EmailJS account.'
  });
  expect(axios.post).toHaveBeenCalledTimes(1);
  expect(axios.post.mock.calls[0][1]).toMatchObject({
    user_id: settings.EMAILJS_PUBLIC_KEY, accessToken: settings.EMAILJS_PRIVATE_KEY
  });
});

test('propagates rate limiting without automatically sending another email', async () => {
  axios.post.mockRejectedValue({ response: { status: 429 } });
  await expect(sendOTPEmail('member@offline.invalid', '735291', expiresAt)).rejects.toMatchObject({ status: 429, message: expect.stringContaining('rate limit') });
  expect(axios.post).toHaveBeenCalledTimes(1);
});

test('reports a timeout without leaking the original error', async () => {
  axios.post.mockRejectedValue(Object.assign(new Error('private request contents'), { code: 'ECONNABORTED' }));
  await expect(sendOTPEmail('member@offline.invalid', '735291', expiresAt)).rejects.toMatchObject({ status: 502, message: expect.not.stringContaining('private request contents') });
});

test.each([
  { status: 200, data: 'error' },
  { status: 200, data: { error: 'invalid template' } },
  { status: 202, data: 'OK' },
  { status: 302, data: 'OK' }
])('rejects an unconfirmed provider response %p', async response => {
  axios.post.mockResolvedValue(response);
  await expect(sendOTPEmail('member@offline.invalid', '735291', expiresAt)).rejects.toMatchObject({ status: 502, message: 'EmailJS did not confirm OTP delivery.' });
});

test('never prints OTPs or credentials to the console', async () => {
  const log = jest.spyOn(console, 'log').mockImplementation(() => {});
  const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
  const error = jest.spyOn(console, 'error').mockImplementation(() => {});
  await sendOTPEmail('member@offline.invalid', '735291', expiresAt);
  delete process.env.EMAILJS_PRIVATE_KEY;
  await expect(sendOTPEmail('member@offline.invalid', '735291', expiresAt)).rejects.toThrow();
  expect(log).not.toHaveBeenCalled();
  expect(warn).not.toHaveBeenCalled();
  expect(error).not.toHaveBeenCalled();
});
