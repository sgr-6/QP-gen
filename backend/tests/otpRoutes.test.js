jest.mock('express', () => {
  const app = { use: jest.fn(), post: jest.fn(), get: jest.fn(), listen: jest.fn() };
  return Object.assign(jest.fn(() => app), { json: jest.fn() });
});
jest.mock('dotenv', () => ({ config: jest.fn() }));
jest.mock('bcrypt', () => ({ hash: jest.fn(), compare: jest.fn() }));
jest.mock('jsonwebtoken', () => ({ sign: jest.fn() }));
jest.mock('node:crypto', () => ({ randomInt: jest.fn() }));
jest.mock('../src/config/firebaseAdmin', () => ({ db: {} }));
jest.mock('../src/config/supabaseClient', () => ({ from: jest.fn() }));
jest.mock('../src/services/emailService', () => ({ sendOTPEmail: jest.fn() }));
jest.mock('../src/middleware/auth', () => ({ authenticate: jest.fn(), JWT_SECRET: 'offline-test-only-secret' }));
jest.mock('../src/routes/upload', () => jest.fn());
jest.mock('../src/routes/draft', () => jest.fn());
jest.mock('../src/routes/syllabus', () => jest.fn());
jest.mock('../src/routes/template', () => jest.fn());
jest.mock('../src/routes/notes', () => jest.fn());

const express = require('express');
const bcrypt = require('bcrypt');
const { randomInt } = require('node:crypto');
const supabase = require('../src/config/supabaseClient');
const { sendOTPEmail } = require('../src/services/emailService');
require('../server');
const app = express.mock.results[0].value;
const registration = app.post.mock.calls.find(([paths]) => paths.includes('/auth/otp/generate'));
const generate = registration[1];
let users;
let otps;
const response = () => ({ status: jest.fn().mockReturnThis(), json: jest.fn().mockReturnThis() });

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(console, 'error').mockImplementation(() => {});
  randomInt.mockReturnValue(735291);
  bcrypt.hash.mockResolvedValue('offline-hash');
  sendOTPEmail.mockResolvedValue(undefined);
  users = { select: jest.fn().mockReturnThis(), eq: jest.fn().mockReturnThis(), single: jest.fn().mockResolvedValue({ data: { id: 'member' }, error: null }) };
  otps = { insert: jest.fn().mockResolvedValue({ error: null }) };
  supabase.from.mockImplementation(table => {
    if (table === 'users') return users;
    if (table === 'otp_store') return otps;
    throw new Error(`Unexpected table: ${table}`);
  });
});
afterEach(() => jest.restoreAllMocks());

test('keeps both existing frontend endpoint aliases', () => {
  expect(registration[0]).toEqual(['/auth/otp/generate', '/api/auth/otp/generate']);
});

test('hashes a cryptographically generated OTP and sends it before reporting success', async () => {
  const res = response();
  const now = Date.now();
  sendOTPEmail.mockImplementation(async () => expect(res.json).not.toHaveBeenCalled());
  await generate({ body: { email: 'member@offline.invalid' } }, res);
  expect(randomInt).toHaveBeenCalledWith(100000, 1000000);
  expect(bcrypt.hash).toHaveBeenCalledWith('735291', 10);
  expect(otps.insert).toHaveBeenCalledWith({ email: 'member@offline.invalid', hash: 'offline-hash', expires_at: expect.any(Number) });
  expect(otps.insert.mock.calls[0][0].expires_at).toBeGreaterThanOrEqual(now + 300000);
  expect(sendOTPEmail).toHaveBeenCalledWith('member@offline.invalid', '735291', otps.insert.mock.calls[0][0].expires_at);
  expect(res.json).toHaveBeenCalledWith({ message: 'OTP generated and sent successfully' });
});

test.each([100000, 999999])('preserves six digits at the RNG boundary %i', async value => {
  randomInt.mockReturnValue(value);
  await generate({ body: { email: 'member@offline.invalid' } }, response());
  expect(sendOTPEmail).toHaveBeenCalledWith('member@offline.invalid', String(value), otps.insert.mock.calls[0][0].expires_at);
});

test('rejects an absent email without sending or accessing the database', async () => {
  const res = response();
  await generate({ body: {} }, res);
  expect(res.status).toHaveBeenCalledWith(400);
  expect(supabase.from).not.toHaveBeenCalled();
  expect(sendOTPEmail).not.toHaveBeenCalled();
});

test('does not send email to an unregistered user', async () => {
  users.single.mockResolvedValue({ data: null, error: null });
  const res = response();
  await generate({ body: { email: 'unknown@offline.invalid' } }, res);
  expect(res.status).toHaveBeenCalledWith(403);
  expect(otps.insert).not.toHaveBeenCalled();
  expect(sendOTPEmail).not.toHaveBeenCalled();
});

test('does not send an OTP that could not be stored', async () => {
  otps.insert.mockResolvedValue({ error: new Error('offline storage error') });
  const res = response();
  await generate({ body: { email: 'member@offline.invalid' } }, res);
  expect(res.status).toHaveBeenCalledWith(500);
  expect(res.json).toHaveBeenCalledWith({ error: 'Failed to generate OTP' });
  expect(sendOTPEmail).not.toHaveBeenCalled();
});

test.each([429, 502, 503])('returns a visible EmailJS failure with HTTP %i, never success', async status => {
  sendOTPEmail.mockRejectedValue(Object.assign(new Error('EmailJS safe error'), { status }));
  const res = response();
  await generate({ body: { email: 'member@offline.invalid' } }, res);
  expect(res.status).toHaveBeenCalledWith(status);
  expect(res.json).toHaveBeenCalledTimes(1);
  expect(res.json).toHaveBeenCalledWith({ error: 'EmailJS safe error' });
});
