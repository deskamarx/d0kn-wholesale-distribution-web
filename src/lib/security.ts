/**
 * Local-only device lock. PINs are never stored: only a random salt and the
 * SHA-256 digest of salt + PIN are kept in localStorage. WebAuthn is optional
 * and no value here is ever uploaded or transmitted.
 */

const PIN_KEY = "d0kn-lock-pin-v1";
const CREDENTIAL_KEY = "d0kn-lock-credential-v1";
const LOCAL_DATA_PREFIXES = ["d0kn-distribution-", "d0kn-lock-"] as const;

interface PinRecord {
  version: 1;
  salt: string;
  hash: string;
}

interface CredentialRecord {
  id: string;
  createdAt: string;
}

function storage(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function webCrypto(): Crypto | null {
  const candidate = typeof globalThis === "undefined" ? undefined : globalThis.crypto;
  if (!candidate || !candidate.subtle || typeof candidate.getRandomValues !== "function") return null;
  return candidate;
}

function toBase64(bytes: Uint8Array): string {
  let binary = "";
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary);
}

function fromBase64(value: string): Uint8Array {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

function readPinRecord(): PinRecord | null {
  try {
    const raw = storage()?.getItem(PIN_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<PinRecord>;
    if (typeof parsed.salt !== "string" || typeof parsed.hash !== "string") return null;
    if (!parsed.salt || !parsed.hash) return null;
    return { version: 1, salt: parsed.salt, hash: parsed.hash };
  } catch {
    return null;
  }
}

async function digestPin(pin: string, salt: Uint8Array): Promise<Uint8Array | null> {
  const crypto = webCrypto();
  if (!crypto) return null;
  const pinBytes = new TextEncoder().encode(pin);
  const joined = new Uint8Array(salt.length + pinBytes.length);
  joined.set(salt, 0);
  joined.set(pinBytes, salt.length);
  try {
    const digest = await crypto.subtle.digest("SHA-256", joined);
    return new Uint8Array(digest);
  } catch {
    return null;
  }
}

/** True when a valid salted hash exists in this browser. */
export function isLockEnabled(): boolean {
  return readPinRecord() !== null;
}

/**
 * Creates or replaces the local PIN hash. Resolves false for short/empty PINs
 * or when Web Crypto is unavailable; a plaintext fallback is never written.
 */
export async function setPin(pin: string): Promise<boolean> {
  const value = String(pin).trim();
  if (!/^\d{4,12}$/.test(value)) return false;
  const crypto = webCrypto();
  const store = storage();
  if (!crypto || !store) return false;
  try {
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const hash = await digestPin(value, salt);
    if (!hash) return false;
    const record: PinRecord = { version: 1, salt: toBase64(salt), hash: toBase64(hash) };
    store.setItem(PIN_KEY, JSON.stringify(record));
    return true;
  } catch {
    return false;
  }
}

/** Compares digests locally with a constant-time-style byte loop. */
export async function verifyPin(pin: string): Promise<boolean> {
  const record = readPinRecord();
  if (!record) return false;
  try {
    const expected = fromBase64(record.hash);
    const actual = await digestPin(String(pin).trim(), fromBase64(record.salt));
    if (!actual || actual.length !== expected.length) return false;
    let difference = 0;
    for (let index = 0; index < expected.length; index += 1) {
      difference |= actual[index] ^ expected[index];
    }
    return difference === 0;
  } catch {
    return false;
  }
}

/** Removes the PIN hash and the local WebAuthn credential reference. */
export function clearPin(): void {
  try {
    const store = storage();
    store?.removeItem(PIN_KEY);
    store?.removeItem(CREDENTIAL_KEY);
  } catch {
    // Ignore unavailable storage.
  }
}

/** Removes every local workspace key and the lock keys. Used by reset flows. */
export function clearLocalAppData(): void {
  try {
    const store = storage();
    if (!store) return;
    const keys: string[] = [];
    for (let index = 0; index < store.length; index += 1) {
      const key = store.key(index);
      if (!key) continue;
      if (LOCAL_DATA_PREFIXES.some((prefix) => key.startsWith(prefix))) keys.push(key);
    }
    keys.forEach((key) => store.removeItem(key));
  } catch {
    // Ignore unavailable storage.
  }
}

function webAuthnReady(): boolean {
  if (typeof window === "undefined" || typeof navigator === "undefined") return false;
  if (typeof PublicKeyCredential === "undefined") return false;
  if (typeof navigator.credentials?.create !== "function" || typeof navigator.credentials.get !== "function") return false;
  return window.isSecureContext !== false;
}

function relyingPartyId(): string {
  try {
    return window.location.hostname || "";
  } catch {
    return "";
  }
}

/** Gracefully reports platform authenticator support without any network call. */
export async function hasPlatformAuthenticator(): Promise<boolean> {
  try {
    if (!webAuthnReady()) return false;
    return (await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable()) === true;
  } catch {
    return false;
  }
}

/** Registers a device credential locally; resolves false when unsupported. */
export async function registerPlatformCredential(): Promise<boolean> {
  try {
    if (!(await hasPlatformAuthenticator())) return false;
    const crypto = webCrypto();
    const store = storage();
    const rpId = relyingPartyId();
    if (!crypto || !store || !rpId) return false;

    const options: PublicKeyCredentialCreationOptions = {
      challenge: crypto.getRandomValues(new Uint8Array(32)),
      rp: { name: "D0K@N Global Distribution", id: rpId },
      user: {
        id: crypto.getRandomValues(new Uint8Array(16)),
        name: "d0kn-local-unlock",
        displayName: "D0K@N local unlock",
      },
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
      attestation: "none",
    };

    const credential = (await navigator.credentials.create({ publicKey: options })) as PublicKeyCredential | null;
    if (!credential?.rawId) return false;
    const record: CredentialRecord = {
      id: toBase64(new Uint8Array(credential.rawId)),
      createdAt: new Date().toISOString(),
    };
    store.setItem(CREDENTIAL_KEY, JSON.stringify(record));
    return true;
  } catch {
    return false;
  }
}

/** Verifies a device credential locally; resolves false when unavailable. */
export async function verifyPlatformCredential(): Promise<boolean> {
  try {
    const raw = storage()?.getItem(CREDENTIAL_KEY);
    if (!raw) return false;
    const parsed = JSON.parse(raw) as Partial<CredentialRecord>;
    if (typeof parsed.id !== "string" || !parsed.id) return false;
    if (!(await hasPlatformAuthenticator())) return false;
    const crypto = webCrypto();
    const rpId = relyingPartyId();
    if (!crypto || !rpId) return false;

    const options: PublicKeyCredentialRequestOptions = {
      challenge: crypto.getRandomValues(new Uint8Array(32)),
      rpId,
      allowCredentials: [{ type: "public-key", id: fromBase64(parsed.id) }],
      userVerification: "required",
      timeout: 60000,
    };
    const credential = await navigator.credentials.get({ publicKey: options });
    return Boolean(credential);
  } catch {
    return false;
  }
}

/** True when a device credential reference has been registered locally. */
export function isDeviceUnlockEnabled(): boolean {
  try {
    const raw = storage()?.getItem(CREDENTIAL_KEY);
    if (!raw) return false;
    const parsed = JSON.parse(raw) as Partial<CredentialRecord>;
    return typeof parsed.id === "string" && parsed.id.length > 0;
  } catch {
    return false;
  }
}
