const GRADIENTS = [
  "var(--grad-violet)",
  "var(--grad-sky)",
  "var(--grad-emerald)",
  "var(--grad-amber)",
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

export function initialOf(name: string) {
  return (name.trim().charAt(0) || "?").toUpperCase();
}
