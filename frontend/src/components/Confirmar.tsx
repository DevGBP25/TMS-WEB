import { type ReactNode } from 'react'
import Icon from './Icon'
import Modal from './Modal'

interface Props {
  titulo: string
  /** Qué va a pasar, en una frase. Se lee antes de decidir, así que va al grano. */
  mensaje: ReactNode
  /** Sobre qué recae: "3 boletas seleccionadas". Lo que el operador necesita revisar. */
  detalle?: string
  textoAceptar?: string
  /** Rojo para lo que borra o saca a la calle; naranja para el resto. */
  tono?: 'danger' | 'accent'
  cargando?: boolean
  onConfirmar: () => void
  onCancelar: () => void
}

/**
 * Pregunta antes de cambiar algo.
 *
 * Va en un cuadro propio y no en el confirm del navegador: ese no permite
 * decir cuántos registros se tocan, sale con el estilo del sistema operativo
 * y en algunos navegadores se puede silenciar sin que nadie se entere.
 *
 * El botón enfocado es Cancelar a propósito: si alguien viene pulsando Enter
 * desde la pantalla anterior, la tecla no ejecuta el cambio.
 */
export default function Confirmar({
  titulo,
  mensaje,
  detalle,
  textoAceptar = 'Confirmar',
  tono = 'accent',
  cargando = false,
  onConfirmar,
  onCancelar,
}: Props) {
  return (
    <Modal titulo={titulo} onCerrar={onCancelar} ancho="max-w-[460px]">
      <div className="flex gap-md">
        <Icon
          name={tono === 'danger' ? 'warning' : 'help'}
          size={22}
          className={tono === 'danger' ? 'text-danger shrink-0' : 'text-accent shrink-0'}
        />
        <div className="flex flex-col gap-xs">
          <p className="text-ink">{mensaje}</p>
          {detalle && <p className="text-body-sm text-ink-faint">{detalle}</p>}
        </div>
      </div>

      <div className="flex justify-end gap-md pt-sm border-t border-white/5">
        <button type="button" className="btn-ghost" onClick={onCancelar} autoFocus>
          Cancelar
        </button>
        <button
          type="button"
          className={tono === 'danger' ? 'btn-danger' : 'btn-accent'}
          onClick={onConfirmar}
          disabled={cargando}
        >
          <Icon name={cargando ? 'hourglass_empty' : 'check'} size={18} />
          {cargando ? 'Aplicando…' : textoAceptar}
        </button>
      </div>
    </Modal>
  )
}
