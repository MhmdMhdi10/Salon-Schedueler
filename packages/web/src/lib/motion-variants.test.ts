import { describe, it, expect } from 'vitest';
import {
  pageVariants,
  revealVariants,
  containerVariants,
  itemVariants,
  stepVariants,
  celebrationVariants,
  pageTransition,
  revealTransition,
  celebrationTransition,
  easings,
} from './motion-variants';

describe('motion-variants', () => {
  describe('pageVariants', () => {
    it('defines initial, animate, and exit states', () => {
      expect(pageVariants.initial).toEqual({ opacity: 0, x: -12 });
      expect(pageVariants.animate).toEqual({ opacity: 1, x: 0 });
      expect(pageVariants.exit).toEqual({ opacity: 0, x: 12 });
    });
  });

  describe('revealVariants', () => {
    it('defines hidden and visible states with vertical offset', () => {
      expect(revealVariants.hidden).toEqual({ opacity: 0, y: 20 });
      expect(revealVariants.visible).toEqual({ opacity: 1, y: 0 });
    });
  });

  describe('containerVariants', () => {
    it('defines stagger timing of 50ms between children', () => {
      expect(containerVariants.hidden).toEqual({});
      const visible = containerVariants.visible as { transition: { staggerChildren: number } };
      expect(visible.transition.staggerChildren).toBe(0.05);
    });
  });

  describe('itemVariants', () => {
    it('defines hidden and visible states with 300ms standard ease', () => {
      expect(itemVariants.hidden).toEqual({ opacity: 0, y: 16 });
      const visible = itemVariants.visible as {
        opacity: number;
        y: number;
        transition: { duration: number; ease: number[] };
      };
      expect(visible.opacity).toBe(1);
      expect(visible.y).toBe(0);
      expect(visible.transition.duration).toBe(0.3);
      expect(visible.transition.ease).toEqual([0.2, 0, 0, 1]);
    });
  });

  describe('stepVariants', () => {
    it('produces correct enter/exit states based on direction', () => {
      const enter = stepVariants.enter as (direction: number) => { x: number; opacity: number };
      const exit = stepVariants.exit as (direction: number) => { x: number; opacity: number };

      // Forward direction (positive): enter from -30, exit to +30
      expect(enter(1)).toEqual({ x: -30, opacity: 0 });
      expect(exit(1)).toEqual({ x: 30, opacity: 0 });

      // Backward direction (negative): enter from +30, exit to -30
      expect(enter(-1)).toEqual({ x: 30, opacity: 0 });
      expect(exit(-1)).toEqual({ x: -30, opacity: 0 });
    });

    it('defines a center state at x=0, fully opaque', () => {
      expect(stepVariants.center).toEqual({ x: 0, opacity: 1 });
    });
  });

  describe('celebrationVariants', () => {
    it('starts at scale 0 and expands to 2.5 while fading', () => {
      expect(celebrationVariants.initial).toEqual({ scale: 0, opacity: 1 });
      expect(celebrationVariants.animate).toEqual({ scale: 2.5, opacity: 0 });
    });
  });

  describe('transition configs', () => {
    it('pageTransition uses 300ms tween with standard ease', () => {
      expect(pageTransition).toEqual({
        type: 'tween',
        duration: 0.3,
        ease: [0.2, 0, 0, 1],
      });
    });

    it('revealTransition uses 400ms with standard ease', () => {
      expect(revealTransition).toEqual({
        duration: 0.4,
        ease: [0.2, 0, 0, 1],
      });
    });

    it('celebrationTransition uses 600ms with spring ease', () => {
      expect(celebrationTransition).toEqual({
        duration: 0.6,
        ease: [0.34, 1.56, 0.64, 1],
      });
    });
  });

  describe('easings', () => {
    it('exports all four named easing arrays', () => {
      expect(easings.standard).toEqual([0.2, 0, 0, 1]);
      expect(easings.emphasized).toEqual([0.2, 0, 0, 1.2]);
      expect(easings.spring).toEqual([0.34, 1.56, 0.64, 1]);
      expect(easings.decelerate).toEqual([0, 0, 0.2, 1]);
    });
  });
});
