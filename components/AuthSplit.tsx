import { Stamp } from "@/components/ui/annotations";

/* Two-column auth split: sample-roast pull quote on sunken paper at the
   left (desktop only), the form in a sheet at the right. Mobile: the form
   only, since the aside is hidden. */
export default function AuthSplit({
  quote,
  children,
}: {
  quote: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="grid gap-10 lg:grid-cols-2 lg:gap-16">
      <aside className="hidden lg:flex flex-col justify-between rounded-[10px] bg-paper-sunken p-10">
        <div className="flex items-center justify-between gap-3">
          <div className="type-label">Sample roast</div>
          <Stamp tone="ink">Sample</Stamp>
        </div>
        <div className="my-10 font-display text-[30px] italic leading-[40px] text-ink xl:text-[34px] xl:leading-[44px]">
          {quote}
        </div>
        <p className="font-mono text-xs leading-5 text-ink-3">
          Real inference. Sandbox money. Nothing here is graded by a human editor.
        </p>
      </aside>
      <div className="w-full lg:self-center">{children}</div>
    </div>
  );
}
