export interface CuentaResuelta {
    id: string;
    slug: string;
    name: string;
    plan: string;
    timeZone: string;
    locale: string;
    cerrada: boolean;
}
/**
 * Cuenta por slug. Pasa por la función `cuenta_por_slug` (SECURITY DEFINER) porque la tabla
 * `accounts` está bajo RLS y aún no hay cuenta fijada: es justo lo que se está averiguando.
 */
export declare function cuentaPorSlug(slug: string): Promise<CuentaResuelta | null>;
