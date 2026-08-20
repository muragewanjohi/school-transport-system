/** Console mobile nav breakpoint (px). Matches CSS `@media (max-width: 900px)`. */
export const MOBILE_NAV_MAX_WIDTH_PX = 900;

/** True when the viewport width should use the off-canvas sidebar. */
export function isMobileNavViewport(widthPx: number): boolean {
  return widthPx <= MOBILE_NAV_MAX_WIDTH_PX;
}

/**
 * Whether an open mobile drawer should close after a navigation change.
 * Desktop keeps the persistent sidebar; only mobile auto-closes.
 */
export function shouldCloseMobileNavOnNavigate(options: {
  isMobileViewport: boolean;
  isOpen: boolean;
  pathnameChanged: boolean;
}): boolean {
  return options.isMobileViewport && options.isOpen && options.pathnameChanged;
}
