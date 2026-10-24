export declare function hashPassword(clave: string): Promise<string>;
export declare function verifyPassword(clave: string, guardado: string): Promise<boolean>;
export declare function hashDeRelleno(): Promise<string>;
/** Contraseña aleatoria legible, para scripts de consola. */
export declare function generarPassword(): string;
