import { DurableObject } from 'cloudflare:workers';

import { BotContainerController, type BotSecrets } from './controller.js';
import { maintainBot, routeHealthRequest } from './router.js';

export interface Env extends BotSecrets {
    readonly PLAZERO_CONTAINER: DurableObjectNamespace<PlazeroContainer>;
}

export class PlazeroContainer extends DurableObject<Env> {
    private readonly controller: BotContainerController;

    constructor(ctx: DurableObjectState, env: Env) {
        super(ctx, env);
        this.controller = new BotContainerController(ctx.container, ctx.storage, env);
        void ctx.blockConcurrencyWhile(() => this.controller.restore());
    }

    fetch(request: Request) {
        return this.controller.fetch(request);
    }

    keepAlive() {
        return this.controller.keepAlive();
    }

    alarm() {
        return this.keepAlive();
    }
}

export default {
    fetch: routeHealthRequest,
    scheduled(_controller, env, ctx) {
        ctx.waitUntil(maintainBot(env));
    },
} satisfies ExportedHandler<Env>;
