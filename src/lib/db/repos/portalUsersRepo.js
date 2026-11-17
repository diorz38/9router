import crypto from "crypto";
import bcrypt from "bcryptjs";
import { v4 as uuidv4 } from "uuid";
import { getAdapter } from "../driver.js";

function rowToUser(row, includePassword = false) {
  if (!row) return null;
  const user = {
    id: row.id,
    username: row.username,
    name: row.name || null,
    isActive: row.isActive === 1 || row.isActive === true,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
  if (includePassword) {
    user.passwordHash = row.passwordHash;
  }
  return user;
}

/**
 * Generates a cryptographically random, clean, readable username like "user_k9m2x7".
 */
export function generateRandomUsername(basePrefix = "user") {
  const cleanPrefix = String(basePrefix || "user")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "")
    .slice(0, 12);
  const prefix = cleanPrefix ? cleanPrefix : "user";
  const suffix = crypto.randomBytes(4).toString("hex").slice(0, 6);
  return `${prefix}_${suffix}`;
}

/**
 * Generates an entropy-rich random password suitable for one-click copying.
 */
export function generateRandomPassword(length = 14) {
  // Use URL-safe characters avoiding ambiguous characters like 0/O, 1/l/I
  const chars = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789!@#%&*+-=";
  const bytes = crypto.randomBytes(length);
  let result = "";
  for (let i = 0; i < length; i++) {
    result += chars[bytes[i] % chars.length];
  }
  return result;
}

export async function hashPassword(plainPassword) {
  return bcrypt.hash(plainPassword, 10);
}

export async function verifyPassword(plainPassword, hash) {
  if (!plainPassword || !hash) return false;
  return bcrypt.compare(plainPassword, hash);
}

/**
 * Finds a unique username in portalUsers.
 */
export async function generateUniqueUsername(preferredPrefix = "user") {
  const db = await getAdapter();
  for (let attempt = 0; attempt < 10; attempt++) {
    const candidate = generateRandomUsername(preferredPrefix);
    const existing = db.get("SELECT id FROM portalUsers WHERE username = ?", [candidate]);
    if (!existing) return candidate;
  }
  // Fallback to timestamp suffix
  return `user_${Date.now().toString(36)}`;
}

/**
 * Creates a new portalUser.
 * If username or password is omitted, they are auto-generated.
 * Returns the user object with `rawPassword` (only available on creation).
 */
export async function createPortalUser(params = {}) {
  const db = await getAdapter();
  const rawUsername = params.username ? String(params.username).trim().toLowerCase() : await generateUniqueUsername(params.name || "user");
  const rawPassword = params.password || generateRandomPassword(14);
  const name = params.name ? String(params.name).trim() : null;

  // Check unique username
  const existing = db.get("SELECT id FROM portalUsers WHERE username = ?", [rawUsername]);
  if (existing) {
    throw new Error(`Username "${rawUsername}" is already taken`);
  }

  const passwordHash = await hashPassword(rawPassword);
  const now = new Date().toISOString();
  const user = {
    id: uuidv4(),
    username: rawUsername,
    name,
    isActive: params.isActive !== false,
    createdAt: now,
    updatedAt: now,
  };

  db.run(
    `INSERT INTO portalUsers (id, username, passwordHash, name, isActive, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [user.id, user.username, passwordHash, user.name, user.isActive ? 1 : 0, user.createdAt, user.updatedAt]
  );

  return {
    ...user,
    rawPassword, // Expose raw password only once at creation for admin to deliver to client
  };
}

export async function getPortalUserById(id, includePassword = false) {
  if (!id) return null;
  const db = await getAdapter();
  const row = db.get("SELECT * FROM portalUsers WHERE id = ?", [id]);
  return rowToUser(row, includePassword);
}

export async function getPortalUserByUsername(username, includePassword = false) {
  if (!username) return null;
  const db = await getAdapter();
  const row = db.get("SELECT * FROM portalUsers WHERE username = ?", [String(username).trim().toLowerCase()]);
  return rowToUser(row, includePassword);
}

export async function listPortalUsers() {
  const db = await getAdapter();
  const rows = db.all("SELECT id, username, name, isActive, createdAt, updatedAt FROM portalUsers ORDER BY createdAt DESC");
  return rows.map((r) => rowToUser(r, false));
}

export async function updatePortalUser(id, data = {}) {
  const db = await getAdapter();
  const row = db.get("SELECT * FROM portalUsers WHERE id = ?", [id]);
  if (!row) return null;

  const now = new Date().toISOString();
  let passwordHash = row.passwordHash;
  if (data.password) {
    passwordHash = await hashPassword(data.password);
  }

  const name = data.name !== undefined ? (data.name ? String(data.name).trim() : null) : row.name;
  const isActive = data.isActive !== undefined ? (data.isActive ? 1 : 0) : row.isActive;

  db.run(
    `UPDATE portalUsers SET passwordHash = ?, name = ?, isActive = ?, updatedAt = ? WHERE id = ?`,
    [passwordHash, name, isActive, now, id]
  );

  return getPortalUserById(id);
}

export async function deletePortalUser(id) {
  if (!id) return false;
  const db = await getAdapter();
  let deleted = false;
  db.transaction(() => {
    // Unlink any associated API keys so they aren't orphaned or cause foreign key issues
    db.run("UPDATE apiKeys SET userId = NULL WHERE userId = ?", [id]);
    const res = db.run("DELETE FROM portalUsers WHERE id = ?", [id]);
    deleted = (res?.changes ?? 0) > 0;
  });
  return deleted;
}
