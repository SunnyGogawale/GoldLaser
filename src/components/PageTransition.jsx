import { motion } from 'motion/react'
import { pageMotionProps } from './motionProps'

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
