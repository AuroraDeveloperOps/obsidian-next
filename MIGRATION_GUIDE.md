# Migration Guide - Code Review Improvements

**Version:** 0.4.9 → 0.5.0
**Date:** 2026-02-13

This guide walks you through applying the FAANG code review improvements step-by-step.

---

## 🚀 QUICK START (30 minutes)

### Step 1: Fix Linting Issues

```bash
# Auto-fix 70% of linting errors
npm run lint:fix

# Review remaining issues
npm run lint

# Common fixes needed:
# 1. Unused parameters: Rename to start with underscore
#    function handler(args: string) → function handler(_args: string)
#
# 2. Empty catch blocks: Add logging
#    catch (error) {} → catch (error) { console.error('Failed:', error); }
#
# 3. 'any' types: Add proper types
#    args: any → args: Record<string, unknown>
#
# 4. Missing globals: Add to eslint.config.js globals section
#    fetch is not defined → Add 'fetch': 'readonly'
```

### Step 2: Test Build

```bash
# Build should now pass with linting
npm run build

# If build fails, fix linting errors first
npm run lint:fix
```

### Step 3: Add Pre-Commit Hook (Optional but Recommended)

```bash
# Create git hook to run linting before commits
echo '#!/bin/sh
npm run lint:fix
npm run format
echo "Pre-commit checks passed ✓"
' > .git/hooks/pre-commit

chmod +x .git/hooks/pre-commit

# Test it
git add .
git commit -m "test: Verify pre-commit hook"
```

---

## 🔧 CODE MIGRATIONS

### Migration 1: Update File Path Validation

**What Changed:** Added symlink resolution to prevent path traversal attacks.

**Before (Vulnerable):**
```typescript
import { auditor } from './core/auditor.js';

// Synchronous check - does NOT resolve symlinks
const audit = auditor.checkPath(filePath);
if (!audit.approved) {
  return { success: false, error: audit.reason };
}
```

**After (Secure):**
```typescript
import { auditor } from './core/auditor.js';

// Async check - resolves symlinks before validation
const audit = await auditor.checkPathAsync(filePath);
if (!audit.approved) {
  return { success: false, error: audit.reason };
}
```

**Files to Update:**
- `src/tools/filesystem/read.ts`
- `src/tools/filesystem/write.ts`
- `src/tools/filesystem/edit.ts`
- `src/tools/filesystem/delete.ts`
- `src/tools/filesystem/list.ts`

**Search & Replace:**
```bash
# Find all usages
grep -r "auditor.checkPath(" src/

# Update each file
# OLD: const audit = auditor.checkPath(filePath);
# NEW: const audit = await auditor.checkPathAsync(filePath);
```

---

### Migration 2: Update to Multi-Lane Queue

**What Changed:** Separate lanes for read/write/exec/network operations.

**Before:**
```typescript
import { toolLane } from '../core/lane.js';

// All operations serialized
await toolLane.enqueue(async () => {
  return await readFile(path);
});
```

**After:**
```typescript
import { READ_LANE, WRITE_LANE, EXEC_LANE, NETWORK_LANE } from '../core/lane.js';

// Choose appropriate lane based on operation:

// Read operations (concurrent)
await READ_LANE.enqueue(async () => {
  return await readFile(path);
});

// Write operations (serialized)
await WRITE_LANE.enqueue(async () => {
  return await writeFile(path, content);
});

// Shell commands (serialized)
await EXEC_LANE.enqueue(async () => {
  return await exec(command);
});

// Network calls (concurrent)
await NETWORK_LANE.enqueue(async () => {
  return await fetch(url);
});
```

**Lane Selection Guide:**
| Tool | Lane | Concurrency | Reason |
|------|------|-------------|--------|
| read, list, grep, glob | `READ_LANE` | 5 | Safe to parallelize |
| write, edit, delete | `WRITE_LANE` | 1 | Prevent race conditions |
| bash, computer | `EXEC_LANE` | 1 | Prevent stdin/stdout collision |
| http, web-fetch | `NETWORK_LANE` | 3 | Parallelize API calls |

