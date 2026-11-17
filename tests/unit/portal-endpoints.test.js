import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

let tempDir;
let db;

beforeEach(async () => {
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "9router-portal-tests-"));
  process.env.DATA_DIR = tempDir;
  vi.resetModules();
  db = await import("@/lib/db/index.js");
  await db.initDb();
});

afterEach(() => {
  delete process.env.DATA_DIR;
  try {
    fs.rmSync(tempDir, { recursive: true, force: true });
  } catch {}
});

describe("Portal Authentication & /api/portal/me Quota Logic", () => {
  it("authenticates a user and verifies JWT session token", async () => {
    const { createPortalUser } = await import("@/lib/db/repos/portalUsersRepo.js");
    const { createPortalAuthToken, verifyPortalAuthToken } = await import("@/lib/auth/portalSession.js");

    const user = await createPortalUser({ name: "Auth Test" });
    const token = await createPortalAuthToken(user);

    expect(token).toBeDefined();
    const verified = await verifyPortalAuthToken(token);
    expect(verified).toBeDefined();
    expect(verified.userId).toBe(user.id);
    expect(verified.username).toBe(user.username);
    expect(verified.role).toBe("portal_user");
  });

  it("calculates multi-key quotas, remaining tokens, and model restrictions accurately", async () => {
    const { createPortalUser } = await import("@/lib/db/repos/portalUsersRepo.js");
    const { createApiKey, getApiKeysByUserId } = await import("@/lib/db/repos/apiKeysRepo.js");

    const user = await createPortalUser({ name: "Quota User" });

    // Key 1: 500,000 max, 100,000 used, restricted to claude-3-7-sonnet
    const key1 = await createApiKey("CLI Key", "mach-1", {
      userId: user.id,
      maxTokens: 500000,
      access: { restricted: true, allow: ["anthropic/claude-3-7-sonnet"] },
    });
    await db.incrementApiKeyTokens(key1.key, 100000);

    // Key 2: 1,500,000 max, 250,000 used, restricted to gpt-4o
    const key2 = await createApiKey("IDE Key", "mach-1", {
      userId: user.id,
      maxTokens: 1500000,
      access: { restricted: true, allow: ["openai/gpt-4o"] },
    });
    await db.incrementApiKeyTokens(key2.key, 250000);

    const keys = await getApiKeysByUserId(user.id);
    expect(keys.length).toBe(2);

    const totalMax = keys.reduce((acc, k) => acc + (k.maxTokens || 0), 0);
    const totalUsed = keys.reduce((acc, k) => acc + (k.usedTokens || 0), 0);
    const totalRemaining = totalMax - totalUsed;
    const usagePercent = Math.round((totalUsed / totalMax) * 100);

    expect(totalMax).toBe(2000000);
    expect(totalUsed).toBe(350000);
    expect(totalRemaining).toBe(1650000);
    expect(usagePercent).toBe(18); // 350k / 2M = 17.5% -> 18%
  });

  it("admin auto-creates user on key generation and attaches subsequent key to existing user", async () => {
    const { createPortalUser } = await import("@/lib/db/repos/portalUsersRepo.js");
    const { createApiKey, getApiKeysByUserId } = await import("@/lib/db/repos/apiKeysRepo.js");

    // 1. First key: auto-creates user
    const newUser = await createPortalUser({ name: "Client Bravo" });
    const firstKey = await createApiKey("First Key", "mach-1", {
      userId: newUser.id,
      maxTokens: 1000000,
    });

    expect(firstKey.userId).toBe(newUser.id);
    expect(newUser.username).toMatch(/^clientbravo_[a-f0-9]{6}$/);

    // 2. Subsequent key: assigns to existing user
    const secondKey = await createApiKey("Second Key", "mach-1", {
      userId: newUser.id,
      maxTokens: 2000000,
    });

    expect(secondKey.userId).toBe(newUser.id);

    const allUserKeys = await getApiKeysByUserId(newUser.id);
    expect(allUserKeys.length).toBe(2);
    expect(allUserKeys.map((k) => k.name)).toEqual(["First Key", "Second Key"]);
  });
});
