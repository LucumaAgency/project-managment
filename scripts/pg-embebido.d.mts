export function levantarPostgres(opciones: {
  dataDir: string;
  puerto: number;
  base: string;
  persistente?: boolean;
  /** Se antepone a los roles, como hace Plesk. */
  prefijo?: string;
}): Promise<{ detener: () => Promise<void>; urlApp: string; urlAdmin: string }>;
