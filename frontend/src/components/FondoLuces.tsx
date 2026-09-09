import { useEffect, useRef } from 'react'

/* Posiciones fijas y no aleatorias: con Math.random cada render movería las
   luces de sitio, y en StrictMode el efecto se vería dos veces distinto. */
const CHISPAS = [
  { x: 8, y: 18, d: 5, dur: 13, esp: 0 },
  { x: 17, y: 72, d: 3, dur: 17, esp: 2.5 },
  { x: 26, y: 34, d: 7, dur: 15, esp: 1.2 },
  { x: 34, y: 86, d: 4, dur: 19, esp: 4 },
  { x: 44, y: 12, d: 6, dur: 12, esp: 3.1 },
  { x: 57, y: 63, d: 3, dur: 16, esp: 0.8 },
  { x: 66, y: 26, d: 8, dur: 21, esp: 2 },
  { x: 74, y: 79, d: 4, dur: 14, esp: 5.2 },
  { x: 83, y: 42, d: 5, dur: 18, esp: 1.7 },
  { x: 91, y: 15, d: 3, dur: 15, esp: 3.6 },
  { x: 95, y: 68, d: 6, dur: 20, esp: 0.4 },
  { x: 12, y: 50, d: 4, dur: 16, esp: 4.6 },
]

/**
 * Fondo de la pantalla de acceso: un foco que sigue al puntero sobre un campo
 * de luces suspendidas. Alude al giro de la empresa —iluminación— sin robarle
 * protagonismo al formulario.
 */
export default function FondoLuces() {
  const foco = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = foco.current
    if (!el) return

    // Sin puntero fino (táctil) el foco no tiene a quién seguir: queda centrado.
    if (!window.matchMedia('(pointer: fine)').matches) return

    let pendiente = 0

    const mover = (e: PointerEvent) => {
      // Un rAF por cuadro: sin esto se recalcularía el gradiente en cada
      // evento del puntero, que llega muchas más veces que los cuadros.
      if (pendiente) return

      pendiente = requestAnimationFrame(() => {
        pendiente = 0
        el.style.setProperty('--mx', `${(e.clientX / window.innerWidth) * 100}%`)
        el.style.setProperty('--my', `${(e.clientY / window.innerHeight) * 100}%`)
      })
    }

    window.addEventListener('pointermove', mover, { passive: true })

    return () => {
      window.removeEventListener('pointermove', mover)
      if (pendiente) cancelAnimationFrame(pendiente)
    }
  }, [])

  return (
    <div className="fixed inset-0 overflow-hidden pointer-events-none" aria-hidden="true">
      {/* Resplandor base, para que la pantalla no arranque en negro plano. */}
      <div
        className="absolute inset-0"
        style={{
          background:
            'radial-gradient(900px circle at 50% -10%, rgb(209 106 2 / 0.10), transparent 60%)',
        }}
      />

      {/* Retícula tenue: sugiere un plano técnico de instalación. */}
      <div
        className="absolute inset-0 opacity-[0.35]"
        style={{
          backgroundImage:
            'linear-gradient(rgb(255 255 255 / 0.025) 1px, transparent 1px),' +
            'linear-gradient(90deg, rgb(255 255 255 / 0.025) 1px, transparent 1px)',
          backgroundSize: '56px 56px',
          maskImage: 'radial-gradient(circle at 50% 40%, black, transparent 75%)',
        }}
      />

      {CHISPAS.map((c, n) => (
        <span
          key={n}
          className="chispa"
          style={
            {
              left: `${c.x}%`,
              top: `${c.y}%`,
              width: c.d,
              height: c.d,
              '--dur': `${c.dur}s`,
              '--retraso': `${c.esp}s`,
            } as React.CSSProperties
          }
        />
      ))}

      <div ref={foco} className="foco-puntero absolute inset-0" />
    </div>
  )
}
