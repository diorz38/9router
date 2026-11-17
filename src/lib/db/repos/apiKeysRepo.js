import { v4 as uuidv4 } from "uuid";
import { getAdapter } from "../driver.js";
import { keyAccessFromColumns, keyAccessToColumns } from "@/shared/utils/keyAccess.js";
import { KEY_ACCESS_UNRESTRICTED } from "@/shared/constants/keyAccess.js";

function rowToKey(row) {
  if (!row) return null;
  return {
    id: row.id,
    key: row.key,
    name: row.name,
    machineId: row.machineId,
    isActive: row.isActive === 1 || row.isActive === true,
    createdAt: row.createdAt,
    access: keyAccessFromColumns(row.accessRestricted, row.accessAllow),
    maxTokens: row.maxTokens !== undefined && row.maxTokens !== null ? Number(row.maxTokens) : null,
    usedTokens: row.usedTokens !== undefined && row.usedTokens !== null ? Number(row.usedTokens) : 0,
  };
}

export async function getApiKeys() {
  const db = await getAdapter();
  const rows = db.all(`SELECT * FROM apiKeys ORDER BY createdAt ASC`);
  return rows.map(rowToKey);
}

export async function getApiKeyById(id) {
  const db = await getAdapter();
  const row = db.get(`SELECT * FROM apiKeys WHERE id = ?`, [id]);
  return rowToKey(row);
}

// Used by the /v1 handlers to read the presented key's access settings.
export async function getApiKeyByKey(key) {
  if (!key) return null;
  const db = await getAdapter();
  const row = db.get(`SELECT * FROM apiKeys WHERE key = ?`, [key]);
  return rowToKey(row);
}

export async function createApiKey(name, machineId, options = {}) {
  if (!machineId) throw new Error("machineId is required");
  const db = await getAdapter();
  const { generateApiKeyWithMachine } = await import("@/shared/utils/apiKey");
  const result = generateApiKeyWithMachine(machineId);
  const maxTokens = typeof options.maxTokens === "number" && options.maxTokens > 0 ? Math.floor(options.maxTokens) : null;
  const access = options.access || { restricted: false, allow: [] };
  const apiKey = {
    id: uuidv4(),
    name,
    key: result.key,
    machineId,
    isActive: true,
    createdAt: new Date().toISOString(),
    access,
    maxTokens,
    usedTokens: 0,
  };
  const cols = keyAccessToColumns(access || KEY_ACCESS_UNRESTRICTED);
  db.run(
    `INSERT INTO apiKeys(id, key, name, machineId, isActive, createdAt, accessRestricted, accessAllow, maxTokens, usedTokens) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [apiKey.id, apiKey.key, apiKey.name, apiKey.machineId, 1, apiKey.createdAt, cols.accessRestricted, cols.accessAllow, maxTokens, 0]
  );
  return apiKey;
}

export async function updateApiKey(id, data) {
  const db = await getAdapter();
  let result = null;
  db.transaction(() => {
    const row = db.get(`SELECT * FROM apiKeys WHERE id = ?`, [id]);
    if (!row) return;
    const current = rowToKey(row);
    const merged = { ...current, ...data };
    const cols = keyAccessToColumns(merged.access);
    const maxTokens = merged.maxTokens !== undefined && merged.maxTokens !== null && Number(merged.maxTokens) > 0
      ? Math.floor(Number(merged.maxTokens))
      : null;
    const usedTokens = merged.usedTokens !== undefined && merged.usedTokens !== null
      ? Math.max(0, Math.floor(Number(merged.usedTokens)))
      : 0;
    db.run(
      `UPDATE apiKeys SET key = ?, name = ?, machineId = ?, isActive = ?, accessRestricted = ?, accessAllow = ?, maxTokens = ?, usedTokens = ? WHERE id = ?`,
      [
        merged.key,
        merged.name,
        merged.machineId,
        merged.isActive ? 1 : 0,
        cols.accessRestricted,
        cols.accessAllow,
        maxTokens,
        usedTokens,
        id,
      ]
    );
    result = rowToKey(db.get(`SELECT * FROM apiKeys WHERE id = ?`, [id]));
  });
  return result;
}

export async function incrementApiKeyTokens(key, tokens) {
  if (!key || typeof tokens !== "number" || tokens <= 0) return;
  const db = await getAdapter();
  db.run(`UPDATE apiKeys SET usedTokens = COALESCE(usedTokens, 0) + ? WHERE key = ?`, [Math.floor(tokens), key]);
}

export async function resetApiKeyUsage(id) {
  const db = await getAdapter();
  db.run(`UPDATE apiKeys SET usedTokens = 0 WHERE id = ?`, [id]);
  return getApiKeyById(id);
}

export async function deleteApiKey(id) {
  const db = await getAdapter();
  const res = db.run(`DELETE FROM apiKeys WHERE id = ?`, [id]);
  return (res?.changes ?? 0) > 0;
}

export async function validateApiKey(key) {
  const db = await getAdapter();
  const row = db.get(`SELECT isActive FROM apiKeys WHERE key = ?`, [key]);
  if (!row) return false;
  return row.isActive === 1 || row.isActive === true;
}
