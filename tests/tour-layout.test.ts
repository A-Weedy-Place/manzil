import { describe, expect, it } from 'vitest';
import { placeTourCard, type TourRect } from '../src/lib/tourLayout';
const intersects = (a: TourRect, b: TourRect) => a.left < b.left + b.width && a.left + a.width > b.left && a.top < b.top + b.height && a.top + a.height > b.top;
describe('target-aware tour placement', () => {
  it.each([
    { width: 715, height: 431, target: { left: 39, top: 365, width: 280, height: 50 }, cardHeight: 350 },
    { width: 375, height: 812, target: { left: 16, top: 340, width: 300, height: 42 }, cardHeight: 380 },
    { width: 667, height: 375, target: { left: 20, top: 312, width: 270, height: 32 }, cardHeight: 350 },
    { width: 1280, height: 800, target: { left: 85, top: 100, width: 360, height: 640 }, cardHeight: 350 },
    { width: 375, height: 812, target: { left: 270, top: 10, width: 80, height: 44 }, cardHeight: 420 },
  ])('does not cover the highlighted feature at $width × $height, including the reported legend overlap', ({ width, height, target, cardHeight }) => {
    for (const rtl of [false, true]) {
      const result = placeTourCard(target, { width: 440, height: cardHeight }, { left: 0, top: 0, width, height }, rtl);
      expect(result.target).not.toBeNull();
      const card = { left: result.left, top: result.top, width: result.width, height: Math.min(cardHeight, result.maxHeight) };
      expect(intersects(card, result.target!)).toBe(false);
      expect(card.left).toBeGreaterThanOrEqual(12); expect(card.top).toBeGreaterThanOrEqual(12);
      expect(card.left + card.width).toBeLessThanOrEqual(width - 12); expect(card.top + card.height).toBeLessThanOrEqual(height - 12);
    }
  });
  it('centres a welcome or invisible target and respects a resized visual viewport', () => {
    const viewport = { left: 20, top: 40, width: 360, height: 400 };
    const welcome = placeTourCard(null, { width: 440, height: 550 }, viewport);
    expect(welcome).toMatchObject({ side: 'center', target: null, width: 336, maxHeight: 376 });
    expect(welcome.left).toBe(32); expect(welcome.top).toBe(52);
    expect(placeTourCard({ left: 1000, top: 1000, width: 30, height: 30 }, { width: 440, height: 300 }, viewport).target).toBeNull();
  });
});
