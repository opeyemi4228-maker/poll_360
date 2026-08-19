import { WifiOff } from "lucide-react";
import Button from "@/components/ui/Button";

export const metadata = {
  title: "Offline",
  robots: { index: false, follow: false },
};

/**
 * What an installed copy shows when the network is gone and the page asked for
 * was never cached.
 *
 * It says what it does not know. An election product's offline screen is a
 * place where it is very tempting to show the last figures you happen to have
 * and let the reader assume they are current, so this one shows no figures at
 * all, and explains why.
 */
export default function OfflinePage() {
  return (
    <section className="on-dark bg-blue-950">
      <div className="shell shell-text flex min-h-[70vh] flex-col justify-center py-24">
        <WifiOff size={32} strokeWidth={2} className="text-red-400" aria-hidden="true" />

        <h1 className="mt-8 text-fluid-3xl text-white">No connection</h1>

        <p className="prose-body mt-5 text-white/70">
          You are offline, and this page has not been opened on this device before, so there is
          nothing saved to show you.
        </p>

        <p className="mt-6 max-w-xl border-l-2 border-red-500 pl-4 text-[0.9375rem] leading-relaxed text-white/75">
          Pages you have already opened will still load without a signal, but the figures on them
          are the ones from when you last had one, and they will say so. Nothing here updates until
          you are back online.
        </p>

        <div className="mt-10">
          <Button href="/" variant="inverse" size="lg">
            Try again
          </Button>
        </div>
      </div>
    </section>
  );
}
