import Link from "next/link";
import Button from "@/components/ui/Button";
import Panel from "@/components/ui/Panel";

export default function NotFound() {
  return (
    <div className="flex flex-col items-center justify-center py-16 sm:py-24 text-center max-w-md mx-auto">
      <Panel variant="parchment" className="w-full space-y-4 py-10">
        <div className="text-4xl font-extrabold text-[var(--accent)] font-mono">
          404
        </div>
        <h2 className="text-xl font-bold text-[var(--text-primary)]">
          That straw was never drawn
        </h2>
        <p className="text-xs sm:text-sm text-[var(--text-muted)] leading-relaxed">
          The page or draw you were looking for doesn't exist on this chain.
        </p>
        <div className="pt-2">
          <Link href="/">
            <Button variant="primary" size="md">
              Return to draws
            </Button>
          </Link>
        </div>
      </Panel>
    </div>
  );
}
