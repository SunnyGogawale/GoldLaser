export function getActionDropdownPosition({
  rect,
  dropdownWidth = 140,
  dropdownHeight = 120,
  offset = 4,
  viewportPadding = 8
}) {
  const maxLeft = Math.max(viewportPadding, window.innerWidth - dropdownWidth - viewportPadding)
  const maxTop = Math.max(viewportPadding, window.innerHeight - dropdownHeight - viewportPadding)
  const shouldOpenUp = rect.bottom + dropdownHeight + offset > window.innerHeight - viewportPadding

  const preferredTop = shouldOpenUp
    ? rect.top - offset - dropdownHeight
    : rect.bottom + offset
  const preferredLeft = rect.right - dropdownWidth

  return {
    top: Math.min(Math.max(preferredTop, viewportPadding), maxTop),
    left: Math.min(Math.max(preferredLeft, viewportPadding), maxLeft),
    shouldOpenUp
  }
}
