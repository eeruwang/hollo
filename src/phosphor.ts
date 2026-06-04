import type { ThemeColor } from "./schema";

export type PhosphorColor = "green" | "amber" | "cyan" | "magenta";

/**
 * Map the legacy ThemeColor enum (21 Pico colors plus `eeruwang`) to the
 * four phosphor swatches the terminal design ships with.  The mapping is
 * applied at render time only; the stored `themeColor` value is left
 * untouched so the column remains compatible with any future schema
 * direction.
 */
export function getPhosphorColor(themeColor: ThemeColor | null | undefined): PhosphorColor {
  switch (themeColor) {
    case "green":
    case "jade":
    case "lime":
      return "green";
    case "amber":
    case "yellow":
    case "orange":
    case "pumpkin":
    case "sand":
      return "amber";
    case "cyan":
    case "azure":
    case "blue":
    case "indigo":
    case "slate":
      return "cyan";
    case "pink":
    case "fuchsia":
    case "purple":
    case "violet":
    case "red":
      return "magenta";
    default:
      // `eeruwang`, `grey`, `zinc`, or null — fall back to the design's
      // signature phosphor green.
      return "green";
  }
}
