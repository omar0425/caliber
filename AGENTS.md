<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Database safety — READ BEFORE ANY SCHEMA OR DATA CHANGE

The local SQLite DB (`prisma/dev.db`, or `DATABASE_URL` in production) holds a
real watch collection. It must survive every code change.

- Use `npm run db:push` for schema changes — NEVER raw `prisma db push`.
  The npm script backs up the database first (scripts/backup.mjs → ~/.caliber/backups
  or BACKUP_DIR).
- NEVER use `--accept-data-loss`, `--force-reset`, or `prisma migrate reset`.
  If Prisma refuses a push because it would destroy data, redesign the change
  (additive columns, copy-then-drop in separate steps) — do not force it.
- Schema changes must be ADDITIVE where possible. Don't rename or drop columns
  that hold user data without an explicit migration plan agreed with the user.
- Before risky operations, run `npm run backup`. To roll back: `npm run restore -- latest`.
- Never `git clean -fdx` in this repo without checking: uploads/ and prisma/*.db
  are gitignored and would be deleted (backups live outside the repo and survive).
- Test-data seeding scripts must only DELETE rows they created (filter on
  brand "Test" or the specific ids) — never `deleteMany({})` on user tables.

# Deployment safety — lessons from a real data-loss incident (July 2026)

The production collection was once destroyed by a redeploy because
`DATABASE_URL` was a RELATIVE path (`file:./data/caliber.db`). Prisma resolves
relative SQLite paths against `prisma/`, so the database landed on the
container's ephemeral disk instead of the mounted volume, and Railway wiped it.
These rules exist so that can never happen again:

- Production (Railway) requires ABSOLUTE paths on the mounted volume:
  `DATABASE_URL=file:/app/data/caliber.db`, `BACKUP_DIR=/app/data/backups`,
  `UPLOAD_DIR=/app/data/uploads`. Never suggest or set a relative
  `file:` path for production, and never point these at a path outside the
  volume mount.
- Three protection scripts run in the boot sequence, in this order:
  `check-db-path.mjs` (refuses to boot if the DB would be on ephemeral disk) →
  `auto-restore.mjs` (restores the newest backup if the DB file is missing) →
  `backup.mjs` (snapshot before start). NEVER remove, reorder, bypass, or
  weaken them in package.json scripts, and never "fix" a blocked boot by
  deleting the guard — fix the configuration it is complaining about.
- Every merge to master triggers a Railway redeploy and a brief restart.
  Data on the volume survives; anything outside it does not. Do not write
  runtime state anywhere except the volume paths above.
- Before advising any Railway/env/volume change, remember: the app coming up
  "healthy" with an empty database is a FAILURE state, not a fresh start.
  If the collection looks empty in production, stop and investigate backups
  (`npm run restore` lists them) before any deploy, push, or schema change.
- The user's off-platform safety net is the JSON export (Settings → Backup &
  export). When completing significant data work, remind the user to export.
