import { forwardRef } from 'react'
import { motion } from 'motion/react'

const MotionButton = forwardRef(function MotionButton(
  {
    children,
    disabled = false,
    whileHover,
    whileTap,
    transition,
    style,
    ...props
  },
  ref
) {
  const interactiveHover = whileHover ?? { scale: 1.02, y: -1 }
  const interactiveTap = whileTap ?? { scale: 0.98 }

  return (
    <motion.button
      ref={ref}
      disabled={disabled}
      whileHover={disabled ? undefined : interactiveHover}
      whileTap={disabled ? undefined : interactiveTap}
      transition={transition ?? { type: 'spring', stiffness: 420, damping: 24 }}
      style={{
        transformOrigin: 'center',
        ...style
      }}
      {...props}
    >
      {children}
    </motion.button>
  )
})

export default MotionButton
