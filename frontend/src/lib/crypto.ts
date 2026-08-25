import CryptoJS from "crypto-js";

const bytesToHex = (wa: CryptoJS.lib.WordArray) => wa.toString(CryptoJS.enc.Hex);

// Default for NEW mobile registrations - lower iterations for Expo Go/RN Hermes JS
// engine, otherwise PBKDF2 blocks the JS thread for 10-30s.
// Existing users hashed with 150k (from the original HTML app) are still supported
// via the `iters` field stored in the user record.
export const DEFAULT_ITERATIONS = 5000;
export const LEGACY_ITERATIONS = 150000;

export function randomHex(bytes: number): string {
  return CryptoJS.lib.WordArray.random(bytes).toString(CryptoJS.enc.Hex);
}

export function derive(password: string, saltHex: string, iterations: number = DEFAULT_ITERATIONS): string {
  const salt = CryptoJS.enc.Hex.parse(saltHex);
  const key = CryptoJS.PBKDF2(password, salt, {
    keySize: 256 / 32,
    iterations,
    hasher: CryptoJS.algo.SHA256,
  });
  return bytesToHex(key);
}

export function slug(s: string): string {
  return String(s || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
}
