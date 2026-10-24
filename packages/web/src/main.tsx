import { StrictMode, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';

// Día 1: solo confirma que la web llega a la API y la API a la base. Las pantallas empiezan el día 3.
function App() {
  const [estado, setEstado] = useState('consultando…');
  useEffect(() => {
    fetch('/api/v1/salud')
      .then((r) => r.json())
      .then((d) => setEstado(d.ok ? `API y base OK (Postgres ${d.postgres})` : 'La API responde, la base no'))
      .catch(() => setEstado('La API no responde'));
  }, []);
  return (
    <main style={{ fontFamily: 'Montserrat, system-ui, sans-serif', padding: 24 }}>
      <h1>Lucuma Proyectos</h1>
      <p>{estado}</p>
    </main>
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
