export const drawPdfCompanyLogo = (doc, logoData, x, y, width, height, backgroundColor) => {
  const formatMatch = /^data:image\/(png|jpe?g);base64,/i.exec(String(logoData || ''))
  if (!formatMatch) return false

  try {
    const image = doc.getImageProperties(logoData)
    if (!(image.width > 0 && image.height > 0)) return false

    const padding = 1
    const availableWidth = width - padding * 2
    const availableHeight = height - padding * 2
    const scale = Math.min(availableWidth / image.width, availableHeight / image.height)
    const imageWidth = image.width * scale
    const imageHeight = image.height * scale

    doc.setFillColor(...backgroundColor)
    doc.roundedRect(x, y, width, height, 2, 2, 'F')
    doc.addImage(
      logoData,
      formatMatch[1].toLowerCase() === 'png' ? 'PNG' : 'JPEG',
      x + (width - imageWidth) / 2,
      y + (height - imageHeight) / 2,
      imageWidth,
      imageHeight,
      undefined,
      'FAST'
    )
    return true
  } catch {
    return false
  }
}