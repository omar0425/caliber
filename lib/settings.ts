import { prisma } from "./prisma";

const API_KEY_SETTING = "anthropic_api_key";

// Resolve the Anthropic API key: a key saved in the app (Settings page) wins,
// otherwise fall back to the ANTHROPIC_API_KEY environment variable.
export async function getApiKey(): Promise<string | null> {
  const row = await prisma.setting.findUnique({ where: { key: API_KEY_SETTING } });
  const stored = row?.value?.trim();
  if (stored) return stored;
  const env = process.env.ANTHROPIC_API_KEY?.trim();
  return env || null;
}

export async function setApiKey(key: string): Promise<void> {
  const value = key.trim();
  await prisma.setting.upsert({
    where: { key: API_KEY_SETTING },
    create: { key: API_KEY_SETTING, value },
    update: { value },
  });
}

export async function clearApiKey(): Promise<void> {
  await prisma.setting.deleteMany({ where: { key: API_KEY_SETTING } });
}

// Whether the key came from the app database vs. the environment.
export async function getKeySource(): Promise<"app" | "env" | "none"> {
  const row = await prisma.setting.findUnique({ where: { key: API_KEY_SETTING } });
  if (row?.value?.trim()) return "app";
  if (process.env.ANTHROPIC_API_KEY?.trim()) return "env";
  return "none";
}

const BUDGET_SETTING = "monthly_budget_usd";

export async function getBudget(): Promise<number | null> {
  const row = await prisma.setting.findUnique({ where: { key: BUDGET_SETTING } });
  const n = row ? Number(row.value) : NaN;
  return Number.isFinite(n) && n > 0 ? n : null;
}

export async function setBudget(amount: number | null): Promise<void> {
  if (!amount || amount <= 0) {
    await prisma.setting.deleteMany({ where: { key: BUDGET_SETTING } });
    return;
  }
  await prisma.setting.upsert({
    where: { key: BUDGET_SETTING },
    create: { key: BUDGET_SETTING, value: String(amount) },
    update: { value: String(amount) },
  });
}

// Never expose the full key to the client — show only the last 4 chars.
export function maskKey(key: string): string {
  const k = key.trim();
  if (k.length <= 6) return "••••";
  return `${"•".repeat(6)}${k.slice(-4)}`;
}
