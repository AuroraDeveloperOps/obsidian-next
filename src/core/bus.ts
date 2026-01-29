import { EventEmitter } from 'events';
import { AgentEvent, UserEvent } from '../events/types.js';

/**
 * Type-safe Event Bus for Agent <-> UI communication.
 */
export declare interface EventBus {
    on(event: 'agent', listener: (e: AgentEvent) => void): this;
    on(event: 'user', listener: (e: UserEvent) => void): this;
    emit(event: 'agent', e: AgentEvent): boolean;
    emit(event: 'user', e: UserEvent): boolean;
}

export class EventBus extends EventEmitter {
    constructor() {
        super();
        // Increase max listeners for complex agent scenarios
        this.setMaxListeners(20);
    }

    /**
     * Emit an event from the Agent to the UI
     */
    emitAgent(e: AgentEvent) {
        this.emit('agent', e);
    }

    /**
     * Emit an event from the User (UI) to the Agent
     */
    emitUser(e: UserEvent) {
        this.emit('user', e);
    }
}

// Global Singleton Instance
export const bus = new EventBus();
