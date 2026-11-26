# CSPC EquiHub

Campus equipment borrowing system for Camarines Sur Polytechnic Colleges. Built for **CCIT 106** (Weeks 1-8 foundation: Node/npm, Express routing, EJS views, MySQL, Git workflow, AI-assisted development log) with the Week 11-12 security controls applied from the start.

Two sides, two URLs:

| Side | URL | Who |
|---|---|---|
| Borrower site | `/` (login at `/login`, account at `/account`) | students, faculty, employees |
| Admin panel | `/admin` (login at `/admin/login`) | equipment office |

## Setup (clone to running server)

```bash
git clone <your-repo-url> cspc-equihub
cd cspc-equihub
npm install
cp .env.example .env        # then fill in the values (see below)
```

Then in XAMPP, start MySQL, open phpMyAdmin > SQL tab and run `database/create-app-user.sql`
(change `CHANGE_ME` to your `DB_PASSWORD` first). Then choose one:

```bash
# A) demo catalog (departments, categories, equipment) - import in phpMyAdmin:
#    select cspc_hiramhub > Import > database/demo-data.sql
# B) empty database
npm run db:init

npm run seed:admin          # creates the first admin from ADMIN_EMAIL / ADMIN_PASSWORD
npm run dev                 # http://localhost:3000
```

If you ever see `Access denied for user 'hiramhub_app'`, run `database/create-app-user.sql` again.

Requirements: Node 20/22 LTS, MySQL 8+ or MariaDB 10.4+ (XAMPP).

### `.env` values

- `DB_*` - MySQL connection. Use a dedicated MySQL user, not root.
- `SESSION_SECRET` - `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"`
- `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` - Google Cloud Console > Credentials > OAuth client (Web). Add `http://localhost:3000/auth/google/callback` as an authorised redirect URI. Leave empty to hide the Google buttons.
- `ALLOWED_EMAIL_DOMAINS` - only these e-mail domains can sign up/in (default `cspc.edu.ph,my.cspc.edu.ph`; confirm the real domains with your IT office).
- `SMTP_*`, `MAIL_FROM` - your mailer. When set, new accounts must confirm their e-mail and users get decision e-mails. When empty, e-mail is skipped and accounts are auto-verified (development only).

## Features

**Borrower side:** Google sign-in or e-mail sign-up; home page grouped by department > category with images and live quantity; search with department / category / availability filters; "how to borrow" slide demo; borrow form (quantity, borrow date, return date, purpose - server rejects anything missing); account side menu with Notifications, Profile, Requests history, Logs; return-proof photo upload; data download (RA 10173 right to access).

**Admin side:** dashboard (counts, 7-day chart, most borrowed, latest activity); equipment CRUD (image, name, description, status, total and available quantity); categories per department with image; requests inbox with approve / decline; view return-proof photos and confirm or reject them; block / unblock users with a reason; full activity log.

**Admin management:** departments (code, name, logo), categories per department, equipment (with *featured* flag), users (detail page, block / unblock), requests (approve, decline, verify returns), **overdue returns** page with reminders, and **homepage content** (hero text, tagline, how-it-works steps, about text, items per department).

**Overdue reminders:** a background job runs every 6 hours (first run 30 s after start) and, for every approved request past its return date, sends **one reminder per day** as a notification in the borrower's side menu *and* an e-mail (needs `SMTP_*` in `.env`). Admins can also press *Send reminders now* or *Remind* on a single request.

**Business rules:** stock is reserved on approval and restored when the admin confirms the return; a user with unreturned equipment cannot submit or get approved for another request; blocked users cannot borrow.

## Security map (Weeks 11-12)

| Threat | Control | Where |
|---|---|---|
| SQL injection | every query parameterised (`?`), ORDER BY via allow-list, LIKE wildcards escaped, `multipleStatements` off, ids validated as integers in the route pattern | `models/*`, `db.js` |
| Stored / reflected XSS | EJS `<%= %>` escaping everywhere (`<%-` only for `include`), strict CSP (`script-src 'self'`, no inline script/style), no user data in JS | `views/*`, `app.js` |
| CSRF | per-session token on every POST (multipart forms verified after multer) + `SameSite=Lax` cookie | `middleware/security.js` |
| Broken access control | role guards on `/account` and `/admin`; ownership checked inside SQL; proofs served only to owner/admin | `middleware/auth.js`, `utils/proofs.js` |
| Auth | bcryptjs (cost 12), generic login errors, equalised timing, session regeneration on login, login rate limit, 10+ char passwords, e-mail confirmation | `routes/auth.js` |
| Google OAuth | `state` check, server-side ID-token verification, e-mail-verified + domain check | `routes/auth.js` |
| Uploads | 3 MB cap, magic-byte check (JPG/PNG/WebP only), random names, no SVG, proofs outside `/public` | `utils/images.js` |
| Secrets | `.env` git-ignored, `.env.example` committed | `.gitignore` |
| Misc | helmet headers, open-redirect guard on `returnTo`, 404/500 pages never show stack traces, JSON body limit 20 kB | `app.js` |

Before deploying: serve over HTTPS and set `NODE_ENV=production` (secure cookies, proxy trust).

## Images

The logo and placeholders are original SVGs. To use real CSPC photos, put `campus-hero.jpg` and `campus.jpg` in `public/img/cspc/` (see the README there). Upload equipment and category photos from the admin panel.

## Project layout

```
app.js  db.js  routes/  models/  middleware/  utils/  views/  public/  database/  docs/
```

## Git workflow (Week 7)

Branch per feature (`feat/...`), Conventional Commits, pull request with review, `Assisted-by:` footer for AI-assisted commits. See `AI_LOG.md`.

## License

MIT
