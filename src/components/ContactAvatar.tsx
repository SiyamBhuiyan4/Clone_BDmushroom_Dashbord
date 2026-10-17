import { useState } from "react";
import { avatarThemeFor, initialOf } from "../lib/avatar";
import { cx } from "./ui";

export interface ContactAvatarProps {
  name: string;
  photoUrl?: string | null;
  size?: "xs" | "sm" | "md" | "lg" | "xl";
  className?: string;
  shape?: "circle" | "squircle";
  animated?: boolean;
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
  animated = true,
}: ContactAvatarProps) {
  const [imgFailed, setImgFailed] = useState(false);
  const sizeClasses = SIZE_MAP[size] || SIZE_MAP.md;
  const initial = initialOf(name);
  const theme = avatarThemeFor(name);
  const roundedClass = shape === "circle" ? "rounded-full" : "rounded-2xl";

  const showPhoto = Boolean(photoUrl) && !imgFailed;

  return (
    <div
      className={cx(
        "group/avatar relative shrink-0 aspect-square select-none",
        sizeClasses,
        className,
      )}
    >
      {/* Outer ambient glow halo (pulsing and blooming on hover) */}
      {!showPhoto && (
        <span
          className={cx(
            "pointer-events-none absolute -inset-1 rounded-full opacity-65 blur-md transition-all duration-500",
            "group-hover:opacity-100 group-hover:blur-lg group-hover/avatar:opacity-100 group-hover/avatar:blur-lg",
            animated && "ac-avatar-glow",
          )}
          style={{ background: theme.glow }}
          aria-hidden
        />
      )}

      {/* Main avatar surface */}
      <div
        className={cx(
          "relative z-10 flex size-full items-center justify-center font-bold text-white overflow-hidden transition-all duration-300",
          "group-hover:scale-105 group-hover/avatar:scale-105",
          roundedClass,
          !showPhoto && "ring-1 ring-inset ring-white/35 dark:ring-white/20 shadow-[0_2px_12px_rgba(0,0,0,0.18)]",
          !showPhoto && animated && "ac-avatar-gradient-shift",
          showPhoto && "ring-1 ring-line/80 bg-surface-2",
        )}
        style={!showPhoto ? { background: theme.gradient } : undefined}
        aria-hidden
      >
        {showPhoto ? (
          <img
            src={photoUrl!}
            alt={name}
            onError={() => setImgFailed(true)}
            className={cx(
              "size-full object-cover transition-transform duration-300 group-hover:scale-105",
              roundedClass,
            )}
          />
        ) : (
          <>
            {/* Top glossy specular reflection */}
            <span
              className={cx(
                "pointer-events-none absolute inset-0 bg-gradient-to-b from-white/35 via-transparent to-black/20",
                roundedClass,
              )}
              aria-hidden
            />

            {/* Subtle 3D sphere spherical spotlight */}
            <span
              className={cx(
                "pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_35%_25%,rgba(255,255,255,0.45)_0%,transparent_60%)]",
                roundedClass,
              )}
              aria-hidden
            />

            {/* First alphabet of name with luminous depth */}
            <span className="relative z-10 leading-none drop-shadow-[0_1.5px_3px_rgba(0,0,0,0.45)] select-none">
              {initial}
            </span>
          </>
        )}
      </div>
    </div>
  );
}
