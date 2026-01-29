import { EventEmitter } from 'events';
import { AgentEvent, UserEvent } from '../events/types.js';

export declare interface EventBus {
    on(event: 'agent', listener: (e: AgentEvent) => void): this;
    on(event: 'user', listener: (e: UserEvent) => void): this;
    emit(event: 'agent', e: AgentEvent): boolean;
    emit(event: 'user', e: UserEvent): boolean;
}

export class EventBus extends EventEmitter {
    constructor() {
        super();
        this.setMaxListeners(20);
    }

    emitAgent(e: AgentEvent) {
        this.emit('agent', e);
    }

    emitUser(e: UserEvent) {
        this.emit('user', e);
    }
}

export const bus = new EventBus();
