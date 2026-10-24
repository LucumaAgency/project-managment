import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { ProveedorConfig } from './contexto';
import Canjear from './paginas/Canjear';
import Cuentas from './paginas/Cuentas';
import Entrar from './paginas/Entrar';
import MiCuenta from './paginas/MiCuenta';
import Portada from './paginas/Portada';
import './estilos.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ProveedorConfig>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Portada />} />
          <Route path="/entrar" element={<Entrar />} />
          <Route path="/entrar/enlace" element={<Canjear />} />
          <Route path="/cuentas" element={<Cuentas />} />
          <Route path="/mi-cuenta" element={<MiCuenta />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </ProveedorConfig>
  </StrictMode>
);
