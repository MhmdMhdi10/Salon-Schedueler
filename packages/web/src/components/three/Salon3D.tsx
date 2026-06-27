import { useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import {
  Float,
  ContactShadows,
  Environment,
  Lightformer,
  PerformanceMonitor,
} from '@react-three/drei';
import {
  BufferGeometry,
  Color,
  DoubleSide,
  Float32BufferAttribute,
  MathUtils,
  Object3D,
  type InstancedMesh,
  type Group,
} from 'three';

/**
 * The salon's signature 3D centerpiece (lazy-loaded, decorative): a **rose that
 * blooms as you scroll** — because the salon is «سالن رز» (Rose Salon), so the
 * hero object *is* the brand, not a generic showpiece.
 *
 * The flower is built procedurally (no model/asset download): ~48 petals are
 * arranged by the golden angle (phyllotaxis, like a real rose) on a single
 * `InstancedMesh`. Scroll progress over the hero drives the **bloom** — petals
 * rotate from a tight bud (closed) to a full open rose, outer layers splaying
 * more than the inner ones — plus a gentle spin and a restrained camera dolly.
 * A few rose petals drift in the air around it.
 *
 * What keeps it production-grade:
 *
 *  - **Theme-aware.** Petal hues come from the design-token CSS custom
 *    properties (`--color-accent` deep rose → a lighter blush at the rim) and
 *    re-read when `data-theme` flips — never a hard-coded brand hex (ui-ux §2).
 *  - **Battery-aware.** The host ({@link Salon3DStage}) parks the render loop
 *    (`frameloop="never"`) once the canvas scrolls off screen, so the GPU idles
 *    while the visitor reads the page (ui-ux §12).
 *  - **Device-aware.** DPR auto-scales via `PerformanceMonitor`, and the petal
 *    count drops on coarse-pointer (touch) devices — QR traffic is phones
 *    (ui-ux §5). On WebGL context loss it degrades to the static gradient.
 *
 * Per-frame work is transient (instance matrices in `useFrame`, no React state)
 * per R3F best practice. Loaded only via `React.lazy` so three.js stays in its
 * own async chunk, and the whole subtree is `aria-hidden` (purely decorative).
 */

/** Brand color triad, read live from the design-token CSS custom properties. */
interface BrandColors {
  /** `--color-accent` — deep rose (petal core + key light). */
  accent: string;
  /** `--color-primary` — indigo (rim light / atmosphere). */
  primary: string;
  /** `--color-secondary` — teal (cool fill light). */
  secondary: string;
}

/** Token defaults mirrored from `styles/tokens.css` (used pre-paint / in SSR). */
const FALLBACK_COLORS: BrandColors = {
  accent: '#d946ef',
  primary: '#6366f1',
  secondary: '#0ea5a4',
};

/** Reads the current brand tokens off `:root` (falls back outside the DOM). */
function readBrandColors(): BrandColors {
  if (typeof window === 'undefined' || typeof getComputedStyle !== 'function') {
    return FALLBACK_COLORS;
  }
  const cs = getComputedStyle(document.documentElement);
  const pick = (name: string, fallback: string) => cs.getPropertyValue(name).trim() || fallback;
  return {
    accent: pick('--color-accent', FALLBACK_COLORS.accent),
    primary: pick('--color-primary', FALLBACK_COLORS.primary),
    secondary: pick('--color-secondary', FALLBACK_COLORS.secondary),
  };
}

/** Reads brand tokens once and re-reads whenever the theme attribute flips. */
function useBrandColors(): BrandColors {
  const [colors, setColors] = useState<BrandColors>(readBrandColors);
  useEffect(() => {
    setColors(readBrandColors());
    const observer = new MutationObserver(() => setColors(readBrandColors()));
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-theme'],
    });
    return () => observer.disconnect();
  }, []);
  return colors;
}

/**
 * Tracks page scroll as a 0..1 progress over roughly the first ~1.1 viewports
 * (where the hero is visible), updated transiently via a ref so it never
 * triggers a React render.
 */
function useScrollProgress() {
  const target = useRef(0);
  useEffect(() => {
    const update = () => {
      const range = window.innerHeight * 1.1;
      target.current = range > 0 ? MathUtils.clamp(window.scrollY / range, 0, 1) : 0;
    };
    update();
    window.addEventListener('scroll', update, { passive: true });
    window.addEventListener('resize', update);
    return () => {
      window.removeEventListener('scroll', update);
      window.removeEventListener('resize', update);
    };
  }, []);
  return target;
}

/**
 * Builds one rose-petal surface as a `BufferGeometry` (shared by every petal
 * instance). The petal grows from a narrow base (y=0) to a rounded tip (y=1),
 * is cupped across its width, and curls outward toward the tip — the silhouette
 * reads as a petal from any angle. Pure geometry; no textures.
 */
