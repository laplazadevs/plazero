export interface BotSecrets {
    readonly DISCORD_BOT_TOKEN?: string;
    readonly CLIENT_ID?: string;
    readonly GUILD_ID?: string;
    readonly DATABASE_URL_UNPOOLED?: string;
    readonly DATABASE_URL?: string;
}

export interface ControllerTiming {
    readonly now: () => number;
    readonly sleep: (ms: number) => Promise<void>;
    readonly readinessAttempts: number;
    readonly readinessDelayMs: number;
    readonly requestTimeoutMs: number;
}

type AlarmStorage = Pick<DurableObjectStorage, 'getAlarm' | 'setAlarm'>;

export const containerName = 'plazero-production';
export const healthPaths = ['/', '/health', '/api/health'];
const containerPort = 8080;
const inactivityTimeoutMs = 600_000;
const alarmIntervalMs = 60_000;

const defaultTiming: ControllerTiming = {
    now: Date.now,
    sleep: ms => new Promise(resolve => setTimeout(resolve, ms)),
    readinessAttempts: 15,
    readinessDelayMs: 500,
    requestTimeoutMs: 2000,
};

export const unavailableResponse = () =>
    Response.json(
        { status: 'unavailable' },
        { status: 503, headers: { 'cache-control': 'no-store', 'retry-after': '30' } }
    );

export const rejectNonHealthRequest = (request: Request): Response | undefined => {
    if (!healthPaths.includes(new URL(request.url).pathname)) {
        return new Response('Not found', { status: 404 });
    }
    if (request.method !== 'GET') {
        return new Response('Method not allowed', { status: 405, headers: { allow: 'GET' } });
    }
    return undefined;
};

const containerEnvironment = (secrets: BotSecrets): Record<string, string> => {
    const databaseUrl = secrets.DATABASE_URL_UNPOOLED || secrets.DATABASE_URL;
    if (!secrets.DISCORD_BOT_TOKEN || !secrets.CLIENT_ID || !secrets.GUILD_ID || !databaseUrl) {
        throw new Error('Required bot configuration is missing');
    }
    return {
        DISCORD_BOT_TOKEN: secrets.DISCORD_BOT_TOKEN,
        CLIENT_ID: secrets.CLIENT_ID,
        GUILD_ID: secrets.GUILD_ID,
        DATABASE_URL_UNPOOLED: databaseUrl,
        NODE_ENV: 'production',
        HOST: '0.0.0.0',
        PORT: String(containerPort),
    };
};

const describeFailure = async (response: Response) =>
    `Bot health check returned ${response.status}: ${await response.text()}`;

export class BotContainerController {
    private startTask: Promise<void> | undefined;
    private readonly timing: ControllerTiming;

    constructor(
        private readonly container: Container | undefined,
        private readonly storage: AlarmStorage,
        private readonly secrets: BotSecrets,
        timing: Partial<ControllerTiming> = {}
    ) {
        this.timing = { ...defaultTiming, ...timing };
    }

    async restore() {
        try {
            if (this.container?.running) {
                await this.container.setInactivityTimeout(inactivityTimeoutMs);
            }
        } finally {
            if ((await this.storage.getAlarm()) === null) await this.scheduleNextAlarm();
        }
    }

    private async startContainer() {
        if (!this.container) throw new Error('The bot container is not configured');
        if (!this.container.running) {
            this.container.start({
                env: containerEnvironment(this.secrets),
                enableInternet: true,
            });
        }
        await this.container.setInactivityTimeout(inactivityTimeoutMs);
    }

    private async ensureRunning() {
        this.startTask ||= this.startContainer().finally(() => {
            this.startTask = undefined;
        });
        await this.startTask;
    }

    private async scheduleNextAlarm() {
        await this.storage.setAlarm(this.timing.now() + alarmIntervalMs);
    }

    private async probe(path: string) {
        if (!this.container) throw new Error('The bot container is not configured');
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), this.timing.requestTimeoutMs);
        try {
            return await this.container
                .getTcpPort(containerPort)
                .fetch(new Request(`http://container${path}`, { signal: controller.signal }));
        } finally {
            clearTimeout(timeout);
        }
    }

    async fetch(request: Request): Promise<Response> {
        const rejection = rejectNonHealthRequest(request);
        if (rejection) return rejection;
        try {
            await this.ensureRunning();
            let lastFailure: unknown;
            for (let attempt = 0; attempt < this.timing.readinessAttempts; attempt += 1) {
                try {
                    const response = await this.probe('/health');
                    if (response.ok) return response;
                    lastFailure = await describeFailure(response);
                } catch (error) {
                    lastFailure = error;
                }
                if (attempt + 1 < this.timing.readinessAttempts) {
                    await this.timing.sleep(this.timing.readinessDelayMs);
                }
            }
            console.error('Bot container never became healthy', lastFailure);
            return unavailableResponse();
        } catch (error) {
            console.error('Bot container failed to start', error);
            return unavailableResponse();
        } finally {
            await this.scheduleNextAlarm();
        }
    }

    async keepAlive() {
        try {
            await this.ensureRunning();
            const response = await this.probe('/health');
            if (!response.ok) throw new Error(await describeFailure(response));
            await response.body?.cancel();
        } catch (error) {
            console.error('Bot keep-alive failed', error);
            throw new Error('Bot container is unavailable');
        } finally {
            await this.scheduleNextAlarm();
        }
    }
}
