import type { FastifyReply, FastifyRequest } from 'fastify';
/** Abre sesión (cookie incluida) y devuelve lo que la web necesita tras entrar. */
export declare function abrirSesion(req: FastifyRequest, reply: FastifyReply, user: {
    id: string;
}, metodo: 'enlace' | 'password' | 'invitacion'): Promise<{
    usuario: {
        id: string;
        name: string;
        email: string;
        tienePassword: boolean;
        soporte: boolean;
    };
    cuentas: {
        id: string;
        slug: string;
        name: string;
        role: string;
    }[];
}>;
/** Quién eres y a qué cuentas puedes ir (selector tras el login). */
export declare function estadoDeSesion(userId: string): Promise<{
    usuario: {
        id: string;
        name: string;
        email: string;
        tienePassword: boolean;
        soporte: boolean;
    };
    cuentas: {
        id: string;
        slug: string;
        name: string;
        role: string;
    }[];
}>;
