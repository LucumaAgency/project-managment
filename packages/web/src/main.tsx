import { lazy, StrictMode, Suspense } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import Marco from './componentes/Marco';
import { ProveedorConfig } from './contexto';
import Canjear from './paginas/Canjear';
import Cuentas from './paginas/Cuentas';
import Entrar from './paginas/Entrar';
import Invitacion from './paginas/Invitacion';
import MiCuenta from './paginas/MiCuenta';
import Personas from './paginas/Personas';
import Portada from './paginas/Portada';
import Proyecto from './paginas/Proyecto';
import Tareas from './paginas/Tareas';
import Mensajes from './paginas/Mensajes';
import Mensaje from './paginas/Mensaje';
import Actividad from './paginas/Actividad';
import Archivos from './paginas/Archivos';
import Archivo from './paginas/Archivo';
import './estilos.css';

// Página de prueba del editor: solo en desarrollo (Vite la quita del build de producción).
const PruebaEditor = import.meta.env.DEV ? lazy(() => import('./paginas/PruebaEditor')) : null;

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ProveedorConfig>
      <BrowserRouter>
        <Routes>
          {/* Sin cuenta: acceso, selector e invitación */}
          <Route path="/entrar" element={<Entrar />} />
          <Route path="/entrar/enlace" element={<Canjear />} />
          <Route path="/cuentas" element={<Cuentas />} />
          <Route path="/invitacion" element={<Invitacion />} />
          {/* Dentro de una cuenta */}
          <Route element={<Marco />}>
            <Route path="/" element={<Portada />} />
            <Route path="/proyectos/:id" element={<Proyecto />} />
            <Route path="/proyectos/:id/tareas" element={<Tareas />} />
            <Route path="/proyectos/:id/mensajes" element={<Mensajes />} />
            <Route path="/proyectos/:id/mensajes/:mensajeId" element={<Mensaje />} />
            <Route path="/proyectos/:id/actividad" element={<Actividad />} />
            <Route path="/proyectos/:id/archivos" element={<Archivos />} />
            <Route path="/proyectos/:id/archivos/:archivoId" element={<Archivo />} />
            <Route path="/personas" element={<Personas />} />
            <Route path="/mi-cuenta" element={<MiCuenta />} />
            {PruebaEditor && <Route path="/_editor" element={<Suspense fallback={null}><PruebaEditor /></Suspense>} />}
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </ProveedorConfig>
  </StrictMode>
);
