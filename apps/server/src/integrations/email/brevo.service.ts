import { env } from "../../config/env";
import { EmailNotConfiguredError, EmailProviderError, type EmailMessage, type EmailResult, type EmailService } from "./email.service";

const BREVO_URL = "https://api.brevo.com/v3/smtp/email";

/** Brevo transactional email payload (POST /v3/smtp/email). Pure, so it can be unit tested. */
export function toBrevoPayload(msg: EmailMessage, sender: { email: string; name?: string }) {
  return {
    sender,
    to: msg.to.map((t) => ({ email: t.email, ...(t.name ? { name: t.name } : {}) })),
    subject: msg.subject,
    htmlContent: msg.html,
    textContent: msg.text,
    ...(msg.replyTo ? { replyTo: msg.replyTo } : {}),
    ...(msg.attachments?.length ? { attachment: msg.attachments.map((a) => ({ name: a.name, content: a.content })) } : {}),
    ...(msg.tags?.length ? { tags: msg.tags } : {}),
  };
}

export class BrevoEmailService implements EmailService {
  readonly provider = "brevo";

  constructor(
    private apiKey = env.BREVO_API_KEY,
    private senderEmail = env.BREVO_SENDER_EMAIL,
    private senderName = env.BREVO_SENDER_NAME,
    private fetchImpl: typeof fetch = fetch,
  ) {}

  get configured() {
    return Boolean(this.apiKey && this.senderEmail);
  }

  async send(msg: EmailMessage, senderName?: string): Promise<EmailResult> {
    if (!this.apiKey || !this.senderEmail) throw new EmailNotConfiguredError();
    const res = await this.fetchImpl(BREVO_URL, {
      method: "POST",
      headers: { "api-key": this.apiKey, "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify(toBrevoPayload(msg, { email: this.senderEmail, name: senderName ?? this.senderName })),
      signal: AbortSignal.timeout(20_000),
    });
    const data = (await res.json().catch(() => ({}))) as { messageId?: string; message?: string; code?: string };
    if (!res.ok) {
      // Brevo messages are safe to show ("invalid email", "sender not verified"); never echo the key.
      throw new EmailProviderError(data.message ? `Brevo: ${data.message}` : `Brevo returned ${res.status}`, res.status);
    }
    return { messageId: data.messageId ?? null };
  }
}

export const emailService = new BrevoEmailService();
