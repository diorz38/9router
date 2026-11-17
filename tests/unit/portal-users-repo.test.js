import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

let tempDir;
let db;

beforeEach(async () => {
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "9router-portal-users-"));
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

describe("Portal Users Repository & Key Association", () => {
  it("auto-generates username and password when creating a user", async () => {
    const user = await db.createPortalUser({ name: "Acme Client" });

    expect(user).toBeDefined();
    expect(user.id).toBeDefined();
    expect(user.username).toMatch(/^acmeclient_[a-f0-9]{6}$/);
    expect(user.rawPassword).toBeDefined();
    expect(user.rawPassword.length).toBe(14);
    expect(user.name).toBe("Acme Client");
    expect(user.isActive).toBe(true);

    // Verify password check
    const fetched = await db.getPortalUserByUsername(user.username, true);
    expect(fetched.passwordHash).toBeDefined();
    expect(await db.verifyPassword(user.rawPassword, fetched.passwordHash)).toBe(true);
    expect(await db.verifyPassword("wrong-password", fetched.passwordHash)).toBe(false);
  });

  it("creates a user with custom username and verifies uniqueness", async () => {
    const user = await db.createPortalUser({ username: "custom_user", password: "SecretPassword123!" });
    expect(user.username).toBe("custom_user");

    await expect(db.createPortalUser({ username: "custom_user" })).rejects.toThrow(/already taken/);
  });

  it("links multiple API keys to a single portal user", async () => {
    const user = await db.createPortalUser({ name: "Multi Key User" });

    const key1 = await db.createApiKey("Claude Code Key", "machine-1", {
      userId: user.id,
      maxTokens: 100000,
      access: { restricted: true, allow: ["anthropic/claude-3-7-sonnet"] },
    });

    const key2 = await db.createApiKey("Cursor Key", "machine-1", {
      userId: user.id,
      maxTokens: 200000,
    });

    expect(key1.userId).toBe(user.id);
    expect(key2.userId).toBe(user.id);

    // Query keys for this user
    const userKeys = await db.getApiKeysByUserId(user.id);
    expect(userKeys.length).toBe(2);
    expect(userKeys.map((k) => k.id)).toContain(key1.id);
    expect(userKeys.map((k) => k.id)).toContain(key2.id);
  });

  it("unlinks keys when user is deleted", async () => {
    const user = await db.createPortalUser({ name: "Delete Test" });
    const key = await db.createApiKey("Temporary Key", "machine-1", { userId: user.id });

    expect((await db.getApiKeyById(key.id)).userId).toBe(user.id);

    await db.deletePortalUser(user.id);

    expect(await db.getPortalUserById(user.id)).toBeNull();
    const updatedKey = await db.getApiKeyById(key.id);
    expect(updatedKey).toBeDefined();
    expect(updatedKey.userId).toBeNull();
  });
});
