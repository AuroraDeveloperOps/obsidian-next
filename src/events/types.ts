/**
 * Obsidian Next - Event Protocol
 * Single Source of Truth for all Agent Emissions.
 */

export interface Option {
    id: string;
    label: string;
    allow_context?: boolean; // If true, user can press TAB to add context
}

export type AgentEventUnion =
    // 1. Thought (Internal Monologue)
    | { type: "thought"; content: string; hidden?: boolean }

    // 2. Tool Usage
    | { type: "tool_start"; tool: string; args: string }
    | { type: "tool_result"; tool: string; output: string; isError?: boolean }

    // 3. User Interaction
    | { type: "choice_request"; question: string; options: Option[] }
    | { type: "approval_request"; requestId: string; context: string; diff?: string }
    | { type: "text_input_request"; requestId: string; prompt: string; masked?: boolean; placeholder?: string }

    // 4. System/Status
    | { type: "error"; message: string; code?: string }
    | { type: "done"; summary: string }
    | { type: "clear_history" }
    | { type: "view_request"; viewId: string; command?: string; params?: any }
    | { type: "command_executed"; command: string; args: string[] }

    // 5. Session Management
    | { type: "shutdown_request" }
    | { type: "session_saved"; sessionId: string; path: string }
    | { type: "shutdown_complete"; summary: SessionSummary }

    // 6. Task Management
    | { type: "task_update"; task: any | null }

    // 7. Scheduler
    | { type: "scheduler_task_started"; taskId: string; command: string }
    | { type: "scheduler_task_completed"; taskId: string }
    | { type: "scheduler_task_failed"; taskId: string; error: string };

export type AgentEvent = AgentEventUnion & { timestamp?: number };

/**
 * Session summary for graceful shutdown
 */
export interface SessionSummary {
    sessionId: string;
    duration: number;
    filesRead: number;
    filesModified: number;
    tasksCompleted: number;
    tasksPending: number;
    totalCost: number;
}

export type UserEvent =
    | { type: "user_input"; content: string }
    | { type: "user_choice"; selectionId: string; context?: string }
    | { type: "user_interrupt" }
    | { type: "approval_response"; approved: boolean; requestId: string }
    | { type: "text_input_response"; requestId: string; value: string; cancelled?: boolean };
