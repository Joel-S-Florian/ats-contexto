import nodemailer from "nodemailer";

export interface MailOptions {
  html?: string;
  attachments?: { filename: string; content: string; contentType: string }[];
}

/** Puerto de correo. Los adaptadores (consola, SMTP/Google) se intercambian sin tocar el código de negocio. */
export interface Mailer {
  send(to: string, subject: string, text: string, opts?: MailOptions): Promise<void>;
}

// Adaptador de desarrollo. No imprime el destinatario (sin datos personales en logs).
export const consoleMailer: Mailer = {
  async send(_to, subject, text) {
    console.log(`[correo] ${subject}: ${text.split("\n").slice(0, 6).join(" | ")}`);
  },
};

/**
 * SMTP genérico: sirve para Mailpit en desarrollo y para Google (smtp.gmail.com con contraseña de aplicación u OAuth2).
 * Límites de Gmail: ~500 envíos/día en cuentas personales y ~2.000 en Workspace. Para volumen transaccional se recomienda
 * un servicio dedicado (Amazon SES, Postmark, Resend): basta con otro adaptador de este mismo puerto.
 */
export function smtpMailer(smtpUrl: string, from: string): Mailer {
  const transport = nodemailer.createTransport(smtpUrl);
  return {
    async send(to, subject, text, opts) {
      await transport.sendMail({
        from,
        to,
        subject,
        text,
        html: opts?.html,
        attachments: opts?.attachments?.map((a) => ({
          filename: a.filename,
          content: a.content,
          contentType: a.contentType,
        })),
      });
    },
  };
}
