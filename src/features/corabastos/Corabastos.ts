import { Layer } from 'effect';

import { CorabastosManager } from './CorabastosManager.js';
import { CorabastosRepository } from './CorabastosRepository.js';

// Corabastos feature: manager exposed to the app, repository wired internally.
export const CorabastosFeatureLive = CorabastosManager.layer.pipe(
    Layer.provide(CorabastosRepository.layer)
);
