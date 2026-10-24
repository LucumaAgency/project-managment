// Archivo de arranque para Plesk (Passenger).
//
// Passenger carga el archivo de inicio con require(). La API es un módulo ES, y require() de
// un módulo ES solo funciona en Node 20.19+ y 22.12+: con 21.7.3 falla con ERR_REQUIRE_ESM
// («Web application could not be started»). Este archivo es CommonJS y carga la API con
// import(), que funciona en cualquier versión. En Plesk: Archivo de inicio = arranque.cjs.
import('./packages/api/dist/server.js').catch((err) => {
  console.error('No se pudo cargar la API:', err);
  process.exit(1);
});
