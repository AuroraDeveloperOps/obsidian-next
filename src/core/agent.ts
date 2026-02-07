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
import { mcp } from './mcp.js';
import { config } from './config.js';
import { auditor } from './auditor.js';
import { COMMANDS } from '../ui/CommandPopup.js';
import { exitCommand } from '../commands/exit.js';

import { history } from './history.js';
import { scheduler } from './scheduler.js';
import { registerAbilities } from '../abilities/index.js';

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
        
        // Load global config and initialize workspace root
        const cfg = await config.load();
        auditor.setWorkspaceRoot(cfg.workspaceRoot);

        await context.init();
        await mcp.init();
        await tools.init();

        // Initialize Scheduler
        registerAbilities(scheduler);
        scheduler.start();

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

            // Also archive and clear stale tasks to ensure a fresh start
            // (Unless resumed, tasks should match the fresh session)
            await tasks.init(); // Load first to have something to archive
            if (tasks.hasActiveTask()) {
                await tasks.archive();
                await tasks.clear();
            }
        }

        await tasks.init();
        // Initialize undo system with session ID for change tracking
        await undo.init(this.sessionId);
        // Initialize audit logging with session ID
        auditLog.setSessionId(this.sessionId);
        await auditLog.init();
        // Enable PII redaction by default for security (can be disabled in settings)
        const s = await (await import('./settings.js')).settings.load();
        redactor.setEnabled(s.security.piiRedaction);
        this.initialized = true;
    }

    private async handleCommand(input: string): Promise<boolean> {
        if (input.trim() === '/') return true; // Ignore single slash
        const commandName = input.split(' ')[0];
        const command = COMMANDS.find(c => c.name === commandName);
        if (!command) return false;

        const args = input.split(' ').slice(1);

        if (command.isView) {
            let viewId = command.name.slice(1);
            // Special handling for commands that map to settings tabs or other views
            switch (command.name) {
                case '/models':
                case '/mode':
                case '/sandbox':
                case '/config':
                case '/settings':
                    viewId = 'settings';
                    break;
                case '/status':
                case '/doctor':
                    viewId = 'doctor';
                    break;
                case '/resume':
                    // If resume has an argument (session ID), execute the command directly
                    if (args.length > 0) {
                        const { resumeCommand } = await import('../commands/resume.js');
                        await resumeCommand(args);
                        return true;
                    }
                    viewId = 'sessions';
                    break;
                case '/task':
                    viewId = 'task';
                    break;
                case '/context':
                    viewId = 'context';
                    break;
                case '/mcp':
                    viewId = 'mcp';
                    break;
                case '/init':
                    viewId = 'init';
                    break;
                case '/help':
                    viewId = 'help';
                    break;
            }

            bus.emitAgent({
                type: 'view_request',
                viewId,
                command: command.name,
                params: args,
            });
            return true;
        }

        // Handle non-view commands
        switch (command.name) {
            case '/clear':
                bus.emitAgent({
                    type: 'approval_request',
                    requestId: 'ui:clear',
                    context: 'Flush session history? This cannot be undone.',
                });
                return true;
            case '/exit':
                await exitCommand(args);
                return true;
            case '/undo':
                 bus.emitAgent({
                    type: 'approval_request',
                    requestId: 'agent:undo',
                    context: 'Undo the last file modification? This will revert the change on disk.',
                });
                return true;
            case '/diff':
                this.showDiff();
                return true;
            case '/tool':
                // This might need more complex handling depending on args
                bus.emitAgent({ type: 'thought', content: `Tool command requires arguments: /tool <tool_name> [args]`});
                return true;

        }

        return false;
    }

    private async showDiff() {
        const changes = undo.getHistory(1);
        if (changes.length > 0) {
            const change = changes[0];
            const diffContent = `File: ${change.filePath}\nOperation: ${change.operation}\n${change.beforeContent ? `Before:\n${change.beforeContent.slice(0, 500)}...` : ''}`;
            bus.emitAgent({ type: 'thought', content: diffContent });
        } else {
            bus.emitAgent({ type: 'thought', content: 'No changes to display.' });
        }
    }


    async run(input: string): Promise<void> {
        await this.init();

        if (await this.handleCommand(input)) {
            return;
        }

        const mode = context.getMode();

        // Analyze task complexity
        const { complexity, suggestPlanMode } = this.analyzeTaskComplexity(input);

        // Update task if this looks like a new task
        if (this.isNewTask(input)) {
            await tasks.create(this.extractTaskTitle(input));
            await context.setTask(tasks.getProgress());
        }

        // Log mode and complexity for transparency
        const complexityLabel = complexity === 'complex' ? 'complex task' : complexity === 'moderate' ? 'moderate task' : 'simple task';
        bus.emitAgent({ type: 'thought', content: `[${mode}] ${complexityLabel}` });

        // Suggest plan mode for complex tasks (embedded in the prompt enhancement)
        if (suggestPlanMode && mode !== 'plan') {
            bus.emitAgent({
                type: 'thought',
                content: '[TIP] Complex task detected. Consider switching to plan mode (Shift+Tab) for better results.',
                hidden: false
            });
        }

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

    /**
     * Analyze task complexity to suggest mode transitions
     */
    private analyzeTaskComplexity(input: string): { complexity: 'simple' | 'moderate' | 'complex'; suggestPlanMode: boolean } {
        const lower = input.toLowerCase();

        // Complexity indicators
        const complexIndicators = [
            'refactor', 'migrate', 'overhaul', 'redesign', 'architect',
            'multiple files', 'across the codebase', 'all of', 'entire',
            'integrate', 'replace all', 'comprehensive', 'full',
        ];

        const moderateIndicators = [
            'add feature', 'implement', 'create', 'build', 'setup',
            'configure', 'update', 'modify', 'change',
        ];

        const simpleIndicators = [
            'fix', 'typo', 'rename', 'delete', 'remove', 'quick',
            'small', 'minor', 'simple', 'just', 'only',
        ];

        // Count multi-step patterns
        const hasMultiStep = /\b(and|then|also|after that|next)\b/gi.test(input);
        const wordCount = input.split(/\s+/).length;

        // Determine complexity
        let complexity: 'simple' | 'moderate' | 'complex' = 'simple';

        if (complexIndicators.some(i => lower.includes(i)) || (hasMultiStep && wordCount > 30)) {
            complexity = 'complex';
        } else if (moderateIndicators.some(i => lower.includes(i)) || wordCount > 15) {
            complexity = 'moderate';
        } else if (simpleIndicators.some(i => lower.includes(i))) {
            complexity = 'simple';
        }

        // Suggest plan mode for complex tasks when not already in plan mode
        const currentMode = context.getMode();
        const suggestPlanMode = complexity === 'complex' && currentMode !== 'plan';

        return { complexity, suggestPlanMode };
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

        const readOnlyTools = ['read', 'list', 'grep', 'glob'];
        
        const planResponse = await llm.streamChat(planPrompt, { allowedTools: readOnlyTools });

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

        // null means actual failure, empty string means LLM returned no text (valid for tool-only responses)
        if (response !== null) {
            // Emit the final response as a thought right before 'done' to ensure visibility
            // This handles cases where LLM only called tools without generating text,
            // or where tool output thoughts got lost due to consecutive thought handling
            if (response && response.trim()) {
                bus.emitAgent({ type: 'thought', content: response });
            }
            await context.setLastAction(input.slice(0, 50));
            const durationMs = Date.now() - startTime;
            usage.addSessionDuration(durationMs);
            bus.emitAgent({ type: 'done', summary: `Completed in ${(durationMs / 1000).toFixed(1)}s` });
        } else {
            bus.emitAgent({ type: 'error', message: 'Failed to get response from LLM' });
        }
    }

    async handleApprovalResponse(approved: boolean, requestId: string): Promise<void> {
        if (requestId === 'agent:undo') {
            if (approved) {
                const result = await undo.undo(1);
                bus.emitAgent({ type: 'thought', content: result.message });
            } else {
                bus.emitAgent({ type: 'thought', content: 'Undo cancelled.' });
            }
            return;
        }

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

        // Auto-create task and steps (only if plan has a valid task title)
        if (plan.task && plan.task.trim()) {
            await tools.execute('task', { action: 'create', title: plan.task });
            for (const step of plan.steps) {
                if (step && step.trim()) {
                    await tools.execute('task', { action: 'add_step', step });
                }
            }
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

CRITICAL TASK TRACKING REQUIREMENT:
- You have an active task with ${plan.steps.length} steps.
- After completing EACH step, you MUST call: task tool with action: 'complete_step', step_index: <0-based index>
- Step indices are 0-based (first step is 0, second is 1, etc.)
- Do this IMMEDIATELY after each step completes, not at the end.
- When ALL steps are done, call: task tool with action: 'complete_task'

OTHER RULES:
- Do NOT create summary files (SUMMARY.md, START_HERE.txt, etc.)
- Report results directly in chat.`;

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
            const trimmedLine = line.trim();
            if (trimmedLine.toUpperCase().startsWith('TASK:')) {
                plan.task = trimmedLine.slice(5).trim();
            } else if (trimmedLine.match(/^\d+\.\s/)) {
                const step = trimmedLine.replace(/^\d+\.\s*/, '').trim();
                if (step) plan.steps.push(step);
            } else if (trimmedLine.toUpperCase().startsWith('FILES_READ:')) {
                const files = trimmedLine.slice(11).trim();
                if (files && files.toLowerCase() !== 'none') {
                    plan.files_to_read = files.split(',').map(f => f.trim()).filter(f => f);
                }
            } else if (trimmedLine.toUpperCase().startsWith('FILES_MODIFY:')) {
                const files = trimmedLine.slice(13).trim();
                if (files && files.toLowerCase() !== 'none') {
                    plan.files_to_modify = files.split(',').map(f => f.trim()).filter(f => f);
                }
            } else if (trimmedLine.toUpperCase().startsWith('APPROVAL:')) {
                plan.requires_approval = trimmedLine.toLowerCase().includes('yes');
            }
        }

        // Fallback: If no TASK: line found, try to extract from first meaningful line
        if (!plan.task && lines.length > 0) {
            const firstNonEmpty = lines.find(l => l.trim() && !l.trim().match(/^(TASK|FILES|APPROVAL|STEPS|\d+\.)/i));
            if (firstNonEmpty) {
                plan.task = firstNonEmpty.trim().slice(0, 100); // Use first 100 chars as fallback
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