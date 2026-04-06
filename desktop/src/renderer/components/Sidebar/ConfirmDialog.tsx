import { useCallback, useEffect, useState } from 'react'
import styles from './ConfirmDialog.module.css'

interface Props {
  title: string
  message: string
  confirmLabel?: string
  onConfirm: () => void
  onCancel: () => void
  destructive?: boolean
}

export function ConfirmDialog({ title, message, confirmLabel = 'Delete', onConfirm, onCancel, destructive = false }: Props) {
  const [countdown, setCountdown] = useState(3)
  const [canConfirm, setCanConfirm] = useState(!destructive)
  
  // Countdown for destructive actions
  useEffect(() => {
    if (!destructive || countdown === 0) {
      setCanConfirm(true)
      return
    }
    
    const timer = setInterval(() => {
      setCountdown(c => {
        if (c <= 1) {
          setCanConfirm(true)
          return 0
        }
        return c - 1
      })
    }, 1000)
    
    return () => clearInterval(timer)
  }, [destructive, countdown])
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.key === 'Escape') onCancel()
    if (e.key === 'Enter') onConfirm()
  }, [onConfirm, onCancel])

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [handleKeyDown])

  return (
    <div className={styles.overlay} onClick={onCancel}>
      <div className={styles.dialog} onClick={(e) => e.stopPropagation()}>
        <div className={styles.title}>{title}</div>
        <div className={styles.message}>{message}</div>
        <div className={styles.tip}>Tip: Hold ⇧ Shift while deleting to skip this dialog</div>
        <div className={styles.actions}>
          <button className={styles.cancelBtn} onClick={onCancel}>Cancel</button>
          <button
            className={destructive ? styles.destructiveBtn : styles.confirmBtn}
            onClick={onConfirm}
            autoFocus
            disabled={!canConfirm}
          >
            {canConfirm ? confirmLabel : `${confirmLabel} (${countdown}s)`}
          </button>
        </div>
      </div>
    </div>
  )
}
