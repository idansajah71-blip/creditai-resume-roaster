"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/* App nav with an editorial active state: a 2px red-pen underline.
   Desktop merges the underline with the header's bottom rule; mobile is a
   horizontally scrollable row with 44px tap targets. */
export default function AppNav({
  links,
  variant = "desktop",
  className = "",
}: {
  links: { href: string; label: string }[];
  variant?: "desktop" | "mobile";
  className?: string;
}) {
  const pathname = usePathname();
  const isActive = (href: string) => pathname === href || pathname.startsWith(`${href}/`);

  const linkClass = (href: string) =>
    `flex min-h-[44px] items-center whitespace-nowrap border-b-2 px-3 text-sm ${
      isActive(href)
        ? "border-red-pen font-medium text-ink"
        : "border-transparent text-ink-2 hover:text-ink"
    }`;

  if (variant === "mobile") {
    return (
      <nav aria-label="Primary" className={`border-t border-line bg-paper md:hidden ${className}`}>
        <div className="mx-auto w-full max-w-[1140px] px-5 md:px-10">
          <ul className="flex w-max items-stretch gap-1">
            {links.map((l) => (
              <li key={l.href} className="flex">
                <Link href={l.href} aria-current={isActive(l.href) ? "page" : undefined} className={linkClass(l.href)}>
                  {l.label}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </nav>
    );
  }

  return (
    <nav aria-label="Primary" className={className}>
      <ul className="flex items-stretch gap-1">
        {links.map((l) => (
          <li key={l.href} className="flex">
            <Link href={l.href} aria-current={isActive(l.href) ? "page" : undefined} className={linkClass(l.href)}>
              {l.label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
