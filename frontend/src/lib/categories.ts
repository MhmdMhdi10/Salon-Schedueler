import type { ComponentType } from 'react';
import {
  HaircutIcon,
  MakeupIcon,
  NailsIcon,
  SkinIcon,
  BrowsIcon,
  BarberIcon,
  type CategoryIconProps,
} from '../components/icons';

/**
 * آرا category taxonomy → icon + route + label mapping
 * (design "Category Taxonomy & Icons" / "Asset Reuse Plan", Goals 8, 9, 13).
 *
 * The taxonomy is the app's own service set from `fa.json`
 * (`home.services.items`): haircut / color / makeup / nails / skin / brows —
 * **plus a men's barbershop** (`barber`). Each entry pairs the taxonomy key
 * with:
 *  - `Icon`   — a token-driven glyph from `components/icons` (fills via
 *               `currentColor`, so it re-tints per theme + tenant; universal,
 *               never mirrored under RTL),
 *  - `asset`  — the copied reference-clone SVG in `public/images/categories/`
 *               (the static source asset; raw hex is fine there),
 *  - `route`  — the public discovery route (`/services/:type`, see `App.tsx`),
 *  - `labelKey` / `shortLabelKey` — **i18n keys** (never inlined Persian) into
 *               the existing `home.services` / `home.categories` catalog, so
 *               copy stays in `fa.json`. `labelKey` is the descriptive title
 *               (use as the accessible name); `shortLabelKey` is the compact
 *               chip label.
 *
 * This module is presentation-only data. Task 3.2 consumes `CATEGORIES` to
 * render the boosky-style horizontal category browser; it calls `t(labelKey)` /
 * `t(shortLabelKey)` and supplies the Persian `aria-label` on each surrounding
 * link so the decorative (`aria-hidden`) icons need no text of their own.
 */
export type CategoryKey = 'haircut' | 'color' | 'makeup' | 'nails' | 'skin' | 'brows' | 'barber';

export interface CategoryDef {
  /** App taxonomy key (matches `fa.json` `home.services.items.*`). */
  key: CategoryKey;
  /** Token-driven, RTL-safe (non-mirrored) glyph. */
  Icon: ComponentType<CategoryIconProps>;
  /** Copied reference-clone source asset in `public/images/categories/`. */
  asset: string;
  /** Public discovery route for this category (`/services/:type`). */
  route: string;
  /** i18n key for the descriptive label / accessible name. */
  labelKey: string;
  /** i18n key for the compact chip label. */
  shortLabelKey: string;
}

/** Build a category descriptor, deriving the conventional route + i18n keys. */
function category(
  key: CategoryKey,
  Icon: ComponentType<CategoryIconProps>,
  assetFile: string,
): CategoryDef {
  return {
    key,
    Icon,
    asset: `/images/categories/${assetFile}`,
    route: `/services/${key}`,
    labelKey: `home.services.items.${key}.title`,
    shortLabelKey: `home.categories.items.${key}.short`,
  };
}

/**
 * The ordered category set for the browser. `color` reuses the hair-family
 * glyph/asset (there is no distinct color SVG in the reference clone — per the
 * design taxonomy table).
 */
export const CATEGORIES: readonly CategoryDef[] = [
  category('haircut', HaircutIcon, 'hair-salons.svg'),
  category('color', HaircutIcon, 'hair-salons.svg'),
  category('makeup', MakeupIcon, 'make-up.svg'),
  category('nails', NailsIcon, 'nail-salons.svg'),
  category('skin', SkinIcon, 'skin-care.svg'),
  category('brows', BrowsIcon, 'brows-and-lashes.svg'),
  category('barber', BarberIcon, 'barbers.svg'),
];

/** Lookup a category descriptor by its taxonomy key. */
export function getCategory(key: CategoryKey): CategoryDef | undefined {
  return CATEGORIES.find((c) => c.key === key);
}
