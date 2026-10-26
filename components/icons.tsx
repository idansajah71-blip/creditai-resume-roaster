import React from "react";

type IconName =
  | "menu"
  | "close"
  | "copy"
  | "check"
  | "upload"
  | "arrow-right"
  | "external"
  | "logout"
  | "plus"
  | "search";

const paths: Record<IconName, React.ReactNode> = {
  menu: <path d="M4 7h16M4 12h16M4 17h16" />,
  close: <path d="M6 6l12 12M18 6L6 18" />,
  copy: <><rect x="9" y="9" width="11" height="11" rx="2" /><path d="M5 15V5a2 2 0 0 1 2-2h10" /></>,
  check: <path d="M5 13l4 4L19 7" />,
  upload: <><path d="M12 16V4" /><path d="M8 8l4-4 4 4" /><path d="M4 20h16" /></>,
  "arrow-right": <path d="M5 12h14M13 6l6 6-6 6" />,
  external: <><path d="M14 5h5v5" /><path d="M10 14L19 5" /><path d="M19 14v5H5V5h5" /></>,
  logout: <><path d="M10 17l-5-5 5-5" /><path d="M5 12h12" /><path d="M15 4h4v16h-4" /></>,
  plus: <path d="M12 5v14M5 12h14" />,
  search: <><circle cx="11" cy="11" r="7" /><path d="M20 20l-3.5-3.5" /></>,
};

export function Icon({ name, className }: { name: IconName; className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      {paths[name]}
    </svg>
  );
}