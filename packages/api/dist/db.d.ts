import { PrismaClient } from '@prisma/client';
export declare const prisma: PrismaClient<{
    datasourceUrl: string;
    log: ("warn" | "error")[];
}, "warn" | "error", import("@prisma/client/runtime/library").DefaultArgs>;
export declare const prismaAdmin: PrismaClient<{
    datasourceUrl: string;
    log: ("warn" | "error")[];
}, "warn" | "error", import("@prisma/client/runtime/library").DefaultArgs>;
