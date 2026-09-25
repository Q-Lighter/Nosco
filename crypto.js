// crypto.js — password-based encryption using the browser's native WebCrypto API.
// No external libraries. Everything here runs locally, offline, on-device.

const PBKDF2_ITERATIONS = 250000; // deliberately slow — resists brute-force guessing
const enc = new TextEncoder();
const dec = new TextDecoder();

function bufToBase64(buf) {
  return btoa(String.fromCharCode(...new Uint8Array(buf)));
}

function base64ToBuf(b64) {
  const bin = atob(b64);
  const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  return arr.buffer;
}

/** Generate a fresh random salt for a brand-new vault (first run only). */
export function generateSalt() {
  return crypto.getRandomValues(new Uint8Array(16));
}

/** Derive an AES-GCM key from a password + salt. Same password + salt always gives the same key. */
export async function deriveKey(password, saltBytes) {
  const baseKey = await crypto.subtle.importKey(
    'raw', enc.encode(password), { name: 'PBKDF2' }, false, ['deriveKey']
  );
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: saltBytes, iterations: PBKDF2_ITERATIONS, hash: 'SHA-256' },
    baseKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

/** Encrypt a JS object. Returns a plain object safe to store in IndexedDB (base64 strings). */
export async function encryptData(key, dataObj) {
  const iv = crypto.getRandomValues(new Uint8Array(12)); // fresh IV every save
  const plaintext = enc.encode(JSON.stringify(dataObj));
  const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, plaintext);
  return { iv: bufToBase64(iv), ciphertext: bufToBase64(ciphertext) };
}

/**
 * Decrypt a stored record back into a JS object.
 * Throws if the password/key was wrong — AES-GCM refuses to decrypt with a mismatched key,
 * so a wrong password fails here rather than needing a separate "check password" step to bypass.
 */
export async function decryptData(key, record) {
  const iv = new Uint8Array(base64ToBuf(record.iv));
  const ciphertext = base64ToBuf(record.ciphertext);
  const plaintext = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ciphertext);
  return JSON.parse(dec.decode(plaintext));
}

export function saltToBase64(saltBytes) { return bufToBase64(saltBytes); }
export function saltFromBase64(b64) { return new Uint8Array(base64ToBuf(b64)); }
