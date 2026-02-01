# Smart Context Management

Obsidian Next employs a sophisticated **Smart Context System** designed to maximize "effective memory" while adhering to the 200k token limits of modern models (Claude 3.5 Sonnet).

Instead of a simple First-In-First-Out (FIFO) buffer which loses important context, or a "scratchpad" which consumes too many output tokens, Obsidian uses a structural compression strategy.

## Architecture

The conversation history is segmented into three distinct logical blocks:

### 1. The Head (Immutable)
*   **Size**: Fixed (First 2 messages).
*   **Content**: The User's initial intent and the System's primary constraints.
*   **Behavior**: NEVER pruned. This ensures the agent never forgets *why* it is here or *who* it is.

### 2. The Body (Compressible)
*   **Size**: Variable (The middle 70-80% of history).
*   **Content**: The "journey" of the session—reasoning steps, tool executions, and intermediate results.
*   **Behavior**: **Semantic Summarization**.
    *   When the context limit approaches (e.g., >160k tokens), Obsidian identifies the oldest chunks of the "Body".
    *   It dispatches these chunks to a high-speed, low-cost model (Claude 3 Haiku).
    *   The model generates a concise bulleted summary of key decisions, file changes, and discoveries.
    *   The original high-token messages are replaced by a single `[Context Summary]` message.

### 3. The Tail (Active)
*   **Size**: Fixed (Last 10-15 messages).
*   **Content**: The immediate immediate context—current error messages, file contents being edited, and the very last user prompt.
*   **Behavior**: Protected from pruning to maintain immediate conversational fluidity.

---

## Visualization

The Obsidian UI provides a 10x10 token verification grid (`/context` or `ESC` > Usage) to visualize this structure:

| Symbol | Meaning | Category |
|:---:|---|---|
| `⛁` | **Static Context** | System Prompt, cached Tools, and Immutable Head. |
| `⛁` | **Active Messages** | The dynamic Body and Tail messages. |
| `⛶` | **Free Space** | Available capacity before warning/pruning triggers. |
| `⛝` | **Safety Buffer** | Reserved space (top 2-5%) to prevent API hard-limits. |

---

## Pruning Triggers

*   **Warning (80%)**: UI alerts the user that context is filling up.
*   **Compression (90%)**: The "Body" summarization logic triggers automatically.
*   **Hard Stop (98%)**: Agent halts to prevent context overflow errors, requesting manual intervention (rare).

## Session Persistence

The entire context structure—including the compressed summaries—is preserved when using `/exit` and `/resume`. This allows you to pause a multi-day engineering task and resume with the AI fully "aware" of previous structural decisions without re-reading the entire raw history.
