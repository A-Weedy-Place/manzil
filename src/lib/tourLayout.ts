export interface TourRect { left: number; top: number; width: number; height: number }
export interface TourPlacement { left: number; top: number; width: number; maxHeight: number; side: 'above' | 'below' | 'left' | 'right' | 'center'; target: TourRect | null }
const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(value, Math.max(min, max)));

/** Place the card in free viewport space. The spotlight and card never share a dimming layer. */
export function placeTourCard(target: TourRect | null, card: { width: number; height: number }, viewport: TourRect, rtl = false): TourPlacement {
  const margin = 12, gap = 14, left = viewport.left + margin, top = viewport.top + margin;
  const right = viewport.left + viewport.width - margin, bottom = viewport.top + viewport.height - margin;
  const width = Math.max(1, Math.min(card.width, right - left)), height = Math.max(1, Math.min(card.height, bottom - top));
  const center: TourPlacement = { left: left + (right - left - width) / 2, top: top + (bottom - top - height) / 2, width, maxHeight: Math.max(1, bottom - top), side: 'center', target: null };
  if (!target || target.width <= 0 || target.height <= 0) return center;
  const x = Math.max(left, target.left - 6), y = Math.max(top, target.top - 6);
  const r = Math.min(right, target.left + target.width + 6), b = Math.min(bottom, target.top + target.height + 6);
  if (r <= x || b <= y) return center;
  const visible = { left: x, top: y, width: r - x, height: b - y };
  const midX = (x + r) / 2, midY = (y + b) / 2;
  const areas = [
    { side: 'below' as const, left, top: b + gap, width: right - left, height: bottom - b - gap },
    { side: 'above' as const, left, top, width: right - left, height: y - top - gap },
    { side: 'right' as const, left: r + gap, top, width: right - r - gap, height: bottom - top },
    { side: 'left' as const, left, top, width: x - left - gap, height: bottom - top },
  ];
  const minWidth = Math.min(width, 280), minHeight = Math.min(160, Math.max(70, (bottom - top) * .35));
  const candidates = areas.filter(area => area.width >= minWidth && area.height >= minHeight).map(area => {
    const w = Math.min(width, area.width), h = Math.min(card.height, area.height);
    const horizontal = area.side === 'left' || area.side === 'right';
    const result: TourPlacement = {
      left: area.side === 'left' ? x - gap - w : area.side === 'right' ? r + gap : clamp(midX - w / 2, left, right - w),
      top: area.side === 'above' ? y - gap - h : area.side === 'below' ? b + gap : clamp(midY - h / 2, top, bottom - h),
      width: w, maxHeight: area.height, side: area.side, target: visible,
    };
    // Prefer no scroll/width squeeze, then a nearby side; respect RTL for equal side choices.
    const score = Math.max(0, card.height - area.height) * 10 + (width - w) * 5 + (horizontal ? 2 : 0) + (area.side === (rtl ? 'right' : 'left') ? 1 : 0);
    return { result, score };
  });
  candidates.sort((a, b) => a.score - b.score);
  if (candidates.length) return candidates[0].result;
  // Compact targets should normally fit. On an exceptionally short viewport use the larger side,
  // making the card scroll rather than placing it over the feature it explains.
  const vertical = areas.slice(0, 2).sort((a, b) => b.height - a.height)[0];
  if (vertical.height > 0) {
    const h = Math.min(card.height, vertical.height);
    return { left: clamp(midX - width / 2, left, right - width), top: vertical.side === 'above' ? y - gap - h : vertical.top, width, maxHeight: vertical.height, side: vertical.side, target: visible };
  }
  return center;
}
