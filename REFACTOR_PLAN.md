# Refactor Plan - Quick Reference

## Context So Far

### ✅ Completed
1. **MoE Implementation** - Offline providers working
2. **UI Flicker Fix** - Removed glitch animations
3. **Build & Link** - Everything compiles
4. **Analysis** - Identified problem areas

### 🎯 Current Task
Refactoring `tools.ts` (2,476 lines) → Split into modules

## File Structure Found

**Current:**
```
src/core/tools.ts (2,476 lines)
├── Line 1-145: Imports, helpers, approval system
├── Line 146-173: Type definitions
├── Line 174-250: BashTool
├── Line 251-330: ReadTool
├── Line 331-420: WriteTool
├── Line 421-550: EditTool
├── Line 551-650: ListTool
├── Line 651-750: GrepTool
├── Line 751-850: GlobTool
├── Line 851-950: WebFetchTool
├── Line 951-1050: HttpRequestTool
├── Line 1051-1150: DeleteTool
├── Line 1151-1250: MemoryTool
├── Line 1251-1350: ComputerUseTool
├── Line 1351-1450: MCPManageTool
├── Line 1451-1550: MCPCallTool
├── Line 1551-1650: SchedulerTool
├── Line 1651-1750: TaskTool
└── Line 1751-2476: ToolRegistry class
```

## Refactor Steps

### Step 1: Create Base Infrastructure
```bash
# Already done
mkdir -p src/tools/{filesystem,execution,network,mcp,system}
```

### Step 2: Extract Shared Code
Create `src/tools/shared.ts`:
```typescript
export { truncateOutput, filterSystemNoise, requestApproval }
export type { Tool, ToolResult, ToolParameterSchema, ToolContentBlock }
```

### Step 3: Move Tools to Modules

**Filesystem:**
- `src/tools/filesystem/read.ts` - ReadTool
- `src/tools/filesystem/write.ts` - WriteTool
- `src/tools/filesystem/edit.ts` - EditTool
- `src/tools/filesystem/delete.ts` - DeleteTool
- `src/tools/filesystem/list.ts` - ListTool
- `src/tools/filesystem/glob.ts` - GlobTool
- `src/tools/filesystem/grep.ts` - GrepTool

**Execution:**
- `src/tools/execution/bash.ts` - BashTool
- `src/tools/execution/computer.ts` - ComputerUseTool

**Network:**
- `src/tools/network/web-fetch.ts` - WebFetchTool
- `src/tools/network/http.ts` - HttpRequestTool

**MCP:**
- `src/tools/mcp/manage.ts` - MCPManageTool
- `src/tools/mcp/call.ts` - MCPCallTool

**System:**
- `src/tools/system/memory.ts` - MemoryTool
- `src/tools/system/scheduler.ts` - SchedulerTool
- `src/tools/system/task.ts` - TaskTool

### Step 4: Create Registry
`src/tools/index.ts`:
```typescript
import { BashTool } from './execution/bash.js';
import { ReadTool } from './filesystem/read.js';
// ... import all

export class ToolRegistry {
  private tools = [
    BashTool,
    ReadTool,
    // ... all tools
  ];

  list() { return this.tools; }
  execute(name, args) { /* ... */ }
}

export const tools = new ToolRegistry();
```

### Step 5: Update Imports
Replace:
```typescript
import { tools } from './core/tools.js';
```

With:
```typescript
import { tools } from './tools/index.js';
```

Files to update:
- `src/core/llm.ts`
- `src/core/agent.ts`
- `src/commands/*.ts`

### Step 6: Test
```bash
npm run build
npm test
npm start
# Test basic commands
```

## Template for Each Tool File

```typescript
// src/tools/filesystem/read.ts
import fs from 'fs/promises';
import { Tool, ToolResult } from '../shared.js';
import { truncateOutput } from '../shared.js';
import { config } from '../../core/config.js';

export const ReadTool: Tool = {
  name: 'read',
  description: '...',
  inputSchema: { /* ... */ },
  requiredParams: ['path'],

  async execute(args): Promise<ToolResult> {
    // Implementation
  }
};
```

## Progress Tracking

- [ ] Create shared.ts
- [ ] Move BashTool
- [ ] Move ReadTool
- [ ] Move WriteTool
- [ ] Move EditTool
- [ ] Move DeleteTool
- [ ] Move ListTool
- [ ] Move GrepTool
- [ ] Move GlobTool
- [ ] Move WebFetchTool
- [ ] Move HttpRequestTool
- [ ] Move MemoryTool
- [ ] Move ComputerUseTool
- [ ] Move MCPManageTool
- [ ] Move MCPCallTool
- [ ] Move SchedulerTool
- [ ] Move TaskTool
- [ ] Create index.ts
- [ ] Update imports
- [ ] Build & test
- [ ] Delete old tools.ts

## Time Estimate
- 1-2 hours total
- 5-10 min per tool
- 17 tools to move

## Next After This
1. Add prettier/eslint
2. Format all code
3. Split llm.ts
4. Add tests

## Notes
- Keep approval system in shared.ts
- Maintain exact same API
- No breaking changes
- Each tool is independent
- Easy to test individually
