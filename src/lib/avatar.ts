const GRADIENTS = [
  "var(--grad-violet)",
  "var(--grad-sky)",
  "var(--grad-emerald)",
  "var(--grad-amber)",
];

export const AVATAR_GRADIENTS = [
  "linear-gradient(135deg, #6366f1 0%, #8b5cf6 50%, #d946ef 100%)", // Indigo - Purple - Fuchsia
  "linear-gradient(135deg, #0284c7 0%, #06b6d4 50%, #10b981 100%)", // Sky - Cyan - Emerald
  "linear-gradient(135deg, #f59e0b 0%, #ea580c 50%, #e11d48 100%)", // Amber - Orange - Rose
  "linear-gradient(135deg, #10b981 0%, #059669 50%, #047857 100%)", // Emerald - Teal
  "linear-gradient(135deg, #8b5cf6 0%, #7c3aed 50%, #4f46e5 100%)", // Purple - Indigo
  "linear-gradient(135deg, #ec4899 0%, #f43f5e 50%, #fb7185 100%)", // Pink - Rose
  "linear-gradient(135deg, #0ea5e9 0%, #2563eb 50%, #4338ca 100%)", // Cyan - Blue - Indigo
  "linear-gradient(135deg, #14b8a6 0%, #0d9488 50%, #0f766e 100%)", // Teal - Cyan
  "linear-gradient(135deg, #f97316 0%, #ef4444 50%, #dc2626 100%)", // Orange - Red
  "linear-gradient(135deg, #4f46e5 0%, #3b82f6 50%, #06b6d4 100%)", // Indigo - Blue - Cyan
];

/**
 * Picks a stable gradient for a product from its name, so the same product
 * always wears the same colour everywhere it appears. Purely decorative
 * identity — it encodes nothing about the numbers.
 */
export function gradientFor(name: string) {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = (hash * 31 + name.charCodeAt(i)) >>> 0;
  }
  return GRADIENTS[hash % GRADIENTS.length];
}

/**
 * Picks a rich modern gradient for contact & vendor avatars.
 */
export function avatarGradientFor(name: string) {
  const clean = name.trim();
  if (!clean) return AVATAR_GRADIENTS[0];
  let hash = 0;
  for (let i = 0; i < clean.length; i++) {
    hash = (hash * 31 + clean.charCodeAt(i)) >>> 0;
  }
  return AVATAR_GRADIENTS[hash % AVATAR_GRADIENTS.length];
}

export function initialOf(name: string) {
  const trimmed = name.trim();
  if (!trimmed) return "?";
  // Handle Unicode glyphs including Bengali
  const char = Array.from(trimmed)[0] || "?";
  return char.toUpperCase();
}
