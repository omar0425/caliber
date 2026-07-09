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
