import { Layer } from 'effect';

import { MemeManager } from './MemeManager.js';
import { MemeRepository } from './MemeRepository.js';

// Meme feature: manager exposed to the app, repository wired internally.
export const MemeFeatureLive = MemeManager.layer.pipe(Layer.provide(MemeRepository.layer));
