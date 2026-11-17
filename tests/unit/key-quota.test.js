// Per-API-key quota & token limit enforcement unit tests.
import { describe, it, expect, vi, beforeEach } from "vitest";

const fx = vi.hoisted(() => ({
  combos: [
    { id: "c1", name: "Main", models: ["openai/model-a"] },
  ],
  nodes: [],
  aliases: {},
  keys: {},
}));

vi.mock("@/lib/localDb", () => ({
  getModelAliases: async () => fx.aliases,
  getComboByName: async (name) => fx.combos.find((c) => c.name === name) || null,
  getProviderNodes: async () => fx.nodes,
}));
vi.mock("@/lib/db/repos/combosRepo.js", () => ({ getCombos: async () => fx.combos }));
vi.mock("@/lib/db/repos/apiKeysRepo.js", () => ({ getApiKeyByKey: async (k) => fx.keys[k] || null }));
vi.mock("@/sse/utils/logger.js", () => ({ warn: vi.fn(), info: vi.fn(), debug: vi.fn(), error: vi.fn() }));

const engine = await import("../../src/sse/services/keyAccess.js");
const { KEY_QUOTA_EXCEEDED_MESSAGE } = await import("../../src/shared/constants/keyAccess.js");

function setKey(id, { access = { restricted: false, allow: [] }, maxTokens = null, usedTokens = 0 } = {}) {
  fx.keys[`sk-${id}`] = {
    id,
    name: `key-${id}`,
    isActive: true,
    access,
    maxTokens,
    usedTokens,
  };
}

const req = (k) => {
  const headers = k ? { Authorization: `Bearer ${k}` } : {};
  return new Request("http://localhost/v1/chat/completions", { method: "POST", headers });
};

describe("key quota and token limits", () => {
  beforeEach(() => {
    fx.keys = {};
    setKey("unlimited", { maxTokens: null, usedTokens: 50000 });
    setKey("under-quota", { maxTokens: 1000, usedTokens: 500 });
    setKey("at-quota", { maxTokens: 1000, usedTokens: 1000 });
    setKey("over-quota", { maxTokens: 1000, usedTokens: 1200 });
    setKey("restricted-and-capped", {
      access: { restricted: true, allow: ["openai/model-a"] },
      maxTokens: 500,
      usedTokens: 600,
    });
    setKey("restricted-ok", {
      access: { restricted: true, allow: ["openai/model-a"] },
      maxTokens: 500,
      usedTokens: 100,
    });
  });

  it("returns null context when key has no restrictions and no token limit", async () => {
    setKey("plain", { access: { restricted: false, allow: [] }, maxTokens: null });
    const ctx = await engine.getKeyAccessContext(req("sk-plain"));
    expect(ctx).toBeNull();
  });

  it("returns context when key has token limit, even if models are unrestricted", async () => {
    const ctx = await engine.getKeyAccessContext(req("sk-under-quota"));
    expect(ctx).not.toBeNull();
    expect(ctx.isRestricted).toBe(false);
    expect(ctx.maxTokens).toBe(1000);
    expect(ctx.usedTokens).toBe(500);
  });

  it("enforceKeyQuota allows requests when under quota or unlimited", async () => {
    const ctxUnlimited = await engine.getKeyAccessContext(req("sk-unlimited"));
    expect(engine.enforceKeyQuota(ctxUnlimited)).toBeNull();

    const ctxUnder = await engine.getKeyAccessContext(req("sk-under-quota"));
    expect(engine.enforceKeyQuota(ctxUnder)).toBeNull();
  });

  it("enforceKeyQuota blocks requests with 429 when at or over quota", async () => {
    const ctxAt = await engine.getKeyAccessContext(req("sk-at-quota"));
    const resAt = engine.enforceKeyQuota(ctxAt);
    expect(resAt).not.toBeNull();
    expect(resAt.status).toBe(429);
    const bodyAt = await resAt.json();
    expect(bodyAt.error.message).toBe(KEY_QUOTA_EXCEEDED_MESSAGE);
    expect(bodyAt.error.type).toBe("insufficient_quota");
    expect(bodyAt.error.code).toBe("token_limit_exceeded");

    const ctxOver = await engine.getKeyAccessContext(req("sk-over-quota"));
    const resOver = engine.enforceKeyQuota(ctxOver);
    expect(resOver.status).toBe(429);
  });

  it("enforceKeyAccess gates on quota before checking model access", async () => {
    const ctxOver = await engine.getKeyAccessContext(req("sk-restricted-and-capped"));
    const res = await engine.enforceKeyAccess(ctxOver, "openai/model-a");
    expect(res).not.toBeNull();
    expect(res.status).toBe(429);
  });

  it("enforceKeyAccess allows allowed model when within quota", async () => {
    const ctxOk = await engine.getKeyAccessContext(req("sk-restricted-ok"));
    const res = await engine.enforceKeyAccess(ctxOk, "openai/model-a");
    expect(res).toBeNull();
  });

  it("enforceKeyAccessResolved blocks when quota exceeded", async () => {
    const ctxOver = await engine.getKeyAccessContext(req("sk-over-quota"));
    const res = await engine.enforceKeyAccessResolved(ctxOver, "openai/model-a", "openai", "model-a");
    expect(res).not.toBeNull();
    expect(res.status).toBe(429);
  });

  it("enforceKeyAccessProvider blocks when quota exceeded", async () => {
    const ctxOver = await engine.getKeyAccessContext(req("sk-over-quota"));
    const res = await engine.enforceKeyAccessProvider(ctxOver, "tavily", null);
    expect(res).not.toBeNull();
    expect(res.status).toBe(429);
  });
});
