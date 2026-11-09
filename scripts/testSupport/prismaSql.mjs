// Test support only: run SQL against a scratch SQLite file through
// @prisma/client, for Node versions without node:sqlite (Node 20).
// Reads {"file": "...", "ops": [{"kind": "exec"|"query", "sql": "...", "params": []}]}
// on stdin and prints the query results as JSON on stdout.
import { createRequire } from "node:module";

const { PrismaClient } = createRequire(import.meta.url)("@prisma/client");

let input = "";
for await (const chunk of process.stdin) input += chunk;
const { file, ops } = JSON.parse(input);

const db = new PrismaClient({ datasources: { db: { url: `file:${file.replace(/\\/g, "/")}` } }, log: [] });
const results = [];
try {
  for (const op of ops) {
    if (op.kind === "query") results.push(await db.$queryRawUnsafe(op.sql, ...(op.params ?? [])));
    else results.push(await db.$executeRawUnsafe(op.sql, ...(op.params ?? [])));
  }
} finally {
  await db.$disconnect();
}
process.stdout.write(JSON.stringify(results, (_, value) => (typeof value === "bigint" ? Number(value) : value)));
