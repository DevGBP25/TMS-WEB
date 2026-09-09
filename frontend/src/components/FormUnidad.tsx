import { useState, type FormEvent } from 'react'
import { useMutation } from '@tanstack/react-query'
import {
  ETIQUETA_ESTADO,
  unidadesApi,
  type EstadoUnidad,
  type Unidad,
} from '@/api/unidades'
import { ApiError } from '@/api/client'
import Icon from '@/components/Icon'

/** EN_RUTA no se ofrece: lo pone el turno del piloto, no esta pantalla. */
const ASIGNABLES: EstadoUnidad[] = ['DISPONIBLE', 'MANTENIMIENTO', 'FUERA_SERVICIO']

const TIPOS = ['Camión', 'Panel', 'Pick-up', 'Remolque', 'Cabezal', 'Motocicleta']

interface Props {
  unidad?: Unidad
  onListo: () => void
  onCancelar: () => void
}

export default function FormUnidad({ unidad, onListo, onCancelar }: Props) {
  const editando = unidad !== undefined
  const enTurno = Boolean(unidad?.pilotoActual)

  const [codigo, setCodigo] = useState(unidad?.codigo ?? '')
  const [placa, setPlaca] = useState(unidad?.placa ?? '')
  const [marca, setMarca] = useState(unidad?.marca ?? '')
  const [modelo, setModelo] = useState(unidad?.modelo ?? '')
  const [anio, setAnio] = useState(unidad?.anio?.toString() ?? '')
  const [tipo, setTipo] = useState(unidad?.tipo ?? '')
  const [capacidadKg, setCapacidadKg] = useState(unidad?.capacidadKg?.toString() ?? '0')
  const [capacidadM3, setCapacidadM3] = useState(unidad?.capacidadM3?.toString() ?? '0')
  const [odometroKm, setOdometroKm] = useState(unidad?.odometroKm?.toString() ?? '0')
  const [transportista, setTransportista] = useState(unidad?.transportista ?? '')
  const [estado, setEstado] = useState<EstadoUnidad>(unidad?.estado ?? 'DISPONIBLE')
  const [activo, setActivo] = useState(unidad?.activo ?? true)
  const [error, setError] = useState<string | null>(null)

  const guardar = useMutation({
    mutationFn: () => {
      const datos = {
        codigo: codigo.trim().toUpperCase(),
        placa: placa.trim().toUpperCase() || undefined,
        marca: marca.trim() || undefined,
        modelo: modelo.trim() || undefined,
        anio: anio ? Number(anio) : null,
        tipo: tipo.trim() || undefined,
        capacidadKg: Number(capacidadKg) || 0,
        capacidadM3: Number(capacidadM3) || 0,
        odometroKm: Number(odometroKm) || 0,
        transportista: transportista.trim() || undefined,
        estado,
        activo,
      }

      return editando
        ? unidadesApi.actualizar(unidad!.idUnidad, datos)
        : unidadesApi.crear(datos)
    },
    onSuccess: onListo,
    onError: (e) => setError(e instanceof ApiError ? e.message : 'No se pudo guardar la unidad.'),
  })

  const valido = codigo.trim().length > 0

  function enviar(e: FormEvent) {
    e.preventDefault()
    setError(null)
    guardar.mutate()
  }

  const campo = 'block text-label-caps text-ink-faint uppercase mb-xs'

  return (
    <form onSubmit={enviar} className="flex flex-col gap-md">
      {error && (
        <div
          role="alert"
          className="flex items-start gap-sm rounded-xl border border-danger/20 bg-danger/10 p-sm text-body-sm text-danger"
        >
          <Icon name="error" size={18} />
          <span>{error}</span>
        </div>
      )}

      {enTurno && (
        <div className="flex items-start gap-sm rounded-xl border border-accent/20 bg-accent/10 p-sm text-body-sm text-accent-soft">
          <Icon name="info" size={18} />
          <span>
            La trae <strong>{unidad!.pilotoActual}</strong> con turno abierto. Mientras dure, no
            puede pasar a mantenimiento ni darse de baja.
          </span>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-md">
        <div>
          <label className={campo}>Código</label>
          <input
            className="field"
            value={codigo}
            onChange={(e) => setCodigo(e.target.value)}
            /* Identifica la unidad en viajes y turnos: cambiarlo rompería
               la trazabilidad histórica. */
            disabled={editando}
            placeholder="U001"
            required
          />
          {editando && <p className="text-body-sm text-ink-faint mt-xs">No se puede cambiar.</p>}
        </div>

        <div>
          <label className={campo}>Placa</label>
          <input
            className="field"
            value={placa}
            onChange={(e) => setPlaca(e.target.value)}
            placeholder="P-123ABC"
          />
          <p className="text-body-sm text-ink-faint mt-xs">
            Opcional: los remolques suelen no tenerla.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-md">
        <div>
          <label className={campo}>Marca</label>
          <input className="field" value={marca} onChange={(e) => setMarca(e.target.value)} />
        </div>
        <div>
          <label className={campo}>Modelo</label>
          <input className="field" value={modelo} onChange={(e) => setModelo(e.target.value)} />
        </div>
        <div>
          <label className={campo}>Año</label>
          <input
            className="field"
            type="number"
            min={1950}
            max={2100}
            value={anio}
            onChange={(e) => setAnio(e.target.value)}
          />
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-md">
        <div>
          <label className={campo}>Tipo</label>
          <input
            className="field"
            list="tipos-unidad"
            value={tipo}
            onChange={(e) => setTipo(e.target.value)}
            placeholder="Camión 5 ton"
          />
          {/* Sugerencias sin cerrar la puerta a otros tipos. */}
          <datalist id="tipos-unidad">
            {TIPOS.map((t) => (
              <option key={t} value={t} />
            ))}
          </datalist>
        </div>
        <div>
          <label className={campo}>Transportista</label>
          <input
            className="field"
            value={transportista}
            onChange={(e) => setTransportista(e.target.value)}
            placeholder="Propia"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-md border-t border-white/5 pt-md">
        <div>
          <label className={campo}>Capacidad (kg)</label>
          <input
            className="field tabular"
            type="number"
            min={0}
            step="0.01"
            value={capacidadKg}
            onChange={(e) => setCapacidadKg(e.target.value)}
          />
        </div>
        <div>
          <label className={campo}>Capacidad (m³)</label>
          <input
            className="field tabular"
            type="number"
            min={0}
            step="0.01"
            value={capacidadM3}
            onChange={(e) => setCapacidadM3(e.target.value)}
          />
        </div>
        <div>
          <label className={campo}>Odómetro (km)</label>
          <input
            className="field tabular"
            type="number"
            min={0}
            step="0.01"
            value={odometroKm}
            onChange={(e) => setOdometroKm(e.target.value)}
          />
        </div>
      </div>

      <div className="border-t border-white/5 pt-md">
        <label className={campo}>Estado</label>
        <div className="flex flex-wrap gap-xs">
          {ASIGNABLES.map((s) => (
            <button
              key={s}
              type="button"
              disabled={enTurno}
              onClick={() => setEstado(s)}
              className={`px-sm py-xs rounded-lg border text-label-caps uppercase transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
                estado === s
                  ? 'border-accent text-accent bg-accent/10'
                  : 'border-field-border text-ink-faint hover:border-ink-faint'
              }`}
            >
              {ETIQUETA_ESTADO[s]}
            </button>
          ))}
        </div>
        <p className="text-body-sm text-ink-faint mt-xs">
          «En ruta» no aparece porque lo fija el turno del piloto, no esta pantalla.
        </p>
      </div>

      {editando && (
        <label
          className={`flex items-center gap-sm border-t border-white/5 pt-md ${
            enTurno ? 'opacity-50' : 'cursor-pointer'
          }`}
        >
          <input
            type="checkbox"
            checked={activo}
            disabled={enTurno}
            onChange={(e) => setActivo(e.target.checked)}
            className="accent-[var(--color-accent)] w-4 h-4"
          />
          <span className="text-body-sm text-ink">
            Unidad en circulación
            <span className="text-ink-faint"> · al desmarcarla deja de aparecer en asignaciones</span>
          </span>
        </label>
      )}

      <div className="flex justify-end gap-sm border-t border-white/5 pt-md">
        <button type="button" className="btn-ghost" onClick={onCancelar} disabled={guardar.isPending}>
          Cancelar
        </button>
        <button type="submit" className="btn-accent" disabled={!valido || guardar.isPending}>
          {guardar.isPending ? 'Guardando…' : editando ? 'Guardar cambios' : 'Registrar unidad'}
        </button>
      </div>
    </form>
  )
}
