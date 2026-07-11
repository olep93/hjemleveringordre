import { createHmac, scryptSync, timingSafeEqual, randomBytes } from "crypto";
import { cookies } from "next/headers";
import { adminDb } from "@/lib/firebase/admin";

export type UserRole = "GUEST" | "EMPLOYEE" | "MANAGER" | "ADMIN";

export type SessionUser = {
  id: string;
  username: string;
  displayName: string;
  role: UserRole;
};

const COOKIE_NAME = "hjemlevering_session";
const SESSION_DAYS = 7;
const GUEST_ID = "guest";

function sessionSecret(): string {
  return (
    process.env.SESSION_SECRET ||
    process.env.RESEND_WEBHOOK_SECRET ||
    "development-only-secret-change-me"
  );
}

function b64url(value: string | Buffer): string {
  return Buffer.from(value)
    .toString("base64")
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replaceAll("=", "");
}

function fromB64url(value: string): string {
  const normalized = value.replaceAll("-", "+").replaceAll("_", "/");
  return Buffer.from(normalized, "base64").toString("utf8");
}

function sign(payload: string): string {
  return b64url(createHmac("sha256", sessionSecret()).update(payload).digest());
}

export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [salt, hashHex] = stored.split(":");
  if (!salt || !hashHex) return false;
  const actual = scryptSync(password, salt, 64);
  const expected = Buffer.from(hashHex, "hex");
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export async function ensureBootstrapData(): Promise<void> {
  const adminRef = adminDb.collection("users").doc("admin");
  const adminSnap = await adminRef.get();

  if (!adminSnap.exists) {
    await adminRef.set({
      username: "Admin",
      usernameLower: "admin",
      displayName: "Admin",
      role: "ADMIN",
      passwordHash: hashPassword("midlertidigpassord"),
      active: true,
      mustChangePassword: false,
      createdAt: new Date().toISOString()
    });
  }

  const notificationRef = adminDb
    .collection("notificationRecipients")
    .doc("ole-kristiansen-coop-no");
  const notificationSnap = await notificationRef.get();

  if (!notificationSnap.exists) {
    await notificationRef.set({
      email: "ole.kristiansen@coop.no",
      active: true,
      createdAt: new Date().toISOString()
    });
  }
}

export async function createSession(user: SessionUser): Promise<void> {
  const expiresAt = Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000;
  const payload = b64url(JSON.stringify({ ...user, expiresAt }));
  const token = `${payload}.${sign(payload)}`;

  const store = await cookies();
  store.set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_DAYS * 24 * 60 * 60
  });
}

export async function createGuestSession(): Promise<void> {
  await createSession({
    id: GUEST_ID,
    username: "Gjest",
    displayName: "Gjest",
    role: "GUEST"
  });
}

export async function clearSession(): Promise<void> {
  const store = await cookies();
  store.delete(COOKIE_NAME);
}

export async function getSessionUser(): Promise<SessionUser | null> {
  const store = await cookies();
  const token = store.get(COOKIE_NAME)?.value;
  if (!token) return null;

  const [payload, signature] = token.split(".");
  if (!payload || !signature) return null;

  const expected = sign(payload);
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;

  try {
    const decoded = JSON.parse(fromB64url(payload)) as SessionUser & {
      expiresAt: number;
    };
    if (decoded.expiresAt < Date.now()) return null;

    if (decoded.id === GUEST_ID && decoded.role === "GUEST") {
      return {
        id: GUEST_ID,
        username: "Gjest",
        displayName: "Gjest",
        role: "GUEST"
      };
    }

    const userSnap = await adminDb.collection("users").doc(decoded.id).get();
    if (!userSnap.exists || userSnap.data()?.active === false) return null;

    return {
      id: decoded.id,
      username: decoded.username,
      displayName: decoded.displayName,
      role: decoded.role
    };
  } catch {
    return null;
  }
}

export async function requireUser(): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) throw new Error("UNAUTHORIZED");
  return user;
}

export async function requireRole(roles: UserRole[]): Promise<SessionUser> {
  const user = await requireUser();
  if (!roles.includes(user.role)) throw new Error("FORBIDDEN");
  return user;
}
