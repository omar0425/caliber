# Caliber — Watch Intelligence for Collectors

Snap a photo of any watch and Caliber identifies it, pulls the full specs and market
value, and helps you catalog your collection. Thinking of buying? Vet a listing for
fakes, "franken" parts, and prices that are too good to be true — before you pay.

Built with Next.js 16, React 19, Prisma + SQLite, and the Anthropic Claude API (vision
+ live web-search grounding).

## Features

- **Identify** — upload a photo → structured spec sheet (brand, model, reference,
  caliber, case, value) with a confidence badge. Specs are grounded against real web
  sources, not guessed.
- **Collection** — save watches to a searchable, filterable catalog (owned / wishlist /
  watching). Track condition, purchase price, notes.
- **Vet a Buy** — upload a seller's photo + listing text → authenticity findings by
  severity (red / yellow / green), a verdict, and a fair-price range.
- **Valuation history** — every AI estimate is stored per watch over time.

## Setup

```bash
npm install
npx prisma db push        # creates the local SQLite database
npm run dev               # http://localhost:3000
```

### Enabling real AI (recommended)

The app runs in **demo mode** with mock results until you add a key. The easiest way:

1. Start the app and open the **Settings** page (in the top nav).
2. Paste your Anthropic API key (get one at
   https://console.anthropic.com/settings/keys) and click **Save & go live**.

That's it — recognition and vetting immediately switch to real AI. The key is stored in
your local database and shown masked; remove it anytime to return to demo mode.

Prefer environment config? You can instead set `ANTHROPIC_API_KEY` in `.env` and restart.
A key saved in Settings takes precedence over the environment variable.

## Deploying to Railway

Railway wipes the container disk on every redeploy, so the database and uploaded
files must live on a **persistent volume**. Setup (one time):

1. **Create the project** — push this repo to GitHub and create a Railway project
   from it (or `railway up`). Railway auto-detects Next.js and uses `railway.json`.
2. **Add a volume** — in the service settings, add a Volume mounted at **`/data`**.
3. **Set environment variables** on the service:
   ```
   DATABASE_URL = file:/data/caliber.db
   UPLOAD_DIR   = /data/uploads
   BACKUP_DIR   = /data/backups          # automatic DB backups (see below)
   ANTHROPIC_API_KEY = sk-ant-...        # optional; can also be set in-app
   ```
4. **Deploy.** On boot, `npm start` runs `prisma db push` (creating the SQLite
   schema on the volume) and then starts Next.js. Railway provides `PORT`
   automatically.

That's it. The database and all photos/documents now persist across deploys.

**Notes**
- Uploaded files are served through `/api/uploads/[name]` (reading from `UPLOAD_DIR`),
  so they work the same locally and in production.
- Keep to a **single instance** — SQLite is single-writer. When you outgrow that
  (multi-user, multiple replicas), switch the Prisma datasource to PostgreSQL
  (Railway has a one-click Postgres) and set `DATABASE_URL` to its connection string.
- Export a backup anytime from **Settings → Backup & export**.

## Data protection & backups

The collection database is protected from code changes by **automatic backups**:

- A snapshot of the SQLite database is taken **before every server start**
  (`npm run dev` and `npm start`) and **before every schema push** (`npm run db:push`).
- Backups are stored **outside the project folder** (`~/.caliber/backups` locally,
  or `BACKUP_DIR` — point it at the persistent volume on Railway), so
  `git clean`, checkouts, and reinstalls can't touch them. The newest 14 are kept.
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
  but note that photos/documents in `uploads/` are **not** in the DB backups.
  Copy that folder (or the Railway volume) separately once in a while.

## How it works

- `lib/ai.ts` — the recognition + vetting engine. Calls Claude with the photo, enables
  the web-search tool to confirm reference numbers and market value, and returns
  validated structured data. Falls back to mock data when no key is set.
- `lib/prisma.ts` / `prisma/schema.prisma` — the `Watch` + `Valuation` data model.
- `app/api/*` — route handlers for identify, vet, and watch CRUD.
- `app/*` — the dashboard, identify, collection, watch-detail, and vet pages.

## Tech notes

- Uploaded images are saved to `public/uploads` and referenced by URL.
- Single-user by design for now. The data model and API are structured so a `userId`
  and auth layer can drop in later to make it multi-user.
- Value estimates are guidance, not appraisals. Always verify high-value pieces with
  papers, service history, and an in-person inspection.
