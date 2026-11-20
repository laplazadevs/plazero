import { createServer, type Server } from 'node:http';

export type Readiness =
    | { readonly phase: 'starting' }
    | {
          readonly phase: 'ready';
          readonly discordReady: () => boolean;
          readonly pingDatabase: () => Promise<unknown>;
      };

export interface HealthResponse {
    readonly status: 200 | 503;
    readonly body: Record<string, unknown>;
}

const healthPaths = new Set(['/', '/health', '/api/health']);

const unhealthyReason = async (readiness: Readiness): Promise<string | undefined> => {
    if (readiness.phase !== 'ready') return readiness.phase;
    if (!readiness.discordReady()) return 'discord_not_ready';
    return readiness.pingDatabase().then(
        () => undefined,
        error => {
            console.error('Health check database ping failed', error);
            return 'database_unreachable';
        }
    );
};

export const checkHealth = async (readiness: Readiness): Promise<HealthResponse> => {
    const reason = await unhealthyReason(readiness);
    return reason === undefined
        ? { status: 200, body: { ok: true, service: 'plazero', time: new Date().toISOString() } }
        : { status: 503, body: { ok: false, service: 'plazero', reason } };
};

export const startHealthServer = (port: number, readiness: () => Readiness): Promise<Server> => {
    const server = createServer((request, response) => {
        const path = new URL(request.url ?? '/', 'http://localhost').pathname;
        if (!healthPaths.has(path)) {
            response.writeHead(404).end('Not found');
            return;
        }
        if (request.method !== 'GET') {
            response.writeHead(405, { allow: 'GET' }).end('Method not allowed');
            return;
        }
        void checkHealth(readiness()).then(({ status, body }) => {
            response
                .writeHead(status, {
                    'content-type': 'application/json',
                    'cache-control': 'no-store',
                })
                .end(JSON.stringify(body));
        });
    });
    return new Promise((resolve, reject) => {
        server.once('error', reject);
        server.listen(port, () => {
            console.log(`Health server listening on ${port}`);
            resolve(server);
        });
    });
};
