
import { Scheduler } from '../core/scheduler.js';
import { registerSystemAbilities } from './system.js';

/**
 * Initialize and register all agent abilities
 */
export function registerAbilities(scheduler: Scheduler) {
    registerSystemAbilities(scheduler);

    // Future: Add more modules here
    // registerFilesystemAbilities(scheduler);
    // registerNetworkAbilities(scheduler);
}
