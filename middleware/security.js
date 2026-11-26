// Week 12 countermeasures: CSRF token, flash messages, validation handler.
const crypto = require('crypto');
const { validationResult } = require('express-validator');

function csrfToken(req, res, next) {
  if (!req.session.csrf) req.session.csrf = crypto.randomBytes(32).toString('hex');
  res.locals.csrfToken = req.session.csrf;
  next();
}

function safeEqual(a, b) {
  const x = Buffer.from(String(a || '')); const y = Buffer.from(String(b || ''));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

// For multipart forms, the route runs multer FIRST and then calls verifyCsrf.
function verifyCsrf(req, res, next) {
  const token = (req.body && req.body._csrf) || req.get('x-csrf-token');
  if (!token || !req.session.csrf || !safeEqual(token, req.session.csrf)) { // an empty token never matches an empty session value
    const err = new Error('Invalid CSRF token'); err.status = 403; return next(err);
  }
  next();
}
function globalCsrf(req, res, next) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  if ((req.headers['content-type'] || '').startsWith('multipart/form-data')) return next(); // verified per-route after multer
  return verifyCsrf(req, res, next);
}

const FLASH_ERR = /(\bnot\b|no longer|\bonly\b|cannot|invalid|expired|failed|still has|first\.|too long|must use|give a reason|could not|couldn't|is blocked|please sign in|no borrower|please tick)/i;
const FLASH_INFO = /^(nothing|no new)/i;
function flash(req, res, next) {
  const f = req.session.flash;
  res.locals.flash = f ? { text: String(f), type: FLASH_INFO.test(f) ? 'info' : FLASH_ERR.test(f) ? 'error' : 'success' } : null;
  delete req.session.flash;
  res.locals.greet = !!req.session.greet; // one-time "Welcome to EquiHub!" screen right after login
  delete req.session.greet;
  next();
}

// collects express-validator errors as an array of strings
function collectErrors(req) {
  const r = validationResult(req);
  return r.isEmpty() ? [] : r.array().map((e) => e.msg);
}

module.exports = { csrfToken, globalCsrf, verifyCsrf, flash, collectErrors };
