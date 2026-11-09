# Caliber — Watch Intelligence for Collectors

Snap a photo of any watch and Caliber identifies it, pulls the full specs and market
value, and helps you catalog your collection. Thinking of buying? Vet a listing for
fakes, "franken" parts, and prices that are too good to be true — before you pay.

Built with Next.js 16, React 19, Prisma + SQLite, and the OpenAI Responses API
(vision plus live web-search grounding).

## Features

- **Identify** — upload a photo → structured spec sheet (brand, model, reference,
  caliber, case, value) with a confidence badge. Specs are grounded against real web
  sources, not guessed.
- **Collection** — save watches to a searchable, filterable catalog (owned / wishlist /
  watching). Track condition, purchase price, notes.
- **Vet a Buy** — upload a seller's photo + listing text → authenticity findings by
  severity (red / yellow / green), a verdict, and a fair-price range.
- **Valuation history** — every AI estimate is stored per watch over time.
- **Add manually** (`/add`) — no AI, no cost; optional photo.
- **Possible duplicates** (`/duplicates`) — same photo or same reference from the same maker;
  keep one record and the others are merged into it (photos, documents, values, service history).

## Setup

```bash
npm install
npm run db:push           # safely creates the local SQLite database
npm run dev               # http://localhost:3000
```

### Enabling real AI (recommended)

AI analysis stays safely paused until you add a key. The rest of the collection app remains
available, but Caliber never pairs a real photo with unrelated sample data. The easiest setup:

