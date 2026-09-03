/**
 * Avatar renderer with a guaranteed fallback.
 *
 * Accepts either an absolute URL or a private storage path (a signed URL is
 * resolved on demand). Any failure falls back to the GamePro symbol, so the
 * component never renders a broken image.
 */
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";

import fallbackSymbol from "@/assets/gamepro-symbol.png";
import { cn } from "@/lib/utils";
import { resolveAvatarUrl } from "@/lib/avatar";

interface UserAvatarProps {
  /** Stored `profiles.avatar_url` value: storage path or absolute URL. */
  source?: string | null;
  name?: string | null;
  size?: number;
  className?: string;
}

export function UserAvatar({ source, name, size = 40, className }: UserAvatarProps) {
  const [failed, setFailed] = useState(false);

  const { data: url } = useQuery({
    queryKey: ["avatar-url", source ?? null],
    queryFn: () => resolveAvatarUrl(source),
    enabled: Boolean(source),
    staleTime: 50 * 60 * 1000,
  });

  useEffect(() => setFailed(false), [url]);

  const showImage = Boolean(url) && !failed;

  return (
    <span
      className={cn(
        "relative inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full border border-border bg-secondary",
        className,
      )}
      style={{ width: size, height: size }}
    >
      <img
        src={showImage ? (url as string) : fallbackSymbol}
        alt={name ? `${name}` : "Avatar"}
        loading="lazy"
        width={size}
        height={size}
        className={cn("h-full w-full", showImage ? "object-cover" : "object-contain p-1.5")}
        onError={() => setFailed(true)}
      />
    </span>
  );
}
