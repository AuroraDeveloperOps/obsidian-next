# Obsidian Next - Autonomous Transformation Plan

## Executive Summary

Obsidian Next has transitioned from a terminal tool to an **Autonomous Engineering Gateway**. This plan outlines the final hardening steps to achieve production-grade 24/7 reliability.

---

## ARCHITECTURAL MATURITY: script -> service

### Features Implemented (v0.4.6)

1.  **Always-On Background Service**: The Node.js daemon manages sessions globally.
2.  **Adaptive Reasoning**: Full integration of Claude 4.6 **Thinking Blocks**.
3.  **1M Token Window**: Optimized via prompt caching and episodic summarization.
4.  **Proactive Scheduler**: Background heartbeat for security and maintenance.
5.  **Hybrid Semantic Memory**: `sqlite-vec` + bidirectional `MEMORY.md` sync.

### Hardening Targets (Next 30 Days)

1. **Self-Improving Skill Safety** (HIGH)
   - Implement **AST-based sanitization** for autonomous `create_skill` tool.
   - Enforce "Restricted Mode" for the first 3 executions of any self-generated skill.

2. **Visual Evaluation Loop** (HIGH)
   - Finalize the **Pilot Mode** screenshot comparison logic.
   - Implement real-time PII blurring for vision tasks.

3. **Multi-Channel Scalability** (MEDIUM)
   - Harden the **Lane Queue** to support 10+ concurrent remote clients.
   - Implement **Session Handoff**: Start a task on the CLI, approve it on Telegram, view results on the Web dashboard.

---

## 1. INTELLIGENCE IMPROVEMENTS

### 1.1 Effort-Aware Task Routing
The agent should automatically toggle its `effort` parameter:
- `low`: Discovery (list, grep), Status checks, Simple edits.
- `medium`: Feature implementation, Documentation.
- `max`: Bug investigation, Architecture refactoring, Plan generation.

### 1.2 Context Distillation (The Background Haiku)
Every 100k tokens, a background Haiku process must distill raw events into structured "Memos" to prevent context rot in the 1M window.

### 2.2 Token-Aware Context Management

**Current Problem:** Context pruning is message-count based, not token-aware.

**FAANG Solution - Token Budget System:**
```typescript
// New file: src/core/tokenBudget.ts
interface TokenBudget {
    total: number;           // 200,000 for Claude
    systemPrompt: number;    // ~2,000 typically
    tools: number;           // ~5,000 typically
    workingSet: number;      // Dynamic allocation
    conversation: number;    // Remaining budget
    safetyBuffer: number;    // 10% reserved
}

class TokenBudgetManager {
    private budget: TokenBudget;

    // Use tiktoken or similar for accurate counting
    estimateTokens(text: string): number;

    // Allocate budget dynamically based on task complexity
    reallocate(taskType: 'exploration' | 'editing' | 'conversation'): void;

    // Check if content fits within budget
    canFit(content: string, category: keyof TokenBudget): boolean;
}
```

### 2.3 Semantic Importance Scoring

**Current Problem:** All files in working set treated equally.

**FAANG Solution - Multi-Factor Importance:**
```typescript
interface ImportanceFactors {
    isModified: boolean;      // 2x weight if modified this session
    isEntryPoint: boolean;    // Higher weight for index.ts, main.ts
    hasRecentEdits: boolean;  // Files edited in last 5 interactions
    dependencyDepth: number;  // Core dependencies rank higher
    userExplicitFocus: boolean; // User mentioned file specifically
}

function calculateImportance(file: string, factors: ImportanceFactors): number {
    let score = 1.0;
    if (factors.isModified) score *= 2.0;
    if (factors.isEntryPoint) score *= 1.5;
    if (factors.hasRecentEdits) score *= 1.3;
    if (factors.userExplicitFocus) score *= 2.0;
    return score;
}
```

### 2.4 Intelligent History Compression

**Current Problem:** `compressHistory()` uses simple message count threshold.

