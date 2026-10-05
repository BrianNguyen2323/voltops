import crypto from "crypto";
import { env } from "~/env";

function getKey(): Buffer {
  return Buffer.from(env.VOLTOPS_SECRET_KEY, "hex");
}

export function encrypt(plaintext: string): { ciphertext: string; iv: string } {
  const key = getKey();
  const iv = crypto.randomBytes(12); // 96-bit IV for AES-256-GCM
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);

  const encrypted = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();

  // Append auth tag to ciphertext so we can verify integrity on decrypt
  return {
    ciphertext: Buffer.concat([encrypted, authTag]).toString("hex"),
    iv: iv.toString("hex"),
  };
}

export function decrypt(ciphertext: string, iv: string): string {
  const key = getKey();
  const data = Buffer.from(ciphertext, "hex");
  const ivBuffer = Buffer.from(iv, "hex");

  // Last 16 bytes are the GCM auth tag
  const authTag = data.subarray(-16);
  const encrypted = data.subarray(0, -16);

  const decipher = crypto.createDecipheriv("aes-256-gcm", key, ivBuffer);
  decipher.setAuthTag(authTag);

  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString(
    "utf8",
  );
}
