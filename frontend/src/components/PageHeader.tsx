import type { ReactNode } from 'react'

interface PageHeaderProps {
  titulo: string
  subtitulo?: string
  /** Acciones alineadas a la derecha: buscador, botones. */
  children?: ReactNode
}

export default function PageHeader({ titulo, subtitulo, children }: PageHeaderProps) {
  return (
    <header className="flex flex-col md:flex-row justify-between items-start md:items-center gap-md py-md border-b border-white/5">
      <div className="min-w-0">
        <h2 className="text-headline-md md:text-headline-lg text-accent">{titulo}</h2>
        {subtitulo && <p className="text-body-sm text-ink-faint mt-xs">{subtitulo}</p>}
      </div>
      {/* min-w-0 deja que el buscador se encoja en anchos intermedios
          en vez de empujar la página hacia el scroll horizontal. */}
      {children && (
        <div className="flex items-center gap-md w-full md:w-auto min-w-0 shrink">{children}</div>
      )}
    </header>
  )
}
