// Image upload handling: size limit, magic-byte check, random file names.
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 3 * 1024 * 1024, files: 1 },
  fileFilter: (req, file, cb) =>
    cb(null, ['image/jpeg', 'image/png', 'image/webp'].includes(file.mimetype))
});

function detectExt(buf) {
  if (buf.length > 12 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return '.jpg';
  if (buf.length > 8 && buf.slice(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return '.png';
  if (buf.length > 12 && buf.slice(0, 4).toString() === 'RIFF' && buf.slice(8, 12).toString() === 'WEBP') return '.webp';
  return null;
}

// returns the stored file name, or null when the file is not a real image
function saveImage(file, dir) {
  if (!file || !file.buffer) return null;
  const ext = detectExt(file.buffer); // the client-sent name and MIME are never trusted
  if (!ext) return null;
  fs.mkdirSync(dir, { recursive: true });
  const name = crypto.randomBytes(16).toString('hex') + ext;
  fs.writeFileSync(path.join(dir, name), file.buffer, { mode: 0o640 });
  return name;
}

function removeImage(dir, name) {
  if (!name || !/^[a-f0-9]{32}\.(jpg|png|webp)$/.test(name)) return;
  fs.unlink(path.join(dir, name), () => {});
}

module.exports = { upload, saveImage, removeImage };
