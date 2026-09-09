import { Navigate, Route, Routes } from 'react-router-dom'
import RutaProtegida from '@/auth/RutaProtegida'
import RutaPorRol from '@/auth/RutaPorRol'
import Layout from '@/components/Layout'
import Login from '@/pages/Login'
import Tablero from '@/pages/Tablero'
import Viajes from '@/pages/Viajes'
import ViajeDetalle from '@/pages/ViajeDetalle'
import Planificar from '@/pages/Planificar'
import Unidades from '@/pages/Unidades'
import Usuarios from '@/pages/Usuarios'

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />

      <Route element={<RutaProtegida />}>
        <Route path="/" element={<Layout />}>
          <Route index element={<Tablero />} />
          <Route path="viajes" element={<Viajes />} />
          <Route path="viajes/:id" element={<ViajeDetalle />} />
          <Route path="planificar" element={<Planificar />} />
          <Route path="unidades" element={<Unidades />} />

          {/* Ocultar el enlace no basta: sin esto, escribir la URL bastaría
              para llegar a la pantalla, aunque la API igual respondería 403. */}
          <Route element={<RutaPorRol roles={['ADMIN']} />}>
            <Route path="usuarios" element={<Usuarios />} />
          </Route>
        </Route>
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
