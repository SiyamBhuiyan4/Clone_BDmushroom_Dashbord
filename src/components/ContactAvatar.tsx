import { useState } from "react";
import { avatarGradientFor, initialOf } from "../lib/avatar";
import { cx } from "./ui";

export interface ContactAvatarProps {
  name: string;
  photoUrl?: string | null;
  size?: "xs" | "sm" | "md" | "lg" | "xl";
  className?: string;
  shape?: "circle" | "squircle";
}

const SIZE_MAP = {
  xs: "size-7 text-[11px]",
  sm: "size-8.5 text-[13px]",
  md: "size-11 text-[16px]",
  lg: "size-12 sm:size-13 text-[18px]",
  xl: "size-16 text-[22px]",
};

export function ContactAvatar({
  name,
  photoUrl,
  size = "md",
  className,
  shape = "circle",
}: ContactAvatarProps) {
  const [imgFailed, setImgFailed] = useState(false);
  const sizeClasses = SIZE_MAP[size] || SIZE_MAP.md;
  const initial = initialOf(name);
  const gradient = avatarGradientFor(name);
  const roundedClass = shape === "circle" ? "rounded-full" : "rounded-2xl";

  const showPhoto = Boolean(photoUrl) && !imgFailed;

  return (
    <div
      className={cx(
        "relative shrink-0 aspect-square select-none flex items-center justify-center font-bold text-white shadow-sm overflow-hidden",
        roundedClass,
        sizeClasses,
        !showPhoto && "ring-1 ring-inset ring-white/25 dark:ring-white/15 shadow-[0_2px_8px_-2px_rgba(0,0,0,0.16)]",
        showPhoto && "ring-1 ring-line/80 bg-surface-2",
        className,
      )}
      style={!showPhoto ? { background: gradient } : undefined}
      aria-hidden
    >
      {showPhoto ? (
        <img
          src={photoUrl!}
          alt={name}
          onError={() => setImgFailed(true)}
          className={cx("size-full object-cover", roundedClass)}
        />
      ) : (
        <>
          {/* Subtle glossy top highlight for depth */}
          <span
            className={cx(
              "pointer-events-none absolute inset-0 bg-gradient-to-b from-white/30 via-transparent to-black/15",
              roundedClass,
            )}
            aria-hidden
          />
          {/* First alphabet of name */}
          <span className="relative z-10 leading-none drop-shadow-[0_1px_2px_rgba(0,0,0,0.3)]">
            {initial}
          </span>
        </>
      )}
    </div>
  );
}
