import { ArrowLeft } from "lucide-react";
import Button from "@/components/ui/Button";

export const metadata = { title: "Page not found" };

export default function NotFound() {
  return (
    <section className="on-dark bg-blue-950">
      <div className="shell shell-text flex min-h-[70vh] flex-col justify-center py-24">
        <p className="figure text-fluid-6xl leading-none font-bold text-red-500">404</p>
        <h1 className="mt-6 text-fluid-3xl text-white">No returns from this address</h1>
        <p className="prose-body mt-5 text-white/70">
          The page you asked for is not here. Nothing has been lost, this is simply an address
          that was never filed.
        </p>
        <div className="mt-10">
          <Button href="/" variant="inverse" size="lg">
            <ArrowLeft size={16} strokeWidth={3} />
            Back to the board
          </Button>
        </div>
      </div>
    </section>
  );
}
