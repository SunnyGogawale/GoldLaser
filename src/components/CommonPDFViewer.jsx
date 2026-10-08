import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { Download, X } from 'lucide-react'

function CommonPDFViewer({
  isOpen,
  onClose,
  pdfUrl,
  fileName = 'statement.pdf',
  title = 'Statement PDF',
  fullScreen = false,
  isLoading = false,
  error = ''
}) {
  const [viewerStatus, setViewerStatus] = useState('loading')
  const [retryCount, setRetryCount] = useState(0)

  useEffect(() => {
    if (!isOpen) return undefined

    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    return () => {
      document.body.style.overflow = previousOverflow
    }
  }, [isOpen])

  useEffect(() => {
    if (!isOpen || !pdfUrl) return
    setViewerStatus('loading')
  }, [isOpen, pdfUrl, retryCount])

  const handleDownload = () => {
    if (!pdfUrl) return

    const link = document.createElement('a')
    link.href = pdfUrl
    link.download = fileName
    link.rel = 'noopener noreferrer'
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  if (!isOpen) return null

  const hasError = Boolean(error) || viewerStatus === 'error'
  const isPdfLoading = isLoading || !pdfUrl || viewerStatus === 'loading'

  const viewerContent = (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: fullScreen ? 'transparent' : 'rgba(15, 23, 42, 0.75)',
        zIndex: 100000,
        display: 'flex',
        alignItems: fullScreen ? 'stretch' : 'center',
        justifyContent: 'center',
        padding: fullScreen ? 0 : undefined
      }}
      onClick={onClose}
    >
      <div
        style={{
          position: 'relative',
          width: fullScreen ? '100vw' : 'min(720px, 94vw)',
          minHeight: 0,
          height: fullScreen ? '100dvh' : '90vh',
          margin: fullScreen ? 0 : '5vh auto',
          background: '#f8fafc',
          borderRadius: fullScreen ? 0 : '18px',
          border: fullScreen ? 'none' : '1px solid rgba(148, 163, 184, 0.35)',
          boxShadow: fullScreen ? 'none' : '0 18px 40px rgba(15, 23, 42, 0.35)',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column'
        }}
        onClick={(event) => event.stopPropagation()}
      >
        {fullScreen ? (
          <div
            style={{
              position: 'absolute',
              inset: 0,
              background: 'transparent',
              overflow: 'hidden'
            }}
          >
            {pdfUrl && (
              <iframe
                key={`${pdfUrl}-${retryCount}`}
                src={`${pdfUrl}#view=FitH`}
                title={title || fileName}
                onLoad={() => setViewerStatus('loaded')}
                onError={() => setViewerStatus('error')}
                style={{
                  display: 'block',
                  width: '100%',
                  height: '100%',
                  border: 'none',
                  background: '#ffffff',
                  boxShadow: '0 10px 30px rgba(0, 0, 0, 0.35)'
                }}
              />
            )}

            {(hasError || isPdfLoading) && (
              <div
                role={hasError ? 'alert' : 'status'}
                style={{
                  position: 'absolute',
                  inset: 0,
                  zIndex: 1,
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '0.75rem',
                  padding: '1.5rem',
                  background: 'rgba(16, 24, 32, 0.88)',
                  color: '#ffffff',
                  textAlign: 'center',
                  fontSize: '0.95rem',
                  fontWeight: 600
                }}
              >
                {hasError ? error || 'This PDF could not be displayed.' : 'Loading PDF...'}
                {viewerStatus === 'error' && pdfUrl && (
                  <button
                    type="button"
                    onClick={() => {
                      setViewerStatus('loading')
                      setRetryCount((count) => count + 1)
                    }}
                    style={{
                      padding: '0.5rem 0.85rem',
                      border: '1px solid rgba(255, 255, 255, 0.5)',
                      borderRadius: '6px',
                      background: 'rgba(255, 255, 255, 0.12)',
                      color: '#ffffff',
                      cursor: 'pointer',
                      font: 'inherit'
                    }}
                  >
                    Retry
                  </button>
                )}
              </div>
            )}

            <div
              style={{
                position: 'absolute',
                top: '0.75rem',
                right: '0.75rem',
                zIndex: 2,
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem'
              }}
            >
              <button
                type="button"
                aria-label="Download PDF"
                title="Download PDF"
                onClick={handleDownload}
                style={{
                  width: '2.75rem',
                  height: '2.75rem',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  border: '1px solid rgba(255, 255, 255, 0.45)',
                  borderRadius: '50%',
                  background: 'rgba(16, 24, 32, 0.78)',
                  color: '#ffffff',
                  cursor: 'pointer',
                  opacity: 1,
                  pointerEvents: 'auto'
                }}
              >
                <Download size={19} />
              </button>
              <button
                type="button"
                aria-label="Close PDF viewer"
                title="Close PDF viewer"
                onClick={onClose}
                style={{
                  width: '2.75rem',
                  height: '2.75rem',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  border: '1px solid rgba(255, 255, 255, 0.45)',
                  borderRadius: '50%',
                  background: 'rgba(16, 24, 32, 0.78)',
                  color: '#ffffff',
                  cursor: 'pointer'
                }}
              >
                <X size={20} />
              </button>
            </div>
          </div>
        ) : (
          <>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '0.75rem',
                padding: '1rem 1.25rem',
                borderBottom: '1px solid #e5e7eb',
                background: '#ffffff'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', minWidth: 0 }}>
            <button
              type="button"
              aria-label="Close PDF viewer"
              onClick={onClose}
              style={{
                border: 'none',
                background: 'rgba(15, 23, 42, 0.06)',
                color: '#0f172a',
                width: '2.5rem',
                height: '2.5rem',
                borderRadius: '999px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer'
              }}
            >
              <X size={20} />
            </button>
            <div style={{ minWidth: 0 }}>
              <h2
                style={{
                  margin: 0,
                  color: '#0f172a',
                  fontSize: '1rem',
                  fontWeight: 800,
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis'
                }}
              >
                {title || fileName}
              </h2>
            </div>
          </div>

              <button
                type="button"
                aria-label="Download PDF"
                onClick={handleDownload}
                style={{
                  border: 'none',
                  background: 'rgba(15, 23, 42, 0.06)',
                  color: '#0f172a',
                  width: '2.5rem',
                  height: '2.5rem',
                  borderRadius: '999px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer',
                  opacity: 1,
                  pointerEvents: 'auto'
                }}
              >
                <Download size={18} />
              </button>
            </div>

            <div
              style={{
                flex: 1,
                background: '#e2e8f0',
                overflow: 'auto',
                position: 'relative',
                padding: '0.85rem',
                display: 'flex',
                minHeight: 0,
                alignItems: 'center',
                justifyContent: 'center'
              }}
            >
              {pdfUrl && (
                <iframe
                  key={`${pdfUrl}-${retryCount}`}
                  src={`${pdfUrl}#view=Fit`}
                  title={title || fileName}
                  onLoad={() => setViewerStatus('loaded')}
                  onError={() => setViewerStatus('error')}
                  style={{
                    width: 'auto',
                    maxWidth: '100%',
                    minHeight: 0,
                    height: '100%',
                    aspectRatio: '210 / 297',
                    flex: '0 1 auto',
                    border: 'none',
                    display: 'block',
                    background: '#ffffff',
                    boxShadow: '0 8px 24px rgba(15, 23, 42, 0.08)',
                    borderRadius: '12px'
                  }}
                />
              )}
              {(hasError || isPdfLoading) && (
                <div
                  role={hasError ? 'alert' : 'status'}
                  style={{
                    position: 'absolute',
                    inset: '0.85rem',
                    zIndex: 1,
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '0.75rem',
                    padding: '1.5rem',
                    background: 'rgba(248, 250, 252, 0.94)',
                    color: '#0f172a',
                    textAlign: 'center',
                    fontSize: '0.95rem',
                    fontWeight: 600
                  }}
                >
                  {hasError ? error || 'This PDF could not be displayed.' : 'Loading PDF...'}
                  {viewerStatus === 'error' && pdfUrl && (
                    <button
                      type="button"
                      onClick={() => {
                        setViewerStatus('loading')
                        setRetryCount((count) => count + 1)
                      }}
                      style={{
                        padding: '0.5rem 0.85rem',
                        border: '1px solid #cbd5e1',
                        borderRadius: '6px',
                        background: '#ffffff',
                        color: '#0f172a',
                        cursor: 'pointer',
                        font: 'inherit'
                      }}
                    >
                      Retry
                    </button>
                  )}
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  )

  return createPortal(viewerContent, document.body)
}

export default CommonPDFViewer