1. Start the app and open the **Settings** page (in the top nav).
2. Paste your OpenAI API key (get one at
   https://platform.openai.com/api-keys) and click **Save & go live**.

That's it — recognition, re-analysis, and vetting immediately switch on. The key is shown
masked and, when a deployment encryption or login secret is configured, encrypted at
rest in the local database. Remove it anytime to pause AI features again.

Prefer environment config? Set `OPENAI_API_KEY` in `.env` and restart. This is safer
than storing the key in SQLite.
The environment variable takes precedence over a key saved in Settings.

## Deploying to Railway

Railway wipes the container disk on every redeploy, so the database and uploaded
files must live on a **persistent volume**. Setup (one time):

1. **Create the project** — push this repo to GitHub and create a Railway project
   from it (or `railway up`). Railway auto-detects Next.js and uses `railway.json`.
2. **Add a volume** — in the service settings, add a Volume mounted at **`/app/data`**.
3. **Set environment variables** on the service (all paths ABSOLUTE, on the volume):
   ```
   DATABASE_URL = file:/app/data/caliber.db
   UPLOAD_DIR   = /app/data/uploads
   BACKUP_DIR   = /app/data/backups     # automatic DB backups (see below)
   DB_VOLUME_DIR = /app/data            # recommended: refuse to boot if any of the above is off-volume
   OPENAI_API_KEY = sk-...              # optional; can also be set in-app
   OPENAI_MODEL = gpt-5.6-luna          # cost-efficient vision default
   CALIBER_AUTH_USER = caliber          # production login
   CALIBER_AUTH_SECRET = use-a-long-random-password      # the initial login password
   CALIBER_SESSION_SECRET = long-random-value            # recommended: signs sessions + upload links
   CALIBER_KEY_ENCRYPTION_SECRET = optional-separate-stable-secret
   ```
   Generate long random values with `node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"`.
   Adding `CALIBER_SESSION_SECRET` to an existing deployment signs everyone out once
   (old cookies were signed with `CALIBER_AUTH_SECRET`); after that it stays put.
   Do **not** add `CALIBER_KEY_ENCRYPTION_SECRET` to an existing deployment that already
   saved an OpenAI key in Settings: that key was encrypted with `CALIBER_AUTH_SECRET` and
   would stop decrypting (re-enter the key in Settings afterwards if you do).
4. **Deploy.** The very first boot has no database and no backups, which production
   treats as a lost volume and refuses to start. For a deliberate first install, set
   `CALIBER_ALLOW_EMPTY_DB=1` for that one deploy, then **remove it**. On boot,
   `npm start` runs the path guard, auto-restore and a verified backup, then
   `prisma db push` (creating the SQLite schema on the volume) and starts Next.js.
   Railway provides `PORT` automatically.

That's it. The database and all photos/documents now persist across deploys.

**Notes**
- Uploaded files are served through `/api/uploads/[name]` (reading from `UPLOAD_DIR`),
  so they work the same locally and in production.
- Keep to a **single instance** — SQLite is single-writer. When you outgrow that
  (multi-user, multiple replicas), switch the Prisma datasource to PostgreSQL
  (Railway has a one-click Postgres) and set `DATABASE_URL` to its connection string.
- Export a backup anytime from **Settings → Backup & export**. **Download full backup (with
  photos)** is a ZIP of the data plus every photo and document; **Restore from backup** accepts
  that ZIP (or a data-only JSON) and puts the files back under their original names, never
  overwriting files already on the server and skipping watches already in the collection.

## Data protection & backups

The collection database is protected from code changes by **automatic backups**:

- A snapshot of the SQLite database is taken **before every server start**
  (`npm run dev` and `npm start`) and **before every schema push** (`npm run db:push`).
  Snapshots use SQLite's `VACUUM INTO` (consistent even while the app is running) and
  must pass `PRAGMA integrity_check`. A failed backup stops `npm run db:push` and
  `npm run backup` before the database is touched. At startup it does not take the app
  down: Caliber keeps a raw, unverified copy (`caliber-<time>-raw.db`, never restored
  automatically), logs `[backup] WARNING boot backup failed (…); raw copy …; serving anyway`,
  and starts.
- Backups are stored **outside the project folder** (`~/.caliber/backups` locally,
  or `BACKUP_DIR` — point it at the persistent volume on Railway), so
  `git clean`, checkouts, and reinstalls can't touch them. A start never deletes a
  backup, and skips its own backup when a verified one is less than 10 minutes old
  (`BACKUP_MIN_INTERVAL_MINUTES`), so a crash loop of restarts cannot churn out copies
  or rotate good ones away. `npm run backup` and `npm run db:push` always back up and
  rotate, but keep at least the newest 14 (`BACKUP_KEEP`, 1–1000), every backup younger
  than 7 days (`BACKUP_PRUNE_MIN_AGE_DAYS`) and the oldest backup of each of the last 7
  days. Run `npm run backup` now and then (or on a schedule) to rotate old ones.
- If the database file is **missing** at startup, the newest backup that passes the
  integrity check is restored automatically. In production, if there is no usable
  backup (or the restore fails), startup is **blocked** instead of creating an empty
  collection — see `CALIBER_ALLOW_EMPTY_DB` above for a genuine first install.
- **Restore** at any time:
  ```bash
  npm run restore              # list available backups
  npm run restore -- latest    # roll back to the newest one
  ```
  A restore saves the current database first (as a `-pre-restore` backup),
  so restoring can never lose data either.

Rules that keep the data safe when changing code:

- **Always use `npm run db:push`** for schema changes (never raw
  `prisma db push`) — it backs up first. If Prisma warns a change would
  destroy data, **do not** add `--accept-data-loss`; redesign the change
  (add a new column instead of renaming, etc.).
- Never run `prisma migrate reset` or `db push --force-reset` — these wipe
  the database by design.
- The database and uploads are gitignored; git operations never touch them —
  but note that photos/documents in `uploads/` are **not** in the automatic DB backups.
  The in-app **full backup ZIP** (Settings) includes them; take one regularly and keep it
  off the server.

## How it works

- `lib/ai.ts` — the recognition + vetting engine. Calls OpenAI with the photo, enables
  the web-search tool to confirm reference numbers and market value, and returns
  validated structured data. AI routes fail safely when no key is set.
- `lib/prisma.ts` / `prisma/schema.prisma` — the `Watch` + `Valuation` data model.
- `app/api/*` — route handlers for identify, vet, and watch CRUD.
- `app/*` — the dashboard, identify, collection, watch-detail, and vet pages.

## Security and operations

- Production refuses to start serving private pages without `CALIBER_AUTH_SECRET`.
- `/api/health` (Railway's health check) runs `SELECT 1` against the database and
  returns 503 if it does not answer; it reveals nothing else.
- Changing the password in Settings signs out every other device (the device that made the
  change stays signed in). Sessions from before this feature stay valid until the first change.
- The CSV export prefixes a `'` to text cells that start with `= + - @`, tab or CR so
  spreadsheets show them as text instead of running them as formulas.
- Photos and documents require the deployment login. Photos are served `private, max-age=31536000,
  immutable` (file names never change) with on-demand thumbnails (`?w=320|640|960`, cached in
  `UPLOAD_DIR/thumbs`); documents stay `private, no-store`. Short-lived signed links (the Lens
  pre-check, and documents opened from the installed iPhone app) work without a session.
- Images are limited to 10 MB and documents to 20 MB by default. File signatures and
  image decodability are verified before storage.
- AI prompts limit research to four web searches. Sources returned by OpenAI are shown
  as clickable links rather than trusting model-generated URLs.
- What goes to OpenAI: the photo being identified, re-analyzed or vetted, any clue or listing
  text typed with it, and for chat the messages plus that watch's details (including condition
  and notes). Every Responses API call sets `store: false`, asking OpenAI not to store the
  response; the OpenAI account's own data controls still apply.
- The monthly AI budget is a local estimated-spend guard and requests are rate-limited.
  Configure a project budget in the OpenAI Platform as the authoritative billing limit.
- Vetting images are processed without permanent storage. Unreferenced uploads are
  never deleted automatically: `npm run uploads:cleanup` (or `CLEANUP_UPLOADS_ON_START=1`
  at boot) MOVES ones older than 24 hours to `UPLOAD_DIR/.orphans/<date>/`, and refuses to
  move anything after a restore, with an empty database, or when more than 20 files / 10 %
  of the uploads would move (`CLEANUP_UPLOADS_MAX_FILES`, `CLEANUP_UPLOADS_MAX_PERCENT`;
  `CLEANUP_UPLOADS_DRY_RUN=1` only logs).
- Run `npm run check` before deployment. GitHub Actions runs lint, type-check, tests,
  build, dependency audit, and CodeQL automatically.
- For multiple replicas, move rate limiting to Redis, uploads to private S3/R2 with
  signed URLs, and SQLite to PostgreSQL. The current adapters remain intentionally
  local and single-instance so Caliber does not require extra paid services.

## Tech notes

- Uploaded files are saved in `UPLOAD_DIR` and served through an authenticated route.
- The deployment uses a branded Caliber login backed by a signed, HTTP-only session cookie and is
  designed for one trusted user or household. `CALIBER_AUTH_SECRET` supplies the initial password;
  sessions are signed with `CALIBER_SESSION_SECRET` when set (falling back to `CALIBER_AUTH_SECRET`);
  an authenticated user can replace it from Settings. The replacement is stored as a salted
  one-way hash. Legacy HTTP Basic credentials are deliberately ignored so a browser cannot replay
  cached credentials after sign-out. Add per-user database ownership before turning Caliber into
  a public SaaS.
- Value estimates are guidance, not appraisals. Always verify high-value pieces with
  papers, service history, and an in-person inspection.
