/** Provider-agnostic email contract. Swap Brevo for another provider by adding an implementation. */
export interface EmailAddress {
  email: string;
  name?: string;
}

export interface EmailAttachment {
  name: string;
  /** base64-encoded content */
  content: string;
}

export interface EmailMessage {
  to: EmailAddress[];
  subject: string;
  text: string;
  html: string;
  replyTo?: EmailAddress;
  attachments?: EmailAttachment[];
  tags?: string[];
}

export interface EmailResult {
  messageId: string | null;
}

export interface EmailService {
  readonly provider: string;
  readonly configured: boolean;
  send(message: EmailMessage): Promise<EmailResult>;
}

export class EmailNotConfiguredError extends Error {
  constructor() {
    super("Email isn't configured. Add BREVO_API_KEY and BREVO_SENDER_EMAIL to the server environment.");
  }
}

export class EmailProviderError extends Error {
  constructor(
    message: string,
    public status?: number,
  ) {
    super(message);
  }
}
