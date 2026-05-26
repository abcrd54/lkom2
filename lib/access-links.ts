import { createHash, randomBytes } from "node:crypto";
import { encryptSecret, decryptSecret } from "@/lib/secrets";

const ACCESS_ROUTE_PREFIX = "/u/";

export function generateAccessToken() {
  return randomBytes(24).toString("base64url");
}

export function hashAccessToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export function encryptAccessToken(token: string) {
  return encryptSecret(token);
}

export function decryptAccessToken(payload: string) {
  return decryptSecret(payload);
}

export function buildAccessPath(token: string) {
  return `${ACCESS_ROUTE_PREFIX}${token}`;
}

export function buildAbsoluteAccessLink(origin: string, token: string) {
  return new URL(buildAccessPath(token), origin).toString();
}
