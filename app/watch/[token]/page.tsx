// Manage page. The token in the URL is the credential — there's no session to
// check, by design. Rendered on the server so the timeline comes straight from
// watch_events with no client fetch.

import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { deleteWatchByToken, getWatchByToken } from "@/lib/watch";
import { backorderUrl, buyUrl } from "@/lib/links";
import { hasDatabase } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const STATUS_LABEL: Record<string, string> = {
  available: "Available",
  active: "Taken",
  parked: "Parked",
  expiring: "In redemption",
  deleting: "Dropping",
  reserved: "Reserved",
  unknown: "Unknown",
};

function fmt(d: Date | null | undefined): string {
  if (!d) return "—";
  return d.toISOString().replace("T", " ").slice(0, 16) + " UTC";
}

function daysUntil(d: Date): number {
  return Math.max(0, Math.round((d.getTime() - Date.now()) / 86_400_000));
}

export default async function WatchPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  if (!hasDatabase()) notFound();

  const { token } = await params;
  const watch = await getWatchByToken(token);
  if (!watch) notFound();

  async function unwatch() {
    "use server";
    await deleteWatchByToken(token);
    redirect("/");
  }

  const { current } = watch;
  const dropping = current.bucket === "dropping";

  return (
    <main className="mx-auto w-full max-w-2xl flex-1 px-5 py-12 sm:py-20">
      <header className="mb-8">
        <Link href="/" className="text-xs opacity-50 hover:opacity-100">
          ← Domain Finder
        </Link>
        <h1 className="mt-2 font-mono text-3xl font-semibold tracking-tight">
          {watch.domain}
        </h1>
        <p className="mt-2 text-sm opacity-60">
          {watch.state === "fired"
            ? "This watch has fired — it dropped, and we told you."
            : `Watching for ${watch.email}. We'll email you when it enters the drop path.`}
        </p>
      </header>

      <section className="rounded-xl border border-black/10 dark:border-white/10 bg-black/[0.02] dark:bg-white/[0.03] px-4 py-3">
        <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
          <dt className="opacity-50">Status</dt>
          <dd className="font-medium">{STATUS_LABEL[current.status] ?? current.status}</dd>

          <dt className="opacity-50">Expires</dt>
          <dd>{fmt(current.expiresAt)}</dd>

          {current.estimatedDropAt && (
            <>
              <dt className="opacity-50">Estimated drop</dt>
              <dd className="text-orange-600 dark:text-orange-400">
                {fmt(current.estimatedDropAt)} (~{daysUntil(current.estimatedDropAt)}d)
              </dd>
            </>
          )}

          <dt className="opacity-50">Last checked</dt>
          <dd>{fmt(current.lastCheckedAt)}</dd>

          <dt className="opacity-50">Next check</dt>
          <dd>{fmt(current.nextCheckAt)}</dd>
        </dl>
      </section>

      {dropping && (
        <section className="mt-4 rounded-xl border border-orange-500/30 bg-orange-500/[0.06] px-4 py-3 text-sm">
          <p className="font-medium text-orange-700 dark:text-orange-400">
            This domain is on the drop path.
          </p>
          <p className="mt-1 opacity-70">
            When a good domain drops, professional drop-catch services take it within
            milliseconds — they hold hundreds of registrar connections. Refreshing a
            registrar won&apos;t beat them, and neither will this app. A backorder puts you
            in their queue, which is the realistic path.
          </p>
          <a
            href={backorderUrl(watch.domain)}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-3 inline-block rounded-lg bg-foreground px-3 py-1.5 text-sm font-medium text-background transition hover:opacity-90"
          >
            Place a backorder
          </a>
        </section>
      )}

      {current.status === "available" && (
        <section className="mt-4 rounded-xl border border-green-500/30 bg-green-500/[0.06] px-4 py-3 text-sm">
          <p className="font-medium text-green-700 dark:text-green-400">
            It&apos;s registrable right now.
          </p>
          <a
            href={buyUrl(watch.domain)}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-3 inline-block rounded-lg bg-foreground px-3 py-1.5 text-sm font-medium text-background transition hover:opacity-90"
          >
            Register it
          </a>
        </section>
      )}

      <section className="mt-8">
        <h2 className="mb-3 text-xs font-medium uppercase tracking-wide opacity-50">
          History
        </h2>
        <ol className="space-y-2">
          {watch.timeline.map((e, i) => (
            <li
              key={i}
              className="flex items-baseline gap-3 rounded-lg border border-black/10 dark:border-white/10 px-3 py-2 text-sm"
            >
              <span className="tabular-nums text-xs opacity-50">{fmt(e.observedAt)}</span>
              <span>
                {e.fromStatus ? (
                  <>
                    <span className="opacity-60">
                      {STATUS_LABEL[e.fromStatus] ?? e.fromStatus}
                    </span>
                    <span className="mx-1.5 opacity-40">→</span>
                  </>
                ) : (
                  <span className="mr-1.5 opacity-40">first seen as</span>
                )}
                <span className="font-medium">
                  {STATUS_LABEL[e.toStatus] ?? e.toStatus}
                </span>
              </span>
            </li>
          ))}
        </ol>
      </section>

      {watch.siblings.length > 1 && (
        <section className="mt-8">
          <h2 className="mb-3 text-xs font-medium uppercase tracking-wide opacity-50">
            Your other watches
          </h2>
          <ul className="space-y-1.5">
            {watch.siblings
              .filter((s) => s.domain !== watch.domain)
              .map((s) => (
                <li key={s.domain}>
                  <Link
                    href={`/watch/${s.manageToken}`}
                    className="flex items-center justify-between rounded-lg border border-black/10 dark:border-white/10 px-3 py-2 text-sm hover:border-foreground/30"
                  >
                    <span className="font-mono">{s.domain}</span>
                    <span className="text-xs opacity-50">
                      {STATUS_LABEL[s.status] ?? s.status}
                    </span>
                  </Link>
                </li>
              ))}
          </ul>
        </section>
      )}

      <form action={unwatch} className="mt-10">
        <button
          type="submit"
          className="text-xs text-red-500 opacity-70 transition hover:opacity-100"
        >
          Stop watching {watch.domain}
        </button>
      </form>
    </main>
  );
}
