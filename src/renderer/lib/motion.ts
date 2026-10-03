import type { Transition } from 'motion/react'

/** One spring family for the whole app, so every recontextualization feels related */
export const spring = {
  snappy: { type: 'spring', stiffness: 520, damping: 38, mass: 0.7 } as Transition,
  bouncy: { type: 'spring', stiffness: 380, damping: 24, mass: 0.85 } as Transition,
  gentle: { type: 'spring', stiffness: 200, damping: 28, mass: 1 } as Transition,
  layout: { type: 'spring', stiffness: 300, damping: 30, mass: 0.9 } as Transition,
}

export const pop = {
  initial: { opacity: 0, scale: 0.86, y: 12 },
  animate: { opacity: 1, scale: 1, y: 0 },
  exit: { opacity: 0, scale: 0.9, y: 8 },
}

export const sheet = {
  initial: { opacity: 0, scale: 0.94, y: 24, filter: 'blur(8px)' },
  animate: { opacity: 1, scale: 1, y: 0, filter: 'blur(0px)' },
  exit: { opacity: 0, scale: 0.96, y: 16, filter: 'blur(6px)' },
}