**FAANG Solution - Semantic Compression:**
```typescript
interface MessageImportance {
    hasCodeChanges: boolean;
    hasUserDecision: boolean;
    hasError: boolean;
    hasSuccessfulAction: boolean;
    referencedFiles: string[];
}

async function smartCompress(messages: MessageParam[]): Promise<MessageParam[]> {
    // 1. Score each message for importance
    const scored = messages.map(m => ({
        message: m,
        importance: scoreMessage(m),
        canSummarize: !isRecentToolResult(m)
    }));

    // 2. Group low-importance adjacent messages
    const groups = groupForSummarization(scored);

    // 3. Summarize groups, preserve high-importance messages verbatim
    return await compressGroups(groups);
}
```

---

## 3. DATABASE IMPROVEMENTS

### 3.1 Add Missing Indexes
```sql
-- Performance indexes for common queries
CREATE INDEX IF NOT EXISTS idx_events_session_timestamp
    ON events(session_id, timestamp);

CREATE INDEX IF NOT EXISTS idx_working_set_session_rank
    ON working_set(session_id, rank_score DESC);

CREATE INDEX IF NOT EXISTS idx_tasks_session_status
    ON tasks(session_id, status);

CREATE INDEX IF NOT EXISTS idx_usage_stats_session
    ON usage_stats(session_id, timestamp);
```

### 3.2 Add Migration System
```typescript
// New file: src/core/migrations.ts
interface Migration {
    version: number;
    up: (db: Database) => void;
    down: (db: Database) => void;
}

const migrations: Migration[] = [
    {
        version: 1,
        up: (db) => {
            db.exec('ALTER TABLE working_set ADD COLUMN token_estimate INTEGER DEFAULT 0');
            db.exec('ALTER TABLE working_set ADD COLUMN importance_score REAL DEFAULT 1.0');
        },
        down: (db) => { /* ... */ }
    },
    {
        version: 2,
        up: (db) => {
            db.exec('CREATE INDEX idx_events_session_timestamp ON events(session_id, timestamp)');
        },
        down: (db) => { /* ... */ }
    }
];
```

### 3.3 Add Foreign Key Constraints
```sql
-- Enable foreign keys
PRAGMA foreign_keys = ON;

-- Recreate tables with proper constraints
CREATE TABLE IF NOT EXISTS subtasks_new (
    id TEXT PRIMARY KEY,
    task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    text TEXT NOT NULL,
    done INTEGER DEFAULT 0,
    position INTEGER
);
```

---

## 4. TESTING STRATEGY

### 4.1 Unit Tests (Priority: HIGH)

**Core Module Tests:**
```typescript
// tests/core/context.test.ts
describe('ContextManager', () => {
    describe('trackRead', () => {
        it('should add file to working set on first read');
        it('should increment access_count on subsequent reads');
        it('should update rank_score with time decay');
        it('should normalize file paths correctly');
    });

    describe('compressHistory', () => {
        it('should trigger at MAX_MESSAGES threshold');
        it('should preserve KEEP_FIRST and KEEP_LAST messages');
        it('should generate valid summary for middle messages');
    });
});

// tests/core/auditor.test.ts
describe('Auditor', () => {
    describe('checkCommand', () => {
        it('should block fork bombs');
        it('should block rm -rf /');
        it('should block curl|sh patterns');
        it('should require approval for rm -rf');
        it('should auto-approve in auto mode');
        it('should require approval in safe mode');
    });
});

// tests/core/tools.test.ts
describe('Tools', () => {
    describe('EditTool', () => {
        it('should fail if search string not found');
        it('should replace all occurrences');
        it('should record undo information');
        it('should track file as modified');
    });
});
```

### 4.2 Integration Tests (Priority: MEDIUM)

```typescript
// tests/integration/session.test.ts
describe('Session Lifecycle', () => {
    it('should persist context across save/restore');
    it('should restore LLM history correctly');
    it('should restore task progress');
    it('should handle corrupted session data gracefully');
});

// tests/integration/tool-chain.test.ts
describe('Tool Chain Execution', () => {
    it('should execute read -> edit -> verify workflow');
    it('should handle approval timeout correctly');
    it('should record all changes for undo');
});
```

