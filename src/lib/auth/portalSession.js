import { SignJWT, jwtVerify } from "jose";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { DATA_DIR } from "@/lib/dataDir";
import { shouldUseSecureCookie } from "./dashboardSession";

export const PORTAL_COOKIE_NAME = "portal_auth_token";
const SESSION_MAX_AGE_SEC = 7 * 24 * 60 * 60; // 7 days session for portal users

function loadJwtSecret() {
  if (process.env.JWT_SECRET) return process.env.JWT_SECRET;
  const file = path.join(DATA_DIR, "jwt-secret");
  try {
    return fs.readFileSync(file, "utf8").trim();
  } catch {}
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const generated = crypto.randomBytes(32).toString("hex");
  fs.writeFileSync(file, generated, { mode: 0o600 });
  return generated;
}

const SECRET = new TextEncoder().encode(loadJwtSecret());

export async function createPortalAuthToken(user) {
  if (!user || !user.id || !user.username) {
    throw new Error("Invalid user for portal token");
  }
  return new SignJWT({
    role: "portal_user",
    userId: user.id,
    username: user.username,
    name: user.name || null,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("7d")
    .sign(SECRET);
}

export async function verifyPortalAuthToken(token) {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, SECRET);
    if (payload.role !== "portal_user" || !payload.userId) {
      return null;
    }
    return payload;
  } catch {
    return null;
  }
}

export async function getPortalSessionFromRequest(request) {
  // Read token from Authorization header or cookies
  let token = null;
  const authHeader = request.headers.get("authorization");
  if (authHeader?.startsWith("Bearer ")) {
    token = authHeader.slice(7).trim();
  } else {
    // Read from cookies in header
    const cookieHeader = request.headers.get("cookie") || "";
    const match = cookieHeader.match(new RegExp(`(?:^|;\\s*)${PORTAL_COOKIE_NAME}=([^;]+)`));
    if (match) token = match[1];
  }
  return verifyPortalAuthToken(token);
}

export async function setPortalAuthCookie(cookieStore, request, user) {
  const token = await createPortalAuthToken(user);
  cookieStore.set(PORTAL_COOKIE_NAME, token, {
    httpOnly: true,
    secure: shouldUseSecureCookie(request),
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_MAX_AGE_SEC,
  });
  return token;
}

export function clearPortalAuthCookie(cookieStore) {
  cookieStore.set(PORTAL_COOKIE_NAME, "", {
    httpOnly: true,
    secure: false,
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
}
