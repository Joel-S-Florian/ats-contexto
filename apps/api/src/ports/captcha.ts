export interface CaptchaVerifier {
  verify(token: string, ip?: string): Promise<boolean>;
}

/** Cloudflare Turnstile. */
export function turnstileVerifier(secret: string): CaptchaVerifier {
  return {
    async verify(token, ip) {
      const body = new URLSearchParams({
        secret,
        response: token,
        ...(ip ? { remoteip: ip } : {}),
      });
      try {
        const res = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
          method: "POST",
          body,
        });
        return ((await res.json()) as { success?: boolean }).success === true;
      } catch {
        return false; // falla cerrado
      }
    },
  };
}

/** Solo desarrollo y pruebas: acepta el token fijo "dev-ok". El arranque exige turnstile en produccion. */
export const devCaptcha: CaptchaVerifier = { verify: async (token) => token === "dev-ok" };
