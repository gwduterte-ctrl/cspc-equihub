const path = require('path');
const PROOF_DIR = path.join(__dirname, '..', 'uploads-private', 'proofs');

// Return proofs are NOT in /public. They are streamed only after an ownership/role check.
function sendProof(res, request) {
  if (!request || !request.return_proof || !/^[a-f0-9]{32}\.(jpg|png|webp)$/.test(request.return_proof)) {
    return res.status(404).render('error', { title: 'Not found', code: 404, message: 'File not found.', shell: 'public' });
  }
  res.set('Cache-Control', 'private, no-store');
  res.sendFile(request.return_proof, { root: PROOF_DIR, dotfiles: 'deny' });
}
module.exports = { PROOF_DIR, sendProof };
