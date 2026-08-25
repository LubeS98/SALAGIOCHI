import CryptoJS from "crypto-js";

const bytesToHex = (wa: CryptoJS.lib.WordArray) => wa.toString(CryptoJS.enc.Hex);

export function randomHex(bytes: number): string {
  return CryptoJS.lib.WordArray.random(bytes).toString(CryptoJS.enc.Hex);
}

// PBKDF2 with SHA-256, 150000 iterations - MATCHES original HTML file impl
export function derive(password: string, saltHex: string, iterations = 150000): string {
  const salt = CryptoJS.enc.Hex.parse(saltHex);
  const key = CryptoJS.PBKDF2(password, salt, {
    keySize: 256 / 32, // 256 bits = 8 words
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
