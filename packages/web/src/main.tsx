import { StrictMode } from 'react';
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
import './estilos.css';

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
            <Route path="/personas" element={<Personas />} />
            <Route path="/mi-cuenta" element={<MiCuenta />} />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </ProveedorConfig>
  </StrictMode>
);
