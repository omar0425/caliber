import crypto from "node:crypto";

const PREFIX = "encrypted:v1";

function deploymentSecret(): string | null {
  return (
    process.env.CALIBER_KEY_ENCRYPTION_SECRET?.trim() ||
    process.env.CALIBER_AUTH_SECRET?.trim() ||
    null
  );
}

function keyFrom(secret: string): Buffer {
  return crypto
    .createHash("sha256")
    .update("caliber-openai-key-v1\0")
    .update(secret)
    .digest();
}

export function encryptSecret(value: string, secret: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", keyFrom(secret), iv);
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [PREFIX, iv.toString("base64url"), tag.toString("base64url"), encrypted.toString("base64url")].join(":");
}

export function decryptSecret(value: string, secret: string): string {
  if (!value.startsWith(`${PREFIX}:`)) return value;
  const [, , ivValue, tagValue, encryptedValue] = value.split(":");
  if (!ivValue || !tagValue || !encryptedValue) throw new Error("Encrypted setting is malformed.");
  const decipher = crypto.createDecipheriv(
    "aes-256-gcm",
    keyFrom(secret),
    Buffer.from(ivValue, "base64url")
  );
  decipher.setAuthTag(Buffer.from(tagValue, "base64url"));
  return Buffer.concat([
    decipher.update(Buffer.from(encryptedValue, "base64url")),
    decipher.final(),
  ]).toString("utf8");
}

export function protectSecret(value: string): string {
  const secret = deploymentSecret();
  return secret ? encryptSecret(value, secret) : value;
}

export function revealSecret(value: string): string {
  if (!value.startsWith(`${PREFIX}:`)) return value;
  const secret = deploymentSecret();
  if (!secret) {
    throw new Error(
      "The saved OpenAI key is encrypted, but CALIBER_KEY_ENCRYPTION_SECRET or CALIBER_AUTH_SECRET is unavailable."
    );
  }
  return decryptSecret(value, secret);
}

export function secretProtectionEnabled(): boolean {
  return deploymentSecret() !== null;
}
