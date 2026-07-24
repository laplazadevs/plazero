import * as NodeFileSystem from '@effect/platform-node/NodeFileSystem';
import { ConfigProvider, Effect, Layer } from 'effect';

// Environment variables remain the primary configuration source; a local .env
// file (if present) acts as a fallback for development.
export const DotEnvConfigProviderLive = ConfigProvider.layerAdd(
    ConfigProvider.fromDotEnv().pipe(
        Effect.catch(() => Effect.succeed(ConfigProvider.fromUnknown({})))
    )
).pipe(Layer.provide(NodeFileSystem.layer));
