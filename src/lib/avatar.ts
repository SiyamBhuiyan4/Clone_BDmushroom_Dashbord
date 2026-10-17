export interface AvatarTheme {
  gradient: string;
  glow: string;
  ring: string;
}

export const AVATAR_THEMES: AvatarTheme[] = [
  {
    // Electric Violet / Fuchsia
    gradient: "linear-gradient(135deg, #6366f1 0%, #8b5cf6 45%, #d946ef 100%)",
    glow: "rgba(139, 92, 246, 0.55)",
    ring: "rgba(192, 132, 252, 0.45)",
  },
  {
    // Cyberpunk Cyan / Royal Blue
    gradient: "linear-gradient(135deg, #06b6d4 0%, #3b82f6 50%, #8b5cf6 100%)",
    glow: "rgba(59, 130, 246, 0.55)",
    ring: "rgba(96, 165, 250, 0.45)",
  },
  {
    // Aurora Emerald / Neon Mint
    gradient: "linear-gradient(135deg, #10b981 0%, #06b6d4 50%, #3b82f6 100%)",
    glow: "rgba(16, 185, 129, 0.55)",
    ring: "rgba(52, 211, 153, 0.45)",
  },
  {
    // Sunset Glow / Coral Rose
    gradient: "linear-gradient(135deg, #f59e0b 0%, #f43f5e 50%, #d946ef 100%)",
    glow: "rgba(244, 63, 94, 0.55)",
    ring: "rgba(251, 113, 133, 0.45)",
  },
  {
    // Neon Pink / Deep Purple
    gradient: "linear-gradient(135deg, #ec4899 0%, #a855f7 50%, #6366f1 100%)",
    glow: "rgba(236, 72, 153, 0.55)",
    ring: "rgba(244, 114, 182, 0.45)",
  },
  {
    // Luminous Jade / Lime Teal
    gradient: "linear-gradient(135deg, #14b8a6 0%, #10b981 50%, #84cc16 100%)",
    glow: "rgba(20, 184, 166, 0.55)",
    ring: "rgba(45, 212, 191, 0.45)",
  },
  {
    // Cosmic Amber / Magenta
    gradient: "linear-gradient(135deg, #ff7a18 0%, #af002d 50%, #319197 100%)",
    glow: "rgba(255, 122, 24, 0.55)",
    ring: "rgba(251, 146, 60, 0.45)",
  },
  {
    // Electric Coral / Crimson Flame
    gradient: "linear-gradient(135deg, #f97316 0%, #ef4444 50%, #ec4899 100%)",
    glow: "rgba(239, 68, 68, 0.55)",
    ring: "rgba(248, 113, 113, 0.45)",
  },
  {
    // Sky Diamond / Ocean Blue
    gradient: "linear-gradient(135deg, #00c6ff 0%, #0072ff 100%)",
    glow: "rgba(0, 198, 255, 0.55)",
    ring: "rgba(56, 189, 248, 0.45)",
  },
  {
    // Golden Glow / Solar Flare
    gradient: "linear-gradient(135deg, #f5af19 0%, #f12711 100%)",
    glow: "rgba(245, 175, 25, 0.55)",
    ring: "rgba(251, 191, 36, 0.45)",
  },
];

const GRADIENTS = [
  "var(--grad-violet)",
  "var(--grad-sky)",
  "var(--grad-emerald)",
  "var(--grad-amber)",
];

/**
 * Picks a stable gradient for a product from its name, so the same product
 * always wears the same colour everywhere it appears.
 */
export function gradientFor(name: string) {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = (hash * 31 + name.charCodeAt(i)) >>> 0;
  }
  return GRADIENTS[hash % GRADIENTS.length];
}

/**
 * Returns a high-tier glowing avatar theme (gradient, ambient glow color, ring border).
 */
export function avatarThemeFor(name: string): AvatarTheme {
  const clean = name.trim();
  if (!clean) return AVATAR_THEMES[0];
  let hash = 0;
  for (let i = 0; i < clean.length; i++) {
    hash = (hash * 31 + clean.charCodeAt(i)) >>> 0;
  }
  return AVATAR_THEMES[hash % AVATAR_THEMES.length];
}

/**
 * Picks a rich modern gradient for contact & vendor avatars.
 */
export function avatarGradientFor(name: string) {
  return avatarThemeFor(name).gradient;
}

export function initialOf(name: string) {
  const trimmed = name.trim();
  if (!trimmed) return "?";
  // Handle Unicode glyphs including Bengali
  const char = Array.from(trimmed)[0] || "?";
  return char.toUpperCase();
}
