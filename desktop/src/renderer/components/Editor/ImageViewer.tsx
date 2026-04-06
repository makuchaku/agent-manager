import { useEffect, useState, useCallback } from 'react'
import styles from './ImageViewer.module.css'

interface Props {
  filePath: string
}

/** Zoom level presets */
const ZOOM_PRESETS = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 2, 3, 4]

export function ImageViewer({ filePath }: Props) {
  const [dataUrl, setDataUrl] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [zoomLevel, setZoomLevel] = useState(1)
  const [imageDimensions, setImageDimensions] = useState<{ width: number; height: number } | null>(null)
  const [isDragging, setIsDragging] = useState(false)
  const [panOffset, setPanOffset] = useState({ x: 0, y: 0 })

  useEffect(() => {
    let cancelled = false
    setError(null)
    setDataUrl(null)

    window.api.fs.readFileBinary(filePath)
      .then((base64: string) => {
        if (cancelled) return
        
        // Determine MIME type from extension
        const ext = filePath.split('.').pop()?.toLowerCase() || ''
        const mimeType = getMimeType(ext)
        
        setDataUrl(`data:${mimeType};base64,${base64}`)
      })
      .catch((err: Error) => {
        if (!cancelled) {
          setError(err.message || 'Failed to load image')
        }
      })

    return () => { cancelled = true }
  }, [filePath])

  if (error) {
    return (
      <div className={styles.imageContainer}>
        <div className={styles.error}>
          <span className={styles.errorIcon}>
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
              <circle cx="8.5" cy="8.5" r="1.5"/>
              <polyline points="21 15 16 10 5 21"/>
            </svg>
          </span>
          <span>Failed to load image: {error}</span>
        </div>
      </div>
    )
  }

  if (!dataUrl) {
    return (
      <div className={styles.imageContainer}>
        <div className={styles.loading}>Loading image...</div>
      </div>
    )
  }

  return (
    <div className={styles.imageContainer}>
      <div className={styles.imageWrapper}>
        <img 
          src={dataUrl} 
          alt={filePath.split('/').pop() || 'Image'} 
          className={styles.image}
        />
      </div>
    </div>
  )
}

  const handleZoomIn = useCallback(() => {
    setZoomLevel(z => {
      const next = ZOOM_PRESETS.find(preset => preset > z) || z
      return next
    })
  }, [])

  const handleZoomOut = useCallback(() => {
    setZoomLevel(z => {
      const prev = [...ZOOM_PRESETS].reverse().find(preset => preset < z) || z
      return prev
    })
  }, [])

  const handleFitToWindow = useCallback(() => {
    setZoomLevel(1)
    setPanOffset({ x: 0, y: 0 })
  }, [])

  function getMimeType(ext: string): string {
    const mimeMap: Record<string, string> = {
      png: 'image/png',
      jpg: 'image/jpeg',
      jpeg: 'image/jpeg',
      gif: 'image/gif',
      webp: 'image/webp',
      bmp: 'image/bmp',
      ico: 'image/x-icon',
      icns: 'image/icns',
      tiff: 'image/tiff',
      tif: 'image/tiff',
      svg: 'image/svg+xml',
    }
    return mimeMap[ext] || 'image/png'
  }
  return mimeMap[ext] || 'image/png'
}
