/**
 * Agent - Main execution loop
 *
 * Flow: INPUT -> ANALYZE -> PLAN -> APPROVE -> EXECUTE -> VERIFY -> REPORT
 */

import { bus } from './bus.js';
import { llm } from './llm.js';
import { context } from './context.js';
import { tasks } from './tasks.js';
import { tools } from './tools.js';
import { undo } from './undo.js';
import { redactor } from './redactor.js';
import { auditLog } from './auditLog.js';
import { usage } from './usage.js';

import { history } from './history.js';

export interface AgentPlan {
    task: string;
    steps: string[];
    files_to_read: string[];
    files_to_modify: string[];
    requires_approval: boolean;
}

class Agent {
    private initialized = false;
    private pendingPlan: { plan: AgentPlan; originalInput: string } | null = null;
    private sessionId: string;

    constructor() {
        // Generate unique session ID for undo tracking
        this.sessionId = `session_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    }

    async init(resumeSessionId?: string): Promise<void> {
        if (this.initialized) return;
        await context.init();

        if (resumeSessionId) {
            const { session } = await import('./session.js');
            const result = await session.restore(resumeSessionId);
            if (!result.success) {
                bus.emitAgent({ type: 'error', message: `Failed to resume session: ${result.error}` });
                // Fallback to new session
                await context.startNewSession();
                await history.clear();
            } else {
                bus.emitAgent({ type: 'thought', content: `Resumed session: ${resumeSessionId}` });
            }
        } else {
            // Start a fresh session (archives old one)
            // This prevents the agent from "remembering" stale tasks from previous runs
            await context.startNewSession();
            await history.clear();
        }

        await tasks.init();
        // Initialize undo system with session ID for change tracking
        await undo.init(this.sessionId);
        // Initialize audit logging with session ID
        auditLog.setSessionId(this.sessionId);
        await auditLog.init();
        this.initialized = true;
    }

    async run(input: string): Promise<void> {
        await this.init();

        const mode = context.getMode();

        // Update task if this looks like a new task
        if (this.isNewTask(input)) {
            await tasks.create(this.extractTaskTitle(input));
            await context.setTask(tasks.getProgress());
        }

        bus.emitAgent({ type: 'thought', content: `[${mode}] Processing...` });

        if (mode === 'plan') {
            await this.runPlanMode(input);
        } else {
            await this.runDirectMode(input);
        }
    }

    private isNewTask(input: string): boolean {
        // Heuristic: longer inputs with action verbs are likely new tasks
        const actionWords = ['create', 'add', 'implement', 'fix', 'update', 'refactor', 'build', 'make', 'write'];
        const lower = input.toLowerCase();
        return input.length > 20 && actionWords.some(w => lower.includes(w));
    }

    private extractTaskTitle(input: string): string {
        // Take first 50 chars or first sentence
        const firstSentence = input.split(/[.!?\n]/)[0];
        return firstSentence.slice(0, 50) + (firstSentence.length > 50 ? '...' : '');
    }

    private async runPlanMode(input: string): Promise<void> {
        // Step 1: Generate plan (READ-ONLY mode - no writes during planning)
        bus.emitAgent({ type: 'thought', content: 'Generating plan (read-only)...' });

        const planPrompt = `Analyze this request and create a plan.

IMPORTANT: You are in PLANNING mode. You may ONLY use read operations (read, list, grep, glob) to understand the codebase. Do NOT execute any writes or modifications yet.

OUTPUT a structured plan:

REQUEST: ${input}

FORMAT:
TASK: <one line summary>
STEPS:
1. <step>
2. <step>
FILES_READ: <comma separated paths or "none">
FILES_MODIFY: <comma separated paths or "none">
APPROVAL: <yes if destructive, no otherwise>`;

        const planResponse = await llm.streamChat(planPrompt);

        if (!planResponse) {
            bus.emitAgent({ type: 'error', message: 'Failed to generate plan' });
            return;
        }

        // Parse plan
        const plan = this.parsePlan(planResponse);

        // Store pending plan for execution after approval
        this.pendingPlan = { plan, originalInput: input };

        // Show plan and wait for approval
        bus.emitAgent({
            type: 'thought',
            content: this.formatPlan(plan)
        });

        bus.emitAgent({
            type: 'approval_request',
            requestId: `plan_${Date.now()}`,
            context: `Execute this plan?\n\n${this.formatPlan(plan)}`,
        });

        // Approval handling happens via handleApprovalResponse
        // Called by supervisor when user approves/denies
    }

    private async runDirectMode(input: string): Promise<void> {
        const startTime = Date.now();

        // Add context to prompt
        const ctxSummary = context.getSummary();
        const taskProgress = tasks.getProgress();

        let enhancedInput = input;
        if (ctxSummary || taskProgress !== 'No active task') {
            enhancedInput = `${input}\n\n[Context: ${ctxSummary}]\n[${taskProgress}]`;
        }

        // Redact any PII from the enhanced input before sending to LLM
        const redactionResult = redactor.redact(enhancedInput);
        if (redactionResult.redactionCount > 0) {
            enhancedInput = redactionResult.text;
            bus.emitAgent({
                type: 'thought',
                content: `[Security] Redacted ${redactionResult.redactionCount} sensitive item(s) from context`,
                hidden: true
            });
        }

        const response = await llm.streamChat(enhancedInput);

        if (response) {
            await context.setLastAction(input.slice(0, 50));
            const durationMs = Date.now() - startTime;
            usage.addSessionDuration(durationMs);
            bus.emitAgent({ type: 'done', summary: `Completed in ${(durationMs / 1000).toFixed(1)}s` });
        } else {
            bus.emitAgent({ type: 'error', message: 'Failed to get response' });
        }
    }

    async handleApprovalResponse(approved: boolean, requestId: string): Promise<void> {
        if (!this.pendingPlan) {
            return;
        }

        if (!approved) {
            bus.emitAgent({ type: 'thought', content: 'Plan rejected. Awaiting new instructions.' });
            this.pendingPlan = null;
            return;
        }

        const { plan, originalInput } = this.pendingPlan;
        this.pendingPlan = null;

        // Auto-create task and steps
        await tools.execute('task', { action: 'create', title: plan.task });
        for (const step of plan.steps) {
            await tools.execute('task', { action: 'add_step', step });
        }

        await this.executePlan(plan, originalInput);
    }

    private async executePlan(plan: AgentPlan, originalInput: string): Promise<void> {
        const startTime = Date.now();

        // Switch to auto mode for plan execution (user already approved the plan)
        const previousMode = context.getMode();
        await context.setMode('auto');
        bus.emitAgent({ type: 'thought', content: 'Executing approved plan (auto-accept enabled)...' });

        // Build execution prompt with plan context
        const executionPrompt = `Execute this plan step by step:

ORIGINAL REQUEST: ${originalInput}

PLAN:
${this.formatPlan(plan)}

Execute each step carefully. Use available tools as needed.

IMPORTANT:
1. You have an active task. You MUST use the 'task' tool to mark steps as done (action: 'complete_step', step_index: <index>) immediately after completing them to keep the user informed.
2. Do NOT create 'summary' files (e.g., SUMMARY.md, START_HERE.txt) to report completion. Report results directly in the final chat message. Keep the workspace clean.`;

        try {
            const response = await llm.streamChat(executionPrompt);

            if (response) {
                await context.setLastAction(`Executed: ${plan.task.slice(0, 40)}`);
                const durationMs = Date.now() - startTime;
                usage.addSessionDuration(durationMs);
                bus.emitAgent({ type: 'done', summary: `Plan executed in ${(durationMs / 1000).toFixed(1)}s` });
            } else {
                bus.emitAgent({ type: 'error', message: 'Failed to execute plan' });
            }
        } finally {
            // Restore previous mode after execution
            if (previousMode) {
                await context.setMode(previousMode);
            }
        }
    }

    private parsePlan(response: string): AgentPlan {
        const lines = response.split('\n');
        const plan: AgentPlan = {
            task: '',
            steps: [],
            files_to_read: [],
            files_to_modify: [],
            requires_approval: false,
        };

        for (const line of lines) {
            if (line.startsWith('TASK:')) {
                plan.task = line.slice(5).trim();
            } else if (line.match(/^\d+\./)) {
                plan.steps.push(line.replace(/^\d+\.\s*/, '').trim());
            } else if (line.startsWith('FILES_READ:')) {
                const files = line.slice(11).trim();
                if (files !== 'none') {
                    plan.files_to_read = files.split(',').map(f => f.trim());
                }
            } else if (line.startsWith('FILES_MODIFY:')) {
                const files = line.slice(13).trim();
                if (files !== 'none') {
                    plan.files_to_modify = files.split(',').map(f => f.trim());
                }
            } else if (line.startsWith('APPROVAL:')) {
                plan.requires_approval = line.toLowerCase().includes('yes');
            }
        }

        return plan;
    }

    private formatPlan(plan: AgentPlan): string {
        const lines = [`Task: ${plan.task}`, '', 'Steps:'];
        plan.steps.forEach((s, i) => lines.push(`  ${i + 1}. ${s}`));

        if (plan.files_to_read.length > 0) {
            lines.push('', `Read: ${plan.files_to_read.join(', ')}`);
        }
        if (plan.files_to_modify.length > 0) {
            lines.push(`Modify: ${plan.files_to_modify.join(', ')}`);
        }

        return lines.join('\n');
    }

    // Mode control
    async setMode(mode: 'auto' | 'plan' | 'safe'): Promise<void> {
        await context.setMode(mode);
        bus.emitAgent({ type: 'thought', content: `Mode: ${mode}` });
    }

    getMode(): string {
        return context.getMode();
    }
}

export const agent = new Agent();
