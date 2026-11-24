const fs = require('fs/promises');
const path = require('path');
const multer = require('multer');
const crypto = require('crypto');
const supabase = require('../config/supabaseClient');

const upload = multer({ dest: 'uploads/', limits: { fileSize: 25 * 1024 * 1024, files: 1 }, fileFilter: (req, file, cb) => {
  if (!['.pdf', '.docx', '.txt', '.csv', '.xlsx'].includes(path.extname(file.originalname).toLowerCase())) return cb(Object.assign(new Error('Unsupported file format.'), { status: 400 }));
  cb(null, true);
} });

const courseDocId = (tenantId, courseTitle) => `${tenantId}_${courseTitle.trim().replace(/\s+/g, '_').toLowerCase()}`;
function metadata(req) {
  if (!req.file) throw Object.assign(new Error('No file uploaded.'), { status: 400 });
  if (!req.user?.tenantId) throw Object.assign(new Error('Tenant ID is required.'), { status: 400 });
  const data = {};
  for (const key of ['courseTitle', 'department', 'semester', 'subjectCode']) {
    const value = String(req.body[key] || '').trim();
    if (!value || value.length > 160 || /[\\/]/.test(value)) throw Object.assign(new Error(`Valid ${key} is required (no slashes, maximum 160 characters).`), { status: 400 });
    data[key] = value;
  }
  return { ...data, tenantId: req.user.tenantId };
}

async function storeSource(file, bucket, tenantId) {
  const fileName = `${crypto.randomUUID()}${path.extname(file.originalname).toLowerCase()}`;
  const storagePath = `${tenantId}/${fileName}`;
  // Buckets must be provisioned by an administrator; don't make student notes public.
  const { error } = await supabase.storage.from(bucket).upload(storagePath, await fs.readFile(file.path), { contentType: file.mimetype, upsert: false });
  if (error) throw Object.assign(new Error(`Source storage failed for ${bucket}. Check bucket configuration and permissions.`), { status: 503 });
  return { fileName, bucket, storagePath };
}
async function cleanup(req) {
  if (req.file?.path) await fs.unlink(req.file.path).catch(() => {});
}
function respondError(res, error) {
  const status = [400, 403, 404, 409, 413, 422, 429, 503].includes(Number(error.status)) ? Number(error.status) : 500;
  res.status(status).json({ error: error.message || 'Document processing failed.' });
}
module.exports = { upload, metadata, courseDocId, storeSource, cleanup, respondError };
