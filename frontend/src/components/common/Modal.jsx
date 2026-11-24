import { useEffect, useId, useRef } from 'react'
import { X } from 'lucide-react'
import './modal.css'

export default function Modal({ title, subtitle, busy = false, onClose, children }) {
  const ref = useRef(null), titleId = useId()
  useEffect(() => {
    const dialog = ref.current
    dialog.showModal()
    dialog.querySelector('[data-autofocus]')?.focus()
    return () => dialog.close()
  }, [])
  return <dialog ref={ref} className="app-modal" aria-labelledby={titleId} aria-busy={busy} onCancel={event => { event.preventDefault(); if (!busy) onClose() }}>
    <header className="modal-heading"><div><h2 id={titleId}>{title}</h2>{subtitle && <p>{subtitle}</p>}</div><button type="button" aria-label="Đóng hộp thoại" disabled={busy} onClick={onClose}><X size={19} /></button></header>
    {children}
  </dialog>
}
