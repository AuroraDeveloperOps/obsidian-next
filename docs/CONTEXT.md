# Smart Context & Semantic Memory

Obsidian Next employs a multi-tiered **Context Mastery System** designed to leverage the 1 million token window of Claude 4.6 while maintaining lightning-fast responses and minimal costs.

## Architecture: The 1M Token Strategy

Instead of overwhelming the model with raw data, Obsidian uses a structural optimization strategy to maximize the value of every token.

### 1. The Anchor (Prompt Caching)
*   **Content**: System Persona, Workspace Schema (`MAP.md`), and core constraints.
*   **Behavior**: Placed at the very beginning of the prompt to hit Anthropic's **Prompt Caching** checkpoints. This reduces input costs by up to 90% for subsequent turns in the same session.

### 2. The Active Working Set
*   **Content**: Files currently being read or modified.
*   **Ranking**: Uses a time-decayed scoring algorithm. Files edited in the last 5 minutes get 2x weight; common entry points (e.g., `index.ts`) get 1.5x.
*   **Pruning**: Automatically drops low-score files from the active window to stay within the preferred performance bracket (sub-200k tokens) unless deep reasoning is required.

### 3. Episodic Summarization (The Distiller)
*   **Behavior**: When the "Body" of the conversation exceeds 100k tokens, a background process (`claude-haiku-4-5`) distills the intermediate steps into high-fidelity "Episodic Memos."
*   **Result**: Raw history is replaced by structured summaries, preventing "Context Rot" where the model loses track of early instructions in massive windows.

---

## Semantic Memory (sqlite-vec)

While the working set manages the *current session*, Obsidian uses **`sqlite-vec`** for global, cross-workspace awareness:

### 1. Local Vector Store
*   Every session, decision, and learned pattern is embedded locally and stored in `~/.obsidian-next/state.db`.
*   **Semantic Retrieval**: When you ask a question, Obsidian performs a K-Nearest Neighbor (KNN) search to find the most relevant past experiences, injecting them into the current prompt as `[RECALL]` blocks.

### 2. Bidirectional Markdown Sync (`MEMORY.md`)
*   The "Brain" of the agent is exposed as a human-readable Markdown file.
*   **User Intervention**: You can manually edit `MEMORY.md` to correct the agent's assumptions or provide new project-wide rules.
*   **Sync Logic**: The daemon watches for changes to `MEMORY.md` and automatically re-indexes edited sections into the semantic store.

---

## Performance Monitoring

The Obsidian UI provides real-time context verification (`/status` or `ESC` > Usage):

| Symbol | Meaning | Category |
|:---:|---|---|
| `⛁` | **Cached Prefix** | System Prompt and Static Schema (Cost optimized). |
| `⛁` | **Dynamic Body** | The reasoning loop and tool outputs. |
| `⛶` | **Free Window** | Available space in the 1M token beta window. |
| `⛝` | **Redacted** | Areas masked by the PII Redactor or visual guard. |

---

## Safety & Redaction

Before any context is sent to the LLM, it passes through the **Privacy Guard**:
1.  **PII Redaction**: Regular expressions and NER models strip emails, keys, and tokens.
2.  **Screenshot Masking**: (Pilot Mode) Blurs sensitive GUI areas before sending images to the vision model.
3.  **Audit Trail**: All redacted data is logged locally in `~/.obsidian-next/audit.log` but never reaches the cloud.
