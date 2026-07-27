/**
 * Ambient type declarations for anime.js v4 (dynamic import in SalonProfilePage).
 *
 * Only the subset of the API actually used is typed here. anime.js v4 does not
 * ship its own DefinitelyTyped package yet, so we provide a minimal shim.
 */
declare module 'animejs' {
  export interface AnimationParams {
    opacity?: [number, number] | number;
    y?: [number, number] | number;
    x?: [number, number] | number;
    scale?: [number, number] | number;
    draw?: [string, string];
    delay?: number | ReturnType<typeof stagger>;
    duration?: number;
    ease?: string;
    autoplay?: unknown;
    onUpdate?: () => void;
    /** Allow arbitrary animated properties (e.g. `v` for counting). */
    [key: string]: unknown;
  }

  export interface ScopeInstance {
    revert: () => void;
    add: (fn: () => void) => ScopeInstance;
  }

  export interface ScrollObserverParams {
    target: HTMLElement | SVGElement;
    enter?: { target: string; container: string };
    leave?: { target: string; container: string };
    sync?: number;
  }

  export interface DrawableResult {
    0: unknown;
    length: number;
  }

  export function animate(targets: unknown, params: AnimationParams): unknown;

  export function createScope(opts: { root: React.RefObject<HTMLElement | null> }): ScopeInstance;

  export function stagger(value: number): unknown;

  export function onScroll(params: ScrollObserverParams): unknown;

  export const svg: {
    createDrawable(el: SVGElement): [unknown];
  };
}
