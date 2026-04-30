/* Shared motion / animation constants used across the billing UI (and beyond). */

/** Exponential easing for natural deceleration */
export const easeOutQuart = [0.25, 1, 0.5, 1] as const

export const staggerContainer = {
  hidden: {},
  show: {
    transition: {
      staggerChildren: 0.06,
    },
  },
}

export const staggerItem = {
  hidden: { opacity: 0, y: 10 },
  show: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.4, ease: easeOutQuart },
  },
}
