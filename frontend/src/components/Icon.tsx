interface IconProps {
  /** Nombre del glifo en Material Symbols Outlined, p. ej. "local_shipping". */
  name: string
  /** Tamaño en píxeles; también ajusta el eje óptico de la fuente. */
  size?: number
  /** Glifo relleno, para el elemento activo de la navegación. */
  fill?: boolean
  className?: string
}

export default function Icon({ name, size = 18, fill = false, className = '' }: IconProps) {
  return (
    <span
      className={`material-symbols-outlined shrink-0 ${className}`}
      style={{
        fontSize: size,
        // El eje opsz alinea el grosor del trazo con el tamaño real del icono.
        fontVariationSettings: `'FILL' ${fill ? 1 : 0}, 'wght' 400, 'GRAD' 0, 'opsz' ${size}`,
      }}
      aria-hidden="true"
    >
      {name}
    </span>
  )
}
