import crypto from "node:crypto";
import { prisma } from "./prisma";
import { verifyCredentials, verifyUsername } from "./auth";

const PASSWORD_HASH_SETTING = "auth_password_hash";
const HASH_PREFIX = "scrypt:v1";
const KEY_LENGTH = 32;

function derivePassword(password: string, salt: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    crypto.scrypt(password, salt, KEY_LENGTH, (error, derived) => {
      if (error) reject(error);
      else resolve(derived);
    });
  });
}

export async function createPasswordHash(password: string): Promise<string> {
  const salt = crypto.randomBytes(16);
  const derived = await derivePassword(password, salt);
  return `${HASH_PREFIX}:${salt.toString("base64url")}:${derived.toString("base64url")}`;
}

export async function verifyPasswordHash(password: string, stored: string): Promise<boolean> {
  const [algorithm, version, saltValue, hashValue, extra] = stored.split(":");
  if (
    algorithm !== "scrypt" ||
    version !== "v1" ||
    !saltValue ||
    !hashValue ||
    extra
  ) {
    return false;
  }

  try {
    const salt = Buffer.from(saltValue, "base64url");
    const expected = Buffer.from(hashValue, "base64url");
    if (salt.length !== 16 || expected.length !== KEY_LENGTH) return false;
    const supplied = await derivePassword(password, salt);
    return crypto.timingSafeEqual(supplied, expected);
  } catch {
    return false;
  }
}

async function storedPasswordHash(): Promise<string | null> {
  const row = await prisma.setting.findUnique({ where: { key: PASSWORD_HASH_SETTING } });
  return row?.value ?? null;
}

export async function verifyLoginCredentials(user: string, password: string): Promise<boolean> {
  const stored = await storedPasswordHash();
  if (!stored) return verifyCredentials(user, password);
  return verifyUsername(user) && verifyPasswordHash(password, stored);
}

export async function changeLoginPassword(
  currentPassword: string,
  newPassword: string
): Promise<boolean> {
  const user = process.env.CALIBER_AUTH_USER?.trim() || "caliber";
  if (!(await verifyLoginCredentials(user, currentPassword))) return false;

  const value = await createPasswordHash(newPassword);
  await prisma.setting.upsert({
    where: { key: PASSWORD_HASH_SETTING },
    create: { key: PASSWORD_HASH_SETTING, value },
    update: { value },
  });
  return true;
}
