const LOCK_KEY = "finance:lock";
const WEBAUTHN_USER_KEY = "finance:webauthn-user-id";
const PBKDF2_ITERATIONS = 100_000;

export function getLockConfig() {
  try {
    const raw = localStorage.getItem(LOCK_KEY);
    return raw ? JSON.parse(raw) : { enabled: false };
  } catch {
    return { enabled: false };
  }
}

export function saveLockConfig(cfg) {
  try { localStorage.setItem(LOCK_KEY, JSON.stringify(cfg)); } catch {}
}

export function clearLockConfig() {
  try { localStorage.removeItem(LOCK_KEY); } catch {}
}

export async function isBiometricAvailable() {
  if (!window.PublicKeyCredential) return false;
  try {
    return await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
  } catch { return false; }
}

// Returns a stable WebAuthn user.id (16 random bytes), persisted in
// localStorage. Stable id prevents accumulating ghost credentials in the
// platform authenticator each time the user re-registers biometric.
function getStableWebAuthnUserId() {
  try {
    const raw = localStorage.getItem(WEBAUTHN_USER_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length === 16) return new Uint8Array(parsed);
    }
  } catch {}
  const fresh = crypto.getRandomValues(new Uint8Array(16));
  try { localStorage.setItem(WEBAUTHN_USER_KEY, JSON.stringify(Array.from(fresh))); } catch {}
  return fresh;
}

export async function registerBiometric() {
  const challenge = crypto.getRandomValues(new Uint8Array(32));
  const userId = getStableWebAuthnUserId();
  const cred = await navigator.credentials.create({
    publicKey: {
      challenge,
      rp: { name: "Finance App", id: window.location.hostname },
      user: { id: userId, name: "finance-user", displayName: "Finance App" },
      pubKeyCredParams: [
        { type: "public-key", alg: -7 },
        { type: "public-key", alg: -257 },
      ],
      authenticatorSelection: {
        authenticatorAttachment: "platform",
        userVerification: "required",
        residentKey: "preferred",
      },
      timeout: 60000,
    },
  });
  return Array.from(new Uint8Array(cred.rawId));
}

export async function verifyBiometric(credentialId) {
  const challenge = crypto.getRandomValues(new Uint8Array(32));
  await navigator.credentials.get({
    publicKey: {
      challenge,
      rpId: window.location.hostname,
      allowCredentials: [{ type: "public-key", id: new Uint8Array(credentialId) }],
      userVerification: "required",
      timeout: 60000,
    },
  });
}

// ─── PIN hashing ──────────────────────────────────────────────────────────
// v2 format: "v2:" + base64url(salt) + ":" + base64url(derivedBits)
// Uses PBKDF2-SHA256 with 100k iterations.
// v1 (legacy): plain 64-char hex SHA-256 of "finance-lock-v1:" + pin.
// checkPin handles both; hashPin always writes v2.

function bytesToBase64Url(bytes) {
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function base64UrlToBytes(str) {
  const padded = str.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((str.length + 3) % 4);
  const bin = atob(padded);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function pbkdf2(pin, salt) {
  const baseKey = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(pin),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt, iterations: PBKDF2_ITERATIONS, hash: "SHA-256" },
    baseKey,
    256,
  );
  return new Uint8Array(bits);
}

async function legacyHashV1(pin) {
  const buf = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode("finance-lock-v1:" + pin),
  );
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export async function hashPin(pin) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const bits = await pbkdf2(pin, salt);
  return `v2:${bytesToBase64Url(salt)}:${bytesToBase64Url(bits)}`;
}

function timingSafeEqualBytes(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

export async function checkPin(pin, storedHash) {
  if (!storedHash || typeof storedHash !== "string") return false;
  if (storedHash.startsWith("v2:")) {
    const parts = storedHash.split(":");
    if (parts.length !== 3) return false;
    try {
      const salt = base64UrlToBytes(parts[1]);
      const expected = base64UrlToBytes(parts[2]);
      const actual = await pbkdf2(pin, salt);
      return timingSafeEqualBytes(expected, actual);
    } catch { return false; }
  }
  // Legacy v1: plain SHA-256 hex
  return (await legacyHashV1(pin)) === storedHash;
}
