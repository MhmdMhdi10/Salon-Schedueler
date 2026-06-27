import { useEffect, useRef } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import {
  Float,
  ContactShadows,
  Environment,
  Lightformer,
  MeshDistortMaterial,
} from '@react-three/drei';
import { Color, MathUtils, type Mesh } from 'three';

/**
 * The salon's signature 3D centerpiece (lazy-loaded, decorative).
 *
 * A high-resolution metallic blob whose **shape morphs with scroll**: scroll
 * progress drives the surface noise distortion, spin, scale, and a rose↔indigo
 * hue shift, lit by a procedural pink/indigo studio environment (built from
 * Lightformers — no HDRI download). All updates are transient (refs in
 * useFrame, no React state) per R3F best practice. Brand hexes mirror the
 * design tokens (`--color-accent`, brand primary).
 *
 * Imported only via `React.lazy` from {@link Salon3DStage}, so three.js lands
 * in its own async chunk and only mounts when WebGL + motion are available.
 */

const ROSE = '#d946ef';
const INDIGO = '#6366f1';

/**
 * Tracks page scroll as a 0..1 progress over roughly the first ~1.2 viewports
 * (where the hero is visible), updated transiently via a ref.
 */
function useScrollTarget() {
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

function MorphingBlob() {
  const mesh = useRef<Mesh>(null);
  // drei's MeshDistortMaterial instance exposes mutable `distort`/`speed`/`color`.
  const material = useRef<any>(null);
  const scrollTarget = useScrollTarget();
  const scroll = useRef(0);
  const colorA = useRef(new Color(ROSE));
  const colorB = useRef(new Color(INDIGO));
  const tmp = useRef(new Color());

  useFrame((state, delta) => {
    // Smoothly damp scroll → buttery morphing.
    scroll.current = MathUtils.damp(scroll.current, scrollTarget.current, 4, delta);
    const s = scroll.current;
    const t = state.clock.elapsedTime;

    if (mesh.current) {
      mesh.current.rotation.y += delta * (0.18 + s * 0.7);
      mesh.current.rotation.x = MathUtils.lerp(mesh.current.rotation.x, s * Math.PI * 0.6, 0.1);
      const pulse = Math.sin(t * 0.7) * 0.03;
      mesh.current.scale.setScalar(1 + pulse + s * 0.18);
    }
    if (material.current) {
      // Morph amount + speed grow with scroll; hue shifts rose → indigo.
      material.current.distort = 0.16 + s * 0.62;
      material.current.speed = 1.1 + s * 2.6;
      material.current.color.copy(tmp.current.copy(colorA.current).lerp(colorB.current, s));
    }
  });

  return (
    <mesh ref={mesh}>
      <sphereGeometry args={[1.5, 128, 128]} />
      <MeshDistortMaterial
        ref={material}
        color={ROSE}
        metalness={0.86}
        roughness={0.12}
        distort={0.16}
        speed={1.1}
      />
    </mesh>
  );
}

function Orb({
  position,
  color,
  scale = 1,
}: {
  position: [number, number, number];
  color: string;
  scale?: number;
}) {
  return (
    <Float speed={3} rotationIntensity={1} floatIntensity={1.4}>
      <mesh position={position} scale={scale}>
        <sphereGeometry args={[0.32, 48, 48]} />
        <meshStandardMaterial color={color} metalness={1} roughness={0.15} />
      </mesh>
    </Float>
  );
}

export default function Salon3D() {
  return (
    <Canvas
      camera={{ position: [0, 0, 5], fov: 42 }}
      dpr={[1, 2]}
      gl={{ antialias: true, alpha: true, powerPreference: 'high-performance' }}
    >
      <ambientLight intensity={0.4} />
      <directionalLight position={[4, 6, 5]} intensity={1.2} />
      <MorphingBlob />
      <Orb position={[2.1, 1.2, -1]} color={ROSE} scale={0.9} />
      <Orb position={[-2.2, -1.1, -0.5]} color={INDIGO} scale={1.1} />
      <ContactShadows position={[0, -2.1, 0]} opacity={0.3} blur={2.8} scale={12} far={4} />
      <Environment resolution={128}>
        <Lightformer intensity={2.4} position={[0, 3, 4]} scale={[8, 8, 1]} color="#ffffff" />
        <Lightformer intensity={1.8} position={[-4, -1, 2]} scale={[5, 5, 1]} color={ROSE} />
        <Lightformer intensity={1.8} position={[4, 1, -3]} scale={[5, 5, 1]} color={INDIGO} />
      </Environment>
    </Canvas>
  );
}
