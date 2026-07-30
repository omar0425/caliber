import { prisma } from "./prisma";
import { protectSecret, revealSecret, secretProtectionEnabled } from "./secretStorage";
import { recordFailure } from "./errorLog";

const API_KEY_SETTING = "openai_api_key";

// Environment secrets are preferred in production. The database option exists
// for the small, self-hosted single-user deployment.
export async function getApiKey(): Promise<string | null> {
  const env = process.env.OPENAI_API_KEY?.trim();
  if (env) return env;
  const row = await prisma.setting.findUnique({ where: { key: API_KEY_SETTING } });
  const stored = row?.value?.trim();
  if (stored) {
    try {
      const revealed = revealSecret(stored).trim();
      if (revealed && revealed === stored && secretProtectionEnabled()) {
        // Transparently upgrade legacy plaintext values after a deployment
        // secret is configured.
        await prisma.setting.update({
          where: { key: API_KEY_SETTING },
          data: { value: protectSecret(revealed) },
        });
      }
      return revealed || null;
    } catch (error) {
      await recordFailure("lib/settings:decrypt", error, { level: "warn" });
    }
  }
  return null;
}

export async function setApiKey(key: string): Promise<void> {
  const value = protectSecret(key.trim());
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
  if (process.env.OPENAI_API_KEY?.trim()) return "env";
  if (await getApiKey()) return "app";
  return "none";
}

export function isStoredKeyEncrypted(): boolean {
  return secretProtectionEnabled();
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