### 4.3 E2E Tests (Priority: LOW)

```typescript
// tests/e2e/cli.test.ts
describe('CLI E2E', () => {
    it('should initialize with /init command');
    it('should switch modes with /mode command');
    it('should display context with /context command');
    it('should handle graceful shutdown with /exit');
});
```

---

## 5. SECURITY HARDENING

### 5.1 Enhanced Sensitive File Protection

```typescript
// In auditor.ts - Add to checkPath
const SENSITIVE_PATTERNS = [
    /\.env(\.[a-z]+)?$/i,           // .env, .env.local, etc.
    /\.pem$/i,                       // Private keys
    /\.key$/i,                       // Private keys
    /id_rsa/i,                       // SSH keys
    /credentials\.json$/i,           // GCP credentials
    /\.aws\/credentials$/i,          // AWS credentials
    /secrets?\.(yaml|yml|json)$/i,   // Secrets files
    /\.npmrc$/i,                      // NPM tokens
    /\.pypirc$/i,                     // PyPI tokens
];

function isSensitiveFile(filePath: string): boolean {
    return SENSITIVE_PATTERNS.some(p => p.test(filePath));
}
```

### 5.2 Output Sanitization

```typescript
// Enhance redactor.ts
const ADDITIONAL_PATTERNS = [
    /ghp_[a-zA-Z0-9]{36}/g,          // GitHub Personal Access Token
    /gho_[a-zA-Z0-9]{36}/g,          // GitHub OAuth Token
    /github_pat_[a-zA-Z0-9_]{82}/g,  // GitHub Fine-grained PAT
    /sk-[a-zA-Z0-9]{48}/g,           // OpenAI API Key
    /sk-ant-[a-zA-Z0-9-]{95}/g,      // Anthropic API Key
    /xox[baprs]-[a-zA-Z0-9-]+/g,     // Slack Tokens
];
```

### 5.3 Audit Log Improvements

```typescript
// In auditLog.ts - Add structured security events
interface SecurityEvent {
    timestamp: number;
    sessionId: string;
    eventType: 'blocked' | 'approved' | 'denied' | 'violation';
    category: 'command' | 'file' | 'network';
    details: {
        action: string;
        reason?: string;
        riskLevel: 'low' | 'medium' | 'high' | 'critical';
    };
}
```

---

## 6. ERROR HANDLING IMPROVEMENTS

### 6.1 Structured Error Types

```typescript
// New file: src/core/errors.ts
export class ObsidianError extends Error {
    constructor(
        message: string,
        public code: string,
        public recoverable: boolean = true,
        public userFacing: boolean = true
    ) {
        super(message);
        this.name = 'ObsidianError';
    }
}

export class SecurityError extends ObsidianError {
    constructor(message: string, public blocked: boolean = true) {
        super(message, 'SECURITY_ERROR', false, true);
    }
}

export class ContextError extends ObsidianError {
    constructor(message: string) {
        super(message, 'CONTEXT_ERROR', true, true);
    }
}

export class ToolExecutionError extends ObsidianError {
    constructor(message: string, public toolName: string) {
        super(message, 'TOOL_ERROR', true, true);
    }
}
```

### 6.2 Error Boundary Pattern

```typescript
// Wrap tool execution with error boundary
async function safeToolExecute(
    tool: Tool,
    args: Record<string, any>
): Promise<ToolResult> {
    try {
        return await tool.execute(args);
    } catch (error) {
        if (error instanceof SecurityError) {
            await auditLog.logSecurityViolation(tool.name, error.message);
            return { success: false, error: error.message };
        }
        if (error instanceof ToolExecutionError) {
            return { success: false, error: error.message };
        }
        // Unknown error - log and rethrow for investigation
        console.error(`Unexpected error in ${tool.name}:`, error);
        return { success: false, error: 'Internal tool error' };
    }
}
```

---

## 7. PERFORMANCE OPTIMIZATIONS

### 7.1 Lazy Loading