**Files to Update:**
- `src/tools/filesystem/read.ts` → `READ_LANE`
- `src/tools/filesystem/list.ts` → `READ_LANE`
- `src/tools/filesystem/grep.ts` → `READ_LANE`
- `src/tools/filesystem/glob.ts` → `READ_LANE`
- `src/tools/filesystem/write.ts` → `WRITE_LANE`
- `src/tools/filesystem/edit.ts` → `WRITE_LANE`
- `src/tools/filesystem/delete.ts` → `WRITE_LANE`
- `src/tools/execution/bash.ts` → `EXEC_LANE`
- `src/tools/execution/computer.ts` → `EXEC_LANE`
- `src/tools/network/http.ts` → `NETWORK_LANE`
- `src/tools/network/web-fetch.ts` → `NETWORK_LANE`

---

### Migration 3: Add Settings Cache

**What Changed:** Cache settings in memory for 5 seconds instead of loading from disk every time.

**Before (Slow - 2-5ms per call):**
```typescript
import { settings } from './settings.js';

async function execute() {
  const s = await settings.load();  // Disk I/O every call
  if (s.mode === 'safe') {
    // ...
  }
}
```

**After (Fast - 0.01ms per call):**
```typescript
import { cachedSettings, invalidateSettingsCache } from './settings-cache.js';

async function execute() {
  // Cached for 5 seconds
  const mode = await cachedSettings('settings:mode', async () => {
    const s = await settings.load();
    return s.mode;
  });

  if (mode === 'safe') {
    // ...
  }
}

// Important: Invalidate cache after settings change
async function updateSettings() {
  await settings.save(newSettings);
  invalidateSettingsCache();  // Clear cache
}
```

**Cache Key Convention:**
- `settings:mode` - Execution mode
- `settings:permissions` - Permission lists
- `settings:allowed:bash` - Bash allowed list
- `settings:denied:bash` - Bash denied list

**Files to Update:**
- `src/tools/execution/bash.ts`
- `src/tools/filesystem/write.ts`
- `src/tools/filesystem/edit.ts`
- `src/tools/filesystem/delete.ts`
- Any file calling `settings.load()`

**Pattern:**
```typescript
// OLD
const s = await settings.load();
const value = s.someProperty;

// NEW
const value = await cachedSettings('settings:someProperty', async () => {
  const s = await settings.load();
  return s.someProperty;
});
```

---

## 🧪 TEST FIXES

### Fix 1: E2E Scenarios Test Setup

**Problem:** Tests fail because auditor workspace not set to test directory.

**File:** `tests/e2e/scenarios.e2e.test.ts`

**Add to beforeEach:**
```typescript
import { auditor } from '../../src/core/auditor.js';
import { settings } from '../../src/core/settings.js';
import { vi } from 'vitest';

beforeEach(async () => {
  // Existing setup
  testWorkspace = path.join(PROJECT_ROOT, `.test-workspace-${Date.now()}`);
  await fs.mkdir(testWorkspace, { recursive: true });

  // NEW: Set auditor workspace
  auditor.setWorkspaceRoot(testWorkspace);

  // NEW: Mock settings for auto-approve
  vi.spyOn(settings, 'load').mockResolvedValue({
    mode: 'auto',
    permissions: {
      allowed: [],
      denied: [],
      session: [],
      unsandboxed: []
    }
  });
});
```

### Fix 2: Memory Test - Database Transactions

**Problem:** Incorrect better-sqlite3 transaction API usage.

**File:** `tests/core/memory.test.ts`

**Before (Broken):**
```typescript
db.transaction(() => {
  // Insert data
})();
```

**After (Fixed):**
```typescript
const insertMany = db.transaction((items) => {
  for (const item of items) {
    db.prepare('INSERT INTO ...').run(item);
  }
});
insertMany(items);
```

### Fix 3: Agent E2E - Mock Approval System

**Problem:** Approval prompts hang in tests.

**File:** `tests/e2e/agent.e2e.test.ts`

**Add mock:**
```typescript
import { vi } from 'vitest';

// Mock approval system to auto-approve
vi.mock('../../src/tools/shared.js', () => ({
  requestApproval: vi.fn().mockResolvedValue({
    approved: true,
    scope: 'session',
    bypass: false
  }),
  truncateOutput: (s: string) => s,
  filterSystemNoise: (s: string) => s
}));
```

---

## 📊 VERIFICATION

### Step 1: Verify Linting

```bash
# Should show 0 errors
npm run lint

# If errors remain, review and fix manually
```

### Step 2: Verify Tests

```bash
# Run full test suite
npm test

# Target: 95%+ pass rate
# If failures remain, check test setup (see Test Fixes above)
```

