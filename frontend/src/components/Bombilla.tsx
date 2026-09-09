interface BombillaProps {
  /** 0 = apagada, 1 = encendida por completo. Valores intermedios atenúan. */
  intensidad: number
  tamano?: number
}

/**
 * Luminaria de la marca. El filamento se dibuja y el vidrio se enciende a
 * medida que sube la intensidad: es la señal de progreso del formulario.
 */
export default function Bombilla({ intensidad, tamano = 72 }: BombillaProps) {
  const i = Math.min(Math.max(intensidad, 0), 1)
  const encendida = i > 0.99

  return (
    <div className="relative" style={{ width: tamano, height: tamano }}>
      {/* Halo: crece y late sólo cuando la luz está completa. */}
      <div
        className={`absolute inset-0 rounded-full blur-2xl transition-opacity duration-700 ${
          encendida ? 'halo-vivo' : ''
        }`}
        style={{
          background: 'radial-gradient(circle, rgb(255 183 133 / 0.75), transparent 70%)',
          opacity: 0.15 + i * 0.75,
          transform: `scale(${1 + i * 0.5})`,
        }}
      />

      <svg
        viewBox="0 0 48 48"
        width={tamano}
        height={tamano}
        className="relative"
        role="img"
        aria-label={encendida ? 'Luminaria encendida' : 'Luminaria apagada'}
      >
        <defs>
          <radialGradient id="vidrio" cx="50%" cy="42%" r="55%">
            <stop offset="0%" stopColor="#ffdcc6" stopOpacity={0.15 + i * 0.75} />
            <stop offset="100%" stopColor="#d16a02" stopOpacity={i * 0.35} />
          </radialGradient>
        </defs>

        {/* Bulbo */}
        <path
          d="M24 5c-7.7 0-14 6.1-14 13.6 0 4.9 2.6 8.6 5.2 11.4 1.4 1.5 2.3 2.9 2.6 4.4h12.4c.3-1.5 1.2-2.9 2.6-4.4C35.4 27.2 38 23.5 38 18.6 38 11.1 31.7 5 24 5Z"
          fill="url(#vidrio)"
          stroke="currentColor"
          strokeWidth="1.6"
          className="text-accent-soft transition-opacity duration-500"
          style={{ opacity: 0.45 + i * 0.55 }}
        />

        {/* Filamento: el elemento que realmente "prende". */}
        <path
          d="M19 30c0-4 2-5 2-8s-2-3-2-5m10 13c0-4-2-5-2-8s2-3 2-5"
          fill="none"
          stroke="#ffdcc6"
          strokeWidth="1.8"
          strokeLinecap="round"
          className={encendida ? 'filamento-encendido' : undefined}
          style={{
            opacity: 0.2 + i * 0.8,
            filter: encendida ? 'drop-shadow(0 0 5px #ffb785)' : undefined,
          }}
        />

        {/* Casquillo */}
        <path
          d="M18 38h12M19 41.5h10M21 45h6"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          className="text-ink-faint"
        />
      </svg>

      {/* Rayos: sólo con la luz al máximo, para que el encendido se note. */}
      {encendida && (
        <svg
          viewBox="0 0 48 48"
          width={tamano}
          height={tamano}
          className="absolute inset-0 pointer-events-none"
          aria-hidden="true"
        >
          <g stroke="#ffb785" strokeWidth="1.6" strokeLinecap="round" opacity="0.7">
            <path d="M24 1v3M4 18.6h3M41 18.6h3M9.5 5.5l2 2M38.5 5.5l-2 2" />
          </g>
        </svg>
      )}
    </div>
  )
}
