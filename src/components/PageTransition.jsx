import { motion } from 'motion/react'

export const pageMotionProps = {
  initial: { opacity: 0, y: 18, filter: 'blur(6px)' },
  animate: { opacity: 1, y: 0, filter: 'blur(0px)' },
  exit: { opacity: 0, y: -12, filter: 'blur(4px)' },
  transition: { duration: 0.24, ease: 'easeOut' }
}

export const overlayMotionProps = {
  initial: { opacity: 0 },
  animate: { opacity: 1 },
  exit: { opacity: 0 },
  transition: { duration: 0.2, ease: 'easeOut' }
}

export const modalMotionProps = {
  initial: { opacity: 0, y: 24, scale: 0.98 },
  animate: { opacity: 1, y: 0, scale: 1 },
  exit: { opacity: 0, y: 16, scale: 0.98 },
  transition: { duration: 0.24, ease: 'easeOut' }
}

function PageTransition({ children, className, style }) {
  return (
    <motion.div
      className={className}
      style={{ minHeight: '100%', ...style }}
      {...pageMotionProps}
    >
      {children}
    </motion.div>
  )
}

export default PageTransition