function createPetalGeometry(): BufferGeometry {
  const SEG_A = 16; // along the length (base → tip)
  const SEG_B = 12; // across the width
  const length = 1;
  const width = 0.46;
  const cup = 0.55; // concave cross-section
  const curl = 0.4; // tip leans outward
  const positions: number[] = [];
  const indices: number[] = [];

  for (let ia = 0; ia <= SEG_A; ia++) {
    const a = ia / SEG_A;
    // Wide through the upper-middle, pinched at base and tip → petal outline.
    const halfWidth = width * Math.pow(Math.sin(Math.PI * a), 0.7) * (0.55 + 0.45 * a);
    for (let ib = 0; ib <= SEG_B; ib++) {
      const b = (ib / SEG_B) * 2 - 1;
      const x = b * halfWidth;
      const y = a * length;
      const z = -cup * (b * b) * (0.3 + 0.7 * a) + curl * (a * a);
      positions.push(x, y, z);
    }
  }

  const cols = SEG_B + 1;
  for (let ia = 0; ia < SEG_A; ia++) {
    for (let ib = 0; ib < SEG_B; ib++) {
      const i0 = ia * cols + ib;
      const i1 = i0 + 1;
      const i2 = i0 + cols;
      const i3 = i2 + 1;
      indices.push(i0, i2, i1, i1, i2, i3);
    }
  }

  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

interface Petal {
  azimuth: number;
  t: number;
  scale: number;
  closed: number;
  open: number;
  twist: number;
  phase: number;
  yOff: number;
}

/** Precomputes static per-petal placement using the golden-angle spiral. */
function buildPetals(count: number): Petal[] {
  const GOLDEN = Math.PI * (3 - Math.sqrt(5)); // ~137.5°
  return Array.from({ length: count }, (_, i) => {
    const t = count > 1 ? i / (count - 1) : 0; // 0 = core, 1 = rim
    return {
      azimuth: i * GOLDEN,
      t,
      scale: 0.5 + t * 0.85,
      closed: 0.06 + t * 0.35, // tight bud
      open: 0.45 + t * 1.05, // splayed rose (outer petals open more)
      twist: Math.sin(i * 1.3) * 0.22, // organic asymmetry
      phase: (i % 7) / 7,
      yOff: (1 - t) * 0.16, // inner petals sit a touch higher
    };
  });
}

function Rose({
  colors,
  count,
  geometry,
}: {
  colors: BrandColors;
  count: number;
  geometry: BufferGeometry;
}) {
  const mesh = useRef<InstancedMesh>(null);
  const scrollTarget = useScrollProgress();
  const bloom = useRef(0);
  const petals = useMemo(() => buildPetals(count), [count]);
  const dummy = useMemo(() => new Object3D(), []);
  const { camera } = useThree();

  // Per-instance color: deep rose at the core → lighter blush at the rim.
  // Re-applied whenever the brand tokens (theme) change.
  useEffect(() => {
    const node = mesh.current;
    if (!node) return;
    const core = new Color(colors.accent);
    const rim = new Color(colors.accent).lerp(new Color('#ffffff'), 0.55);
    const tmp = new Color();
    petals.forEach((p, i) => node.setColorAt(i, tmp.copy(core).lerp(rim, p.t)));
    if (node.instanceColor) node.instanceColor.needsUpdate = true;
  }, [colors, petals]);

  useFrame((state, delta) => {
    const dt = Math.min(delta, 1 / 30);
    bloom.current = MathUtils.damp(bloom.current, scrollTarget.current, 3.5, dt);
    const b = bloom.current;
    const node = mesh.current;
    if (!node) return;
    const time = state.clock.elapsedTime;

    for (let i = 0; i < petals.length; i++) {
      const p = petals[i];
      const breathe = Math.sin(time * 0.6 + p.phase * 6.28) * 0.015 * (0.3 + b);
      const pitch = MathUtils.lerp(p.closed, p.open, b) + breathe;
      dummy.position.set(0, p.yOff * (1 - 0.4 * b), 0);
      dummy.rotation.set(0, 0, 0);
      dummy.rotateY(p.azimuth + b * 0.18); // slight swirl as it opens
      dummy.rotateX(pitch);
      dummy.rotateZ(p.twist);
      dummy.scale.setScalar(p.scale * (0.85 + 0.15 * b));
      dummy.updateMatrix();
      node.setMatrixAt(i, dummy.matrix);
    }
    node.instanceMatrix.needsUpdate = true;

    // Whole-flower presentation: a slow turn + a gentle nod that settles open.
    node.rotation.y = time * 0.12;
    node.rotation.z = Math.sin(time * 0.4) * 0.05 + b * 0.08;

    camera.position.z = MathUtils.damp(camera.position.z, 5 - b * 0.5, 3, dt);
    camera.lookAt(0, 0, 0);
  });

  return (
    <instancedMesh ref={mesh} args={[geometry, undefined, count]} position={[0, -0.35, 0]}>
      <meshPhysicalMaterial
        color="#ffffff"
        roughness={0.5}
        metalness={0}
        sheen={0.7}
        sheenRoughness={0.45}
        sheenColor={colors.accent}
        clearcoat={0.15}
        side={DoubleSide}
        envMapIntensity={1.1}
      />
    </instancedMesh>
  );
}

interface Drifter {
  position: [number, number, number];
  scale: number;
  rotation: [number, number, number];
}

/** A few rose petals drifting in the air around the bloom (reuses the geo). */
function PetalDust({
  colors,
  geometry,
  count,
}: {
  colors: BrandColors;
  geometry: BufferGeometry;
  count: number;
}) {
  const drifters = useMemo<Drifter[]>(() => {
    // Deterministic-enough scatter computed once (not per render).
    return Array.from({ length: count }, (_, i) => {
      const angle = (i / count) * Math.PI * 2 + i;
      const radius = 2 + (i % 3) * 0.5;
      return {
        position: [Math.cos(angle) * radius, Math.sin(i * 1.7) * 1.6, -0.5 - (i % 4) * 0.4],
        scale: 0.32 + (i % 3) * 0.06,
        rotation: [Math.sin(i) * Math.PI, Math.cos(i * 0.7) * Math.PI, Math.sin(i * 2) * 0.5],
      };
    });
  }, [count]);

  return (
    <group>
      {drifters.map((d, i) => (
        <Float key={i} speed={2} rotationIntensity={2.4} floatIntensity={1.8}>
          <mesh geometry={geometry} position={d.position} scale={d.scale} rotation={d.rotation}>
            <meshStandardMaterial
              color={colors.accent}
              roughness={0.6}
              metalness={0}
              side={DoubleSide}
            />
          </mesh>
        </Float>
      ))}
    </group>
  );
}

function Scene({ colors }: { colors: BrandColors }) {
  const coarse =
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(pointer: coarse)').matches;
  const petalCount = coarse ? 30 : 48;
  const dustCount = coarse ? 4 : 7;

  // One shared petal geometry for the bloom + the drifting petals; disposed on
  // unmount (the Canvas tears down together, so the shared handle is safe).
  const geometry = useMemo(() => createPetalGeometry(), []);
  useEffect(() => () => geometry.dispose(), [geometry]);

  const group = useRef<Group>(null);
  useFrame((state) => {
    // A soft entrance: the whole arrangement breathes very slightly.
    if (group.current) {
      group.current.position.y = Math.sin(state.clock.elapsedTime * 0.5) * 0.04;
    }
  });

  return (
    <group ref={group}>
      <ambientLight intensity={0.45} />
      <directionalLight position={[4, 6, 5]} intensity={1.1} />
      <Rose colors={colors} count={petalCount} geometry={geometry} />
      <PetalDust colors={colors} geometry={geometry} count={dustCount} />
      <ContactShadows position={[0, -1.9, 0]} opacity={0.28} blur={2.8} scale={11} far={4} />
      <Environment resolution={128}>
        <Lightformer intensity={2.2} position={[0, 3, 4]} scale={[8, 8, 1]} color="#ffffff" />
        <Lightformer
          intensity={1.8}
          position={[-4, -1, 2]}
          scale={[5, 5, 1]}
          color={colors.accent}
        />
        <Lightformer
          intensity={1.6}
          position={[4, 1, -3]}
          scale={[5, 5, 1]}
          color={colors.primary}
        />
        <Lightformer
          intensity={1.2}
          position={[0, -3, 1]}
          scale={[6, 6, 1]}
          color={colors.secondary}
        />
      </Environment>
    </group>
  );
}

export default function Salon3D({
  active = true,
  onContextLost,
}: {
  active?: boolean;
  /** Called once if the WebGL context is lost (e.g. GPU memory pressure on a
   *  phone) so the host can revert to the static gradient instead of freezing. */
  onContextLost?: () => void;
}) {
  const colors = useBrandColors();
  // DPR is clamped to [1,2] and auto-scaled down by PerformanceMonitor when the
  // device can't sustain the frame rate (keeps INP/FPS healthy on mobile).
  const [dpr, setDpr] = useState(1.75);

  return (
    <Canvas
      frameloop={active ? 'always' : 'never'}
      camera={{ position: [0, 0, 5], fov: 42 }}
      dpr={dpr}
      gl={{ antialias: true, alpha: true, powerPreference: 'high-performance' }}
      onCreated={({ gl }) => {
        // Degrade gracefully on GPU context loss (common on low-memory mobile):
        // suppress the browser's default "broken canvas", and let the host swap
        // back to the static gradient fallback.
        gl.domElement.addEventListener(
          'webglcontextlost',
          (event) => {
            event.preventDefault();
            onContextLost?.();
          },
          { once: true },
        );
      }}
    >
      <PerformanceMonitor onDecline={() => setDpr(1)} onIncline={() => setDpr(2)}>
        <Scene colors={colors} />
      </PerformanceMonitor>
    </Canvas>
  );
}