```typescript
// In tools.ts - Lazy load MCP tools
class ToolRegistry {
    private mcpToolsCache: Tool[] | null = null;
    private mcpToolsCacheTime: number = 0;
    private CACHE_TTL = 60000; // 1 minute

    async list(): Promise<Tool[]> {
        const staticTools = Array.from(this.tools.values());

        // Use cached MCP tools if still valid
        if (this.mcpToolsCache && Date.now() - this.mcpToolsCacheTime < this.CACHE_TTL) {
            return [...staticTools, ...this.mcpToolsCache];
        }

        // Refresh cache
        this.mcpToolsCache = await this.loadMCPTools();
        this.mcpToolsCacheTime = Date.now();

        return [...staticTools, ...this.mcpToolsCache];
    }
}
```

### 7.2 Database Connection Pooling

```typescript
// For high-concurrency scenarios (future-proofing)
class DatabasePool {
    private readonly pool: Database.Database[] = [];
    private readonly maxConnections = 5;

    acquire(): Database.Database {
        // Round-robin or least-busy selection
    }

    release(conn: Database.Database): void {
        // Return to pool
    }
}
```

### 7.3 History Debouncing Improvement

```typescript
// In history.ts - Use leading-edge debounce for better UX
class HistoryManager {
    private pendingEvents: AgentEvent[] = [];
    private flushTimer: NodeJS.Timeout | null = null;
    private readonly FLUSH_INTERVAL = 1000; // 1 second batches

    addEvent(event: AgentEvent): void {
        this.pendingEvents.push(event);

        if (!this.flushTimer) {
            this.flushTimer = setTimeout(() => this.flush(), this.FLUSH_INTERVAL);
        }
    }

    private async flush(): Promise<void> {
        const events = this.pendingEvents;
        this.pendingEvents = [];
        this.flushTimer = null;

        await this.batchInsert(events);
    }
}
```

---

## 8. IMPLEMENTATION PRIORITY

### Phase 1: Critical Fixes (1-2 days)
1. Fix duplicate GlobTool registration
2. Fix memory leak in LLM event listeners
3. Fix async/await issue in context size calculation
4. Add missing database indexes

### Phase 2: Context Management (3-5 days)
1. Implement time-decayed rank scoring
2. Add token-aware context management
3. Improve history compression with semantic scoring
4. Add importance factors for working set

### Phase 3: Testing (3-5 days)
1. Set up test infrastructure
2. Write unit tests for core modules (context, auditor, tools)
3. Write integration tests for session lifecycle
4. Add CI/CD pipeline with test requirements

### Phase 4: Security & Polish (2-3 days)
1. Enhance sensitive file detection
2. Improve output sanitization
3. Add structured error types
4. Implement error boundaries

### Phase 5: Performance (1-2 days)
1. Add lazy loading for MCP tools
2. Improve history batching
3. Add database migrations system

---

## 9. SUCCESS METRICS

After implementation, measure:

1. **Context Efficiency:** Track token usage per task completion
2. **Session Continuity:** Measure successful session restore rate
3. **Error Rate:** Track unhandled errors per 1000 interactions
4. **Test Coverage:** Target >80% for core modules
5. **Response Latency:** P95 tool execution time <2s

---

## Appendix: File-by-File Changes Summary

| File | Changes Required | Priority |
|------|-----------------|----------|
| `src/core/tools.ts` | Remove duplicate registration, add error boundary | HIGH |
| `src/core/llm.ts` | Fix listener leak, fix await bug, improve compression | HIGH |
| `src/core/context.ts` | Add decay scoring, token tracking, importance factors | HIGH |
| `src/core/database.ts` | Add indexes, migrations system, FK constraints | MEDIUM |
| `src/core/auditor.ts` | Add sensitive file patterns | MEDIUM |
| `src/core/redactor.ts` | Add more token patterns | MEDIUM |
| `src/core/history.ts` | Improve batching, add compression | LOW |
| `src/core/errors.ts` | NEW FILE - structured errors | MEDIUM |
| `tests/**` | NEW FILES - comprehensive test suite | HIGH |

