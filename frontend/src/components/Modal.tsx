import { useEffect, type ReactNode } from 'react'
import Icon from './Icon'

interface ModalProps {
  titulo: string
  subtitulo?: string
  onCerrar: () => void
  children: ReactNode
  /** Botones del pie. Se alinean a la derecha. */
  acciones?: ReactNode
  ancho?: string
}

export default function Modal({
  titulo,
  subtitulo,
  onCerrar,
  children,
  acciones,
  ancho = 'max-w-[560px]',
}: ModalProps) {
  // Escape cierra, y se bloquea el scroll de fondo para que no se desplace detrás.
  useEffect(() => {
    const cerrar = (e: KeyboardEvent) => e.key === 'Escape' && onCerrar()
    window.addEventListener('keydown', cerrar)

    const previo = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    return () => {
      window.removeEventListener('keydown', cerrar)
      document.body.style.overflow = previo
    }
  }, [onCerrar])

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto p-md">
      <div className="fixed inset-0 bg-black/60 backdrop-blur-sm" onClick={onCerrar} />

      <div
        role="dialog"
        aria-modal="true"
        aria-label={titulo}
        className={`relative w-full ${ancho} my-xl data-card rounded-xl shadow-2xl`}
      >
        <div className="flex items-start justify-between gap-md p-lg border-b border-white/5">
          <div>
            <h2 className="text-body-lg text-ink">{titulo}</h2>
            {subtitulo && <p className="text-body-sm text-ink-faint mt-xs">{subtitulo}</p>}
          </div>
          <button
            onClick={onCerrar}
            className="text-ink-faint hover:text-ink transition-colors"
            aria-label="Cerrar"
          >
            <Icon name="close" size={20} />
          </button>
        </div>

        <div className="p-lg flex flex-col gap-md">{children}</div>

        {acciones && (
          <div className="p-lg border-t border-white/5 flex justify-end gap-sm">{acciones}</div>
        )}
      </div>
    </div>
  )
}
