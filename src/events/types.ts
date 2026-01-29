/**
 * Obsidian Next - Event Protocol
 * Single Source of Truth for all Agent Emissions.
 */

export interface Option {
    id: string;
    label: string;
    allow_context?: boolean; // If true, user can press TAB to add context
}

export type AgentEvent =
    // 1. Thought (Internal Monologue)
    | { type: "thought"; content: string; hidden?: boolean }

    // 2. Tool Usage
    | { type: "tool_start"; tool: string; args: string }
    | { type: "tool_result"; tool: string; output: string; isError?: boolean }

    // 3. User Interaction
    | { type: "choice_request"; question: string; options: Option[] }
    | { type: "approval_request"; requestId: string; context: string; diff?: string }

    // 4. System/Status
    | { type: "error"; message: string; code?: string }
    | { type: "done"; summary: string }
    | { type: "clear_history" };

export type UserEvent =
    | { type: "user_input"; content: string }
    | { type: "user_choice"; selectionId: string; context?: string }
    | { type: "approval_response"; approved: boolean; requestId: string };
