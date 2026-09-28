import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Panel dengan sudut lancip khas cyberpunk: lapisan luar menjadi garis neon
 * gradien (1.5px) dan lapisan dalam membawa latar kartu. Glow mengikuti bentuk.
 */
export function CyberFrame({
  className,
  innerClassName,
  children,
}: {
  className?: string;
  innerClassName?: string;
  children: ReactNode;
}) {
  return (
    <div className={cn("cyber-frame", className)}>
      <div className={cn("cyber-frame-inner", innerClassName)}>{children}</div>
    </div>
  );
}
