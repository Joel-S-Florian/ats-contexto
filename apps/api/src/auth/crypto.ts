import { createHash, randomBytes } from "node:crypto";
import argon2 from "argon2";

export const hashPassword = (plain: string) => argon2.hash(plain, { type: argon2.argon2id });
export const verifyPassword = (hash: string, plain: string) => argon2.verify(hash, plain).catch(() => false);

/** Token opaco para sesiones, invitaciones y recuperacion: al cliente va el token, a la BD solo su hash. */
export const newToken = () => randomBytes(32).toString("base64url");
export const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");

// Hash precalculado para igualar el tiempo de respuesta cuando el correo no existe.
export const DUMMY_HASH = await hashPassword("no-existe");
