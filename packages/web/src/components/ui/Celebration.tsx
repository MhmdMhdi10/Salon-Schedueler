import { motion, useReducedMotion } from 'framer-motion';
import { celebrationVariants, celebrationTransition, easings } from '../../lib/motion-variants';

/**
 * Expanding ring burst animation for the booking success celebration.
 *
 * Renders an expanding circle that scales from 0 to 2.5× while fading out,
 * creating a dramatic burst-ring effect. Uses the spring-like easing curve
 * (`--ease-spring`) and `--dur-celebration` timing from the token system.
 *
 * Under `prefers-reduced-motion: reduce`, returns null — the ring is purely
 * decorative and non-essential. Only animates compositor-friendly properties
 * (transform + opacity).
 */
export function CelebrationRing() {
  const prefersReduced = useReducedMotion();
  if (prefersReduced) return null;

  return (
    <motion.div
      className="absolute inset-0 flex items-center justify-center pointer-events-none"
      aria-hidden="true"
      variants={celebrationVariants}
      initial="initial"
      animate="animate"
      transition={celebrationTransition}
    >
      <div className="h-24 w-24 rounded-full border-4 border-primary" />
    </motion.div>
  );
}

// ─── Confetti Particles ──────────────────────────────────────────────────────

/** Number of particles in the burst */
const PARTICLE_COUNT = 10;

/** Generate a seeded particle config for consistent rendering */
function generateParticles() {
  return Array.from({ length: PARTICLE_COUNT }, (_, i) => {
    const angle = (i / PARTICLE_COUNT) * 2 * Math.PI + (i % 2 === 0 ? 0.2 : -0.2);
    const distance = 60 + (i % 3) * 20; // 60–100px radial distance
    return {
      id: i,
      x: Math.cos(angle) * distance,
      y: Math.sin(angle) * distance,
      delay: (i % 4) * 0.04, // slight stagger within the burst
    };
  });
}

const particles = generateParticles();

/**
 * Confetti particle burst for the booking success celebration.
 *
 * Renders 10 small brand-accent dots that burst outward radially
 * from center and fade out. Each particle gets a deterministic direction
 * (angle) and distance, with a small stagger for a natural burst feel.
 *
 * Under `prefers-reduced-motion: reduce`, returns null — particles are
 * purely decorative. Only animates compositor-friendly properties
 * (transform + opacity).
 */
export function ConfettiParticles() {
  const prefersReduced = useReducedMotion();
  if (prefersReduced) return null;

  return (
    <div
      className="absolute inset-0 flex items-center justify-center pointer-events-none"
      aria-hidden="true"
    >
      {particles.map((particle) => (
        <motion.span
          key={particle.id}
          className={particle.id % 2 === 0 ? 'absolute h-2 w-2 rounded-full bg-primary' : 'absolute h-2 w-2 rounded-full bg-accent'}
          initial={{ scale: 0, opacity: 1, x: 0, y: 0 }}
          animate={{
            scale: [0, 1.2, 0.8],
            opacity: [1, 1, 0],
            x: particle.x,
            y: particle.y,
          }}
          transition={{
            duration: 0.6, // --dur-celebration
            ease: easings.spring,
            delay: particle.delay,
          }}
        />
      ))}
    </div>
  );
}
