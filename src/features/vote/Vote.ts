import { Layer } from 'effect';

import { VoteManager } from './VoteManager.js';
import { VoteRepository } from './VoteRepository.js';

// Vote feature: manager exposed to the app, repository wired internally.
export const VoteFeatureLive = VoteManager.layer.pipe(Layer.provide(VoteRepository.layer));
