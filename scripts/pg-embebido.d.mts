export function levantarPostgres(opciones: {
  dataDir: string;
  puerto: number;
  base: string;
  persistente?: boolean;
}): Promise<{ detener: () => Promise<void>; urlApp: string; urlAdmin: string }>;
