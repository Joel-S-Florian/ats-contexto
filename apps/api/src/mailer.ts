export interface Mailer {
  send(to: string, subject: string, text: string): Promise<void>;
}

// Adaptador de desarrollo. No imprime el destinatario (sin datos personales en logs); el de Google llega en la Fase 6.
export const consoleMailer: Mailer = {
  async send(_to, subject, text) {
    console.log(`[correo] ${subject}: ${text}`);
  },
};
