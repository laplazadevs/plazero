import { Layer } from 'effect';

import { WelcomeManager } from './WelcomeManager.js';
import { WelcomeRepository } from './WelcomeRepository.js';

// Welcome feature: manager exposed to the app, repository wired internally.
export const WelcomeFeatureLive = WelcomeManager.layer.pipe(Layer.provide(WelcomeRepository.layer));
