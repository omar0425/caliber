import { afterEach, describe, expect, it, vi } from "vitest";

const stored = vi.hoisted(() => ({ value: null as string | null }));

vi.mock("./prisma", () => ({
  prisma: {
    setting: {
      findUnique: vi.fn(async () =>
        stored.value ? { key: "auth_password_hash", value: stored.value } : null
      ),
      upsert: vi.fn(async ({ create, update }: {
        create: { value: string };
        update: { value: string };
      }) => {
        stored.value = stored.value ? update.value : create.value;
      }),
    },
  },
}));

import {
  changeLoginPassword,
  createPasswordHash,
  verifyLoginCredentials,
  verifyPasswordHash,
} from "./password";

afterEach(() => {
  stored.value = null;
  delete process.env.CALIBER_AUTH_USER;
  delete process.env.CALIBER_AUTH_SECRET;
});

describe("login password storage", () => {
  it("creates a salted scrypt hash and verifies exact passwords", async () => {
    const hash = await createPasswordHash("new-correct-horse-password");

    expect(hash).toMatch(/^scrypt:v1:/);
    expect(hash).not.toContain("new-correct-horse-password");
    expect(await verifyPasswordHash("new-correct-horse-password", hash)).toBe(true);
    expect(await verifyPasswordHash("wrong-password", hash)).toBe(false);
  });

  it("replaces the deployment password after verifying the current password", async () => {
    process.env.CALIBER_AUTH_USER = "omar";
    process.env.CALIBER_AUTH_SECRET = "deployment-password";

    expect(await changeLoginPassword("wrong-password", "new-correct-horse-password")).toBe(false);
    expect(await changeLoginPassword("deployment-password", "new-correct-horse-password")).toBe(true);
    expect(stored.value).toMatch(/^scrypt:v1:/);
    expect(await verifyLoginCredentials("omar", "deployment-password")).toBe(false);
    expect(await verifyLoginCredentials("omar", "new-correct-horse-password")).toBe(true);
    expect(await verifyLoginCredentials("someone-else", "new-correct-horse-password")).toBe(false);
  });
});
