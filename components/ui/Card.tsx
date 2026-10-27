import React from "react";
import { Sheet } from "@/components/ui/Sheet";

/* Compatibility alias: pages still import Card and receive the sheet look. */
export function Card(props: React.HTMLAttributes<HTMLDivElement>) {
  return <Sheet {...props} />;
}
