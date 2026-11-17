import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

let tempDir;
let db;

beforeEach(async () => {
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "9router-keys-repo-"));
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

describe("API Keys Repo with access control and maxTokens quota", () => {
  it("creates key with access restrictions and maxTokens limit", async () => {
    const key = await db.createApiKey("Test Key", "machine-1", {
      access: { restricted: true, allow: ["openai/gpt-4o", "Main"] },
      maxTokens: 50000,
    });

    expect(key).toBeDefined();
    expect(key.name).toBe("Test Key");
    expect(key.access.restricted).toBe(true);
    expect(key.access.allow).toEqual(["openai/gpt-4o", "Main"]);
    expect(key.maxTokens).toBe(50000);
    expect(key.usedTokens).toBe(0);

    const fetched = await db.getApiKeyById(key.id);
    expect(fetched.access.restricted).toBe(true);
    expect(fetched.access.allow).toEqual(["openai/gpt-4o", "Main"]);
    expect(fetched.maxTokens).toBe(50000);
    expect(fetched.usedTokens).toBe(0);
  });

  it("increments usedTokens on saveRequestUsage", async () => {
    const key = await db.createApiKey("Usage Key", "machine-2", {
      maxTokens: 10000,
    });

    await db.saveRequestUsage({
      provider: "openai",
      model: "gpt-4",
      connectionId: "c1",
      apiKey: key.key,
      tokens: { prompt_tokens: 150, completion_tokens: 50 },
      endpoint: "/v1/chat",
      status: "ok",
    });

    const updated = await db.getApiKeyById(key.id);
    expect(updated.usedTokens).toBe(200);

    // Increment again
    await db.saveRequestUsage({
      provider: "openai",
      model: "gpt-4",
      connectionId: "c1",
      apiKey: key.key,
      tokens: { prompt_tokens: 100, completion_tokens: 100 },
      endpoint: "/v1/chat",
      status: "ok",
    });

    const updated2 = await db.getApiKeyById(key.id);
    expect(updated2.usedTokens).toBe(400);
  });

  it("updates quota and resets usage", async () => {
    const key = await db.createApiKey("Reset Key", "machine-3", {
      maxTokens: 5000,
    });

    await db.incrementApiKeyTokens(key.key, 3500);
    let current = await db.getApiKeyById(key.id);
    expect(current.usedTokens).toBe(3500);

    // Update quota
    await db.updateApiKey(key.id, { maxTokens: 15000 });
    current = await db.getApiKeyById(key.id);
    expect(current.maxTokens).toBe(15000);
    expect(current.usedTokens).toBe(3500);

    // Reset usage
    await db.resetApiKeyUsage(key.id);
    current = await db.getApiKeyById(key.id);
    expect(current.usedTokens).toBe(0);
    expect(current.maxTokens).toBe(15000);
  });
});
