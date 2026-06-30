import { createPortal } from 'react-dom'

function ActionMenuPortal({ children }) {
  if (typeof document === 'undefined') return null
  return createPortal(children, document.body)
}

export default ActionMenuPortal
