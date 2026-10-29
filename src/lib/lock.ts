const LOCK_KEY = "finance:lock";
const WEBAUTHN_USER_KEY = "finance:webauthn-user-id";
const LAST_UNLOCK_KEY = "finance:lock-last-unlock";
const PBKDF2_ITERATIONS = 100_000;

// Ventana de acceso: tras desbloquear, la app no vuelve a pedir el PIN hasta que pasen
// 5 minutos. El sello vive en localStorage y NO en memoria: por eso actualizar la página
// dentro de la ventana no lo vuelve a pedir, y pasados los 5 minutos sí. Tampoco se
// renueva sola mientras usás la app — son 5 minutos de acceso, no de inactividad.
export const LOCK_GRACE_MS = 5 * 60 * 1000;

export function getLastUnlock(): number {
  try {
    const raw = localStorage.getItem(LAST_UNLOCK_KEY);
    const n = raw ? Number(raw) : 0;
    return Number.isFinite(n) ? n : 0;
  } catch {
    return 0;
  }
}

export function markUnlocked(): void {
  try {
    localStorage.setItem(LAST_UNLOCK_KEY, String(Date.now()));
  } catch {
    // Sin localStorage (modo privado, datos bloqueados) no hay ventana de acceso: el PIN
    // se vuelve a pedir en cada recarga. Molesto, no inseguro.
  }
}

export interface LockConfig {
  pinHash?: string;
  credentialId?: number[];
}

/** Qué corresponde mostrar al entrar: nada, el PIN, o el alta de PIN. */
export type LockGate = "open" | "pin" | "setup";

// El bloqueo no es opcional: sin PIN guardado la app pide crear uno antes de mostrar
// nada. Tener o no `pinHash` es la única verdad — las versiones viejas guardaban además
// un `enabled`, que ya no se lee (un config viejo con el lock apagado no tiene pinHash,
// así que cae en "setup", que es exactamente lo que corresponde).
export function lockGate(): LockGate {
  if (!getLockConfig().pinHash) return "setup";
  return Date.now() - getLastUnlock() > LOCK_GRACE_MS ? "pin" : "open";
}

export function getLockConfig(): LockConfig {
  try {
    const raw = localStorage.getItem(LOCK_KEY);
    return raw ? (JSON.parse(raw) as LockConfig) : {};
  } catch {
    return {};
  }
}

export function saveLockConfig(cfg: LockConfig): void {
  try {
    localStorage.setItem(LOCK_KEY, JSON.stringify(cfg));
  } catch {
    // Sin localStorage el PIN no se puede guardar: `lockGate` seguirá devolviendo "setup".
  }
}

// Olvidar el lock por completo, incluido el sello de acceso: lo usa "Olvidé mi PIN",
// que además cierra la sesión. Dejar el sello haría que el próximo que entre aproveche
// los minutos que le quedaban al anterior.
export function clearLockConfig(): void {
  try {
    localStorage.removeItem(LOCK_KEY);
    localStorage.removeItem(LAST_UNLOCK_KEY);
  } catch {
    // Sin localStorage no hay nada que borrar.
  }
}

export async function isBiometricAvailable(): Promise<boolean> {
  if (!window.PublicKeyCredential) return false;
  try {
    return await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
  } catch { return false; }
}

function getStableWebAuthnUserId(): Uint8Array {
  try {
    const raw = localStorage.getItem(WEBAUTHN_USER_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as unknown;
      if (Array.isArray(parsed) && parsed.length === 16) return new Uint8Array(parsed as number[]);
    }
  } catch {
    // Valor guardado ilegible: se genera uno nuevo abajo.
  }
  const fresh = crypto.getRandomValues(new Uint8Array(16));
  try {
    localStorage.setItem(WEBAUTHN_USER_KEY, JSON.stringify(Array.from(fresh)));
  } catch {
    // Sin localStorage el id no persiste y la huella registrada no se reconocerá la próxima vez.
  }
  return fresh;
}

export async function registerBiometric(): Promise<number[]> {
  const challenge = crypto.getRandomValues(new Uint8Array(new ArrayBuffer(32)));
  const userId = getStableWebAuthnUserId();
  const cred = await navigator.credentials.create({
    publicKey: {
      challenge: challenge as unknown as BufferSource,
      rp: { name: "Finance App", id: window.location.hostname },
      user: { id: userId as unknown as BufferSource, name: "finance-user", displayName: "Finance App" },
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
  }) as PublicKeyCredential;
  return Array.from(new Uint8Array(cred.rawId));
}

export async function verifyBiometric(credentialId: number[]): Promise<void> {
  const challenge = crypto.getRandomValues(new Uint8Array(new ArrayBuffer(32)));
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

// ── PIN hashing ────────────────────────────────────────────────────────────
// v2 format: "v2:" + base64url(salt) + ":" + base64url(derivedBits)

function bytesToBase64Url(bytes: Uint8Array): string {
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function base64UrlToBytes(str: string): Uint8Array {
  const padded = str.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((str.length + 3) % 4);
  const bin = atob(padded);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function pbkdf2(pin: string, salt: Uint8Array): Promise<Uint8Array> {
  const baseKey = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(pin),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt: salt as unknown as BufferSource, iterations: PBKDF2_ITERATIONS, hash: "SHA-256" },
    baseKey,
    256,
  );
  return new Uint8Array(bits);
}

async function legacyHashV1(pin: string): Promise<string> {
  const buf = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode("finance-lock-v1:" + pin),
  );
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function hashPin(pin: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(new ArrayBuffer(16)));
  const bits = await pbkdf2(pin, salt);
  return `v2:${bytesToBase64Url(salt)}:${bytesToBase64Url(bits)}`;
}

/** Guarda un PIN nuevo conservando la huella registrada: cambiarlo no la borra. */
export async function savePin(pin: string): Promise<void> {
  const cfg = getLockConfig();
  saveLockConfig({ ...cfg, pinHash: await hashPin(pin) });
}

function timingSafeEqualBytes(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

export async function checkPin(pin: string, storedHash: string | null | undefined): Promise<boolean> {
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
  return (await legacyHashV1(pin)) === storedHash;
}
