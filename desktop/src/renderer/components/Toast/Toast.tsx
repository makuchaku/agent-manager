import { useEffect, useState } from 'react'
import { useAppStore } from '../../store/app-store'
import type { Toast } from '../../store/types'
import styles from './Toast.module.css'

function ToastItem({ toast }: { toast: Toast }) {
  const dismissToast = useAppStore((s) => s.dismissToast)
  const [progress, setProgress] = useState(100)

  useEffect(() => {
    const duration = 5000
    const interval = 50 // Update every 50ms
    const step = 100 / (duration / interval)
    
    const progressTimer = setInterval(() => {
      setProgress(p => Math.max(0, p - step))
    }, interval)
    
    const timer = setTimeout(() => dismissToast(toast.id), duration)
    return () => {
      clearTimeout(timer)
      clearInterval(progressTimer)
    }
  }, [toast.id, dismissToast])

  return (
    <div
      className={`${styles.toast} ${styles[toast.type]}`}
      onClick={() => dismissToast(toast.id)}
    >
      <span className={styles.message}>{toast.message}</span>
      <div className={styles.progressBar} style={{ width: `${progress}%` }} />
    </div>
  )
}

export function ToastContainer() {
  const toasts = useAppStore((s) => s.toasts)
  if (toasts.length === 0) return null

  return (
    <div className={styles.container}>
      {toasts.map((t) => (
        <ToastItem key={t.id} toast={t} />
      ))}
    </div>
  )
}
