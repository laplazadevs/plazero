import { containerName, rejectNonHealthRequest, unavailableResponse } from './controller.js';
import type { Env } from './worker.js';

export const routeHealthRequest = async (request: Request, env: Env): Promise<Response> => {
    const rejection = rejectNonHealthRequest(request);
    if (rejection) return rejection;
    try {
        return await env.PLAZERO_CONTAINER.getByName(containerName).fetch(request);
    } catch (error) {
        console.error('Health request routing failed', error);
        return unavailableResponse();
    }
};

export const maintainBot = (env: Env) => env.PLAZERO_CONTAINER.getByName(containerName).keepAlive();
