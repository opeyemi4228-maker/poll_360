export const metadata = { title: "Address blocked", robots: { index: false } };

/** Shown to a staff account arriving from an address the security desk has blocked. */
export default function BlockedPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-white p-8 text-center">
      <div className="max-w-md">
        <h1 className="font-display text-[1.75rem] font-bold text-ink-950">This address has been blocked</h1>
        <p className="mt-3 text-[1rem] leading-relaxed text-content-muted">
          The security desk has stopped this internet address from opening Poll360&apos;s dashboards. If that is a mistake, ring the Super Admin, who can lift it.
        </p>
      </div>
    </main>
  );
}