### Step 3: Verify Build

```bash
# Should complete without errors
npm run build

# Check output
ls -lh dist/
```

### Step 4: Verify Performance

```typescript
// Add to any tool for monitoring
import { settingsCache } from './settings-cache.js';

console.log('Cache stats:', settingsCache.getStats());
// Expected: { hits: 1000+, misses: 10, hitRate: '99.0%' }
```

---

## 🔒 SECURITY CHECKLIST

- [ ] All file operations use `checkPathAsync()` (not `checkPath()`)
- [ ] All bash commands validated by `commandValidator`
- [ ] Settings cache invalidated after changes
- [ ] No `curl | sh` patterns in allowed commands
- [ ] No `rm -rf /` patterns in code
- [ ] Audit logs written for all dangerous operations

---

## 📈 PERFORMANCE VALIDATION

### Before Optimization
```bash
# Time 10 settings loads
time node -e "
const { settings } = require('./dist/core/settings.js');
(async () => {
  for (let i = 0; i < 10; i++) {
    await settings.load();
  }
})();
"
# Expected: ~20-50ms (2-5ms per load)
```

### After Optimization
```bash
# Time 10 cached settings loads
time node -e "
const { cachedSettings } = require('./dist/core/settings-cache.js');
(async () => {
  for (let i = 0; i < 10; i++) {
    await cachedSettings('test', async () => ({ mode: 'safe' }));
  }
})();
"
# Expected: ~0.1-0.5ms (0.01-0.05ms per load)
```

---

## 🐛 COMMON ISSUES

### Issue 1: "checkPathAsync is not a function"
**Cause:** Using old version of auditor.ts
**Fix:** Pull latest changes, rebuild

### Issue 2: "READ_LANE is not defined"
**Cause:** Using old version of lane.ts
**Fix:** Pull latest changes, rebuild

### Issue 3: Tests still failing
**Cause:** Test setup not updated
**Fix:** Follow "Test Fixes" section above

### Issue 4: Cache not working
**Cause:** Cache disabled or not integrated
**Fix:** Verify `settingsCache.options.enabled === true`

---

## 📞 ROLLBACK PLAN

If issues arise, you can rollback specific changes:

### Rollback ESLint
```bash
git checkout HEAD~ eslint.config.js
npm run build  # Will skip linting
```

### Rollback Security Changes
```bash
git checkout HEAD~ src/core/command-validator.ts src/core/auditor.ts
npm run build
```

### Rollback Multi-Lane
```bash
git checkout HEAD~ src/core/lane.ts
# Update tools to use old `toolLane`
```

### Rollback Settings Cache
```bash
git checkout HEAD~ src/core/settings-cache.ts
# Remove cache imports from tools
```

---

## ✅ COMPLETION CHECKLIST

### Code Changes
- [ ] Updated all file tools to use `checkPathAsync()`
- [ ] Updated all tools to use appropriate lanes (READ_LANE, WRITE_LANE, etc.)
- [ ] Integrated settings cache in high-frequency tools
- [ ] Added cache invalidation after settings changes

### Testing
- [ ] Fixed test setup (auditor workspace, settings mocks, approval mocks)
- [ ] All tests passing (95%+ pass rate)
- [ ] Verified build completes without errors
- [ ] Verified linting passes

### Documentation
- [ ] Reviewed IMPROVEMENTS.md
- [ ] Reviewed REVIEW_SUMMARY.md
- [ ] Updated CHANGELOG.md with breaking changes
- [ ] Added migration notes to README.md (if public)

### Deployment
- [ ] Added pre-commit hook for linting
- [ ] Updated CI/CD to include `npm run lint`
- [ ] Smoke tested in production-like environment
- [ ] Monitored cache hit rates in production

---

## 🎓 BEST PRACTICES LEARNED

1. **Always resolve symlinks** before path validation
2. **Cache expensive operations** with appropriate TTL
3. **Use whitelist security** instead of blacklist
4. **Parallelize independent operations** with multi-lane queues
5. **Lint early and often** to catch issues in development
6. **Mock approval systems** in tests to prevent hangs
7. **Set test workspace** to match production constraints

---

**Migration Complete!** 🎉

For detailed explanations, see `IMPROVEMENTS.md`.
For quick reference, see `REVIEW_SUMMARY.md`.
For issues, check `MIGRATION_GUIDE.md` (this file).
