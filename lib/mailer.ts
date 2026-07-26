// Email transport behind a small interface.
//
// Mirrors how AI generation degrades in lib/generate.ts: with no RESEND_API_KEY
// the app still runs end-to-end, it just logs the alert instead of sending it.
// That keeps the whole watchlist — due-queue, transitions, dedupe — drivable
// locally with zero third-party signup, and means a mail outage can never take
// down the poller.

export type Message = {
  to: string;
  subject: string;
  text: string;
};

export interface Mailer {
  readonly name: string;
  send(msg: Message): Promise<boolean>;
}

export function hasMailCredentials(): boolean {
  return Boolean(process.env.RESEND_API_KEY);
}

/** Fallback: no key, no network — just say what would have been sent. */
export const consoleMailer: Mailer = {
  name: "console",
  async send(msg) {
    console.log(
      `\n--- alert (not sent: no RESEND_API_KEY) ---\nto: ${msg.to}\nsubject: ${msg.subject}\n\n${msg.text}\n---\n`,
    );
    return true;
  },
};

/**
 * Resend over plain fetch — the REST call is three fields, which isn't worth a
 * dependency. Never throws: a failed send returns false so the poller can leave
 * the alert unrecorded and retry it on the next run.
 */
export const resendMailer: Mailer = {
  name: "resend",
  async send(msg) {
    try {
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          authorization: `Bearer ${process.env.RESEND_API_KEY}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          from: process.env.ALERT_FROM ?? "alerts@example.com",
          to: msg.to,
          subject: msg.subject,
          text: msg.text,
        }),
        signal: AbortSignal.timeout(10_000),
      });
      if (!res.ok) {
        console.error(`resend: ${res.status} ${await res.text().catch(() => "")}`);
        return false;
      }
      return true;
    } catch (err) {
      console.error("resend: send failed", err);
      return false;
    }
  },
};

/**
 * The active transport, or `null` when there is none to use.
 *
 * With a key, that's Resend. Without one we return the console fallback ONLY
 * outside production — locally it keeps the whole flow drivable with no signup.
 * In production a missing key returns `null` rather than the console mailer,
 * because the fallback would otherwise (a) print the recipient's email and their
 * manage token — an auth credential — into the runtime logs, and (b) let the
 * poller record a "console" send as a durable delivery, so the alert would never
 * be re-sent once a real key is added. `null` makes the poller defer instead:
 * the alert stays undelivered and a later run picks it up once RESEND_API_KEY
 * is set. See lib/poll.ts.
 */
export function getMailer(): Mailer | null {
  if (hasMailCredentials()) return resendMailer;
  if (process.env.NODE_ENV === "production") return null;
  return consoleMailer;
}
