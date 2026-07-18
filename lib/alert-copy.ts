// What an alert actually says.
//
// Kept separate from transport (lib/mailer.ts) and from delivery (lib/poll.ts)
// so the wording is reviewable on its own — it's the whole product surface.
//
// The tone is set by a decision recorded in the wiki: you cannot win a drop by
// polling, because professional drop-catchers hold hundreds of registrar
// connections. So these emails never say "go get it". The pendingDelete alert
// says "here is your ~5-day window, place a backorder"; the available alert
// says "it dropped, and it was probably caught — here's how to check". Promising
// the catch would be the easy copy and a lie.

import type { AvailabilityStatus } from "@domain-finder/core";
import { backorderUrl, buyUrl } from "./links";

export type AlertInput = {
  domain: string;
  to: AvailabilityStatus;
  estimatedDropAt?: string | Date | null;
  manageToken: string;
};

function daysUntil(v: string | Date, now: Date): number | null {
  const t = v instanceof Date ? v.getTime() : Date.parse(v);
  if (Number.isNaN(t)) return null;
  return Math.max(0, Math.round((t - now.getTime()) / 86_400_000));
}

function manageUrl(token: string): string {
  const base = process.env.APP_URL ?? "http://localhost:3000";
  return `${base}/watch/${token}`;
}

export function buildAlert(
  input: AlertInput,
  now: Date = new Date(),
): { subject: string; text: string } {
  const manage = manageUrl(input.manageToken);

  if (input.to === "deleting") {
    const days = input.estimatedDropAt ? daysUntil(input.estimatedDropAt, now) : null;
    const when = days === null ? "in about 5 days" : `in about ${days} day${days === 1 ? "" : "s"}`;

    return {
      subject: `${input.domain} is dropping — ~${days ?? 5} day${days === 1 ? "" : "s"} to act`,
      text: [
        `${input.domain} has entered pendingDelete.`,
        "",
        `That's a fixed ~5-day window, after which the registry releases the name.`,
        `Best estimate: it drops ${when}.`,
        "",
        "This is the moment to act, and the honest version of how:",
        "",
        "  Place a backorder. When a good domain drops, professional drop-catch",
        "  services take it within milliseconds — they hold hundreds of registrar",
        "  connections and fire the instant the registry opens. Refreshing a",
        "  registrar page will not beat them, and neither will this app. A",
        "  backorder puts you in their queue, which is the only realistic path.",
        "",
        `  Backorder: ${backorderUrl(input.domain)}`,
        "",
        "If nobody else wants it, it will simply become registrable and you can",
        "buy it at retail. We'll email you when it drops either way.",
        "",
        `Manage this watch: ${manage}`,
      ].join("\n"),
    };
  }

  // available
  return {
    subject: `${input.domain} is available`,
    text: [
      `${input.domain} is now registrable.`,
      "",
      `  Register: ${buyUrl(input.domain)}`,
      "",
      "Worth knowing: if this domain was desirable, a drop-catcher may already",
      "have taken it and the availability you're seeing is a brief gap before",
      "their registration lands. If the link above shows it as taken, that's",
      "what happened. Nothing was done wrong — that race isn't winnable from here.",
      "",
      "This was the last alert for this watch.",
      "",
      `Manage this watch: ${manage}`,
    ].join("\n"),
  };
}
