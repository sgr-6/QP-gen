jest.mock('../src/config/supabaseClient', () => ({ from: jest.fn() }));
jest.mock('../src/utils/cryptoUtils', () => ({ encryptData: jest.fn(), decryptData: jest.fn(p => p), generateSHA256Hash: jest.fn(() => 'hash') }));
jest.mock('../src/config/firebaseAdmin', () => {
  const drafts = new Map();
  const docRef = id => ({
    get: async () => ({ exists: drafts.has(id), data: () => drafts.get(id) }),
    update: async changes => drafts.set(id, { ...drafts.get(id), ...changes })
  });
  return {
    drafts,
    db: { collection: () => ({ doc: docRef }) },
    admin: { firestore: { FieldValue: { serverTimestamp: () => 'now' }, Timestamp: { fromDate: d => d } } }
  };
});

const { drafts } = require('../src/config/firebaseAdmin');
const { updateDraftStatus, releaseDraft } = require('../src/controllers/draftController');

const response = () => ({ status: jest.fn().mockReturnThis(), json: jest.fn().mockReturnThis() });
const user = (role, userId) => ({ role, userId, tenantId: 't1' });
const setStatus = async (status, reqUser) => {
  const res = response();
  await updateDraftStatus({ params: { id: 'd1' }, body: { status }, user: reqUser }, res);
  return res;
};

beforeEach(() => {
  drafts.clear();
  drafts.set('d1', { tenantId: 't1', createdBy: 'prof', status: 'draft', paper: {} });
});

test('professor can submit their own draft for HOD review', async () => {
  const res = await setStatus('pending_hod_approval', user('professor', 'prof'));
  expect(res.status).not.toHaveBeenCalled();
  expect(drafts.get('d1').status).toBe('pending_hod_approval');
});

test('professor cannot submit someone else\'s draft', async () => {
  const res = await setStatus('pending_hod_approval', user('professor', 'other'));
  expect(res.status).toHaveBeenCalledWith(403);
  expect(drafts.get('d1').status).toBe('draft');
});

test('professor cannot approve or release via status endpoint', async () => {
  drafts.get('d1').status = 'pending_hod_approval';
  expect((await setStatus('pending_coe_release', user('professor', 'prof'))).status).toHaveBeenCalledWith(403);
  expect((await setStatus('released', user('hod', 'hod1'))).status).toHaveBeenCalledWith(400);
  expect(drafts.get('d1').status).toBe('pending_hod_approval');
});

test('HOD approves another user\'s draft but not their own', async () => {
  drafts.get('d1').status = 'pending_hod_approval';
  expect((await setStatus('pending_coe_release', user('hod', 'prof'))).status).toHaveBeenCalledWith(403);
  const res = await setStatus('pending_coe_release', user('hod', 'hod1'));
  expect(res.status).not.toHaveBeenCalled();
  expect(drafts.get('d1').status).toBe('pending_coe_release');
});

test('release requires an HOD-approved draft and a valid embargo', async () => {
  const coe = user('controller_of_exams', 'coe');
  let res = response();
  await releaseDraft({ params: { id: 'd1' }, body: { embargoTimestamp: '2030-01-01T00:00' }, user: coe }, res);
  expect(res.status).toHaveBeenCalledWith(409);

  drafts.get('d1').status = 'pending_coe_release';
  res = response();
  await releaseDraft({ params: { id: 'd1' }, body: { embargoTimestamp: 'not-a-date' }, user: coe }, res);
  expect(res.status).toHaveBeenCalledWith(400);

  res = response();
  await releaseDraft({ params: { id: 'd1' }, body: { embargoTimestamp: '2030-01-01T00:00' }, user: coe }, res);
  expect(res.status).not.toHaveBeenCalled();
  expect(drafts.get('d1').status).toBe('released');
});
