# CLAUDE.md — grok-skill

Guidelines for Claude Code when working on the **grok-skill** repository.

---

## Repository Overview

| Item | Value |
|------|-------|
| **Purpose** | Claude Code Skill for X/Twitter search via Grok 4 (OpenRouter) |
| **Location** | `~/.claude/skills/grok-skill/` (user skill directory) |
| **Dev Repo** | `~/git/grok-skill/` (this repo for development) |
| **Primary Script** | `scripts/grok.ts` (Bun TypeScript) |
| **API Provider** | OpenRouter (`x-ai/grok-4` model) |
| **API Key Source** | Environment variable `$OPENROUTER_API_KEY` |
| **Runtime** | Bun |

---

## File Structure

```
grok-skill/
├── .gitignore         # Protects secrets (.env, .env.*)
├── SKILL.md           # Skill definition for Claude Code
├── README.md          # User documentation
├── CLAUDE.md          # This file (development guidelines)
└── scripts/
    └── grok.ts        # Main executable TypeScript script
```

---

## Architecture

### Module Responsibilities

**CLI Parsing (`parseArgs`):**
- Multi-value flag collection for `--include` / `--exclude`
- Validates `--mode` (on|off|auto)
- Validates numeric bounds for `--max`, `--min-faves`, `--min-views`
- Enforces mutual exclusivity between include/exclude

**Normalization:**
- Strips '@' prefix from handles
- Lowercases and deduplicates handles
- Caps handle lists at 10
- Validates dates to real calendar values (rejects 2025-02-30)
- Clamps `--max` to [1..50] range

**API Client (`fetchWithRetry`):**
- 30-second timeout via AbortController
- Exponential backoff retries (up to 3 attempts)
- Honors `Retry-After` header for rate limits
- Retries on 408/429/5xx errors
- Logs request-id when available

**Request Building:**
- Constructs `extra_body.search_parameters` with:
  - `mode`, `return_citations`, `max_search_results`
  - `from_date`, `to_date` (ISO format)
  - `sources` array with X-specific filters
- Sets temperature: 0.2, max_tokens: 1200

**Response Handling:**
- Primary: `choices[0].message.content`
- Fallback: `choices[0].delta.content`
- Citations: Checks `citations`, `choices[0].message.citations`, `extra.citations`
- Fallback: Extracts `https://x.com/*` and `https://twitter.com/*` URLs from text

**Error Handling:**
- Exit code 2: Usage/validation errors
- Exit code 3: Network/timeout errors
- Exit code 4: JSON parse errors

---

## Development Workflow

### 1. Making Changes

When modifying the skill:

1. **Edit files in this repo** (`~/git/grok-skill/`)
2. **Test changes** here first (see Testing section below)
3. **Deploy to skill directory** when ready:
   ```bash
   rsync -av --delete ~/git/grok-skill/ ~/.claude/skills/grok-skill/ --exclude '.git'
   ```
4. **Restart Claude Code** to reload the skill

### 2. Testing

```bash
# Set API key (choose your preferred method)
export OPENROUTER_API_KEY="sk-or-..."

# Test minimal query
bun scripts/grok.ts --q "test query"

# Test with filters
bun scripts/grok.ts \
  --q "recent activity" \
  --include "@OpenAI" "@AnthropicAI" \
  --from 2025-11-01 \
  --to 2025-11-07 \
  --mode on \
  --max 8

# Test error handling
bun scripts/grok.ts --q "test" --from "2025-02-30"  # Should reject invalid date
bun scripts/grok.ts --q "test" --mode invalid       # Should reject invalid mode
unset OPENROUTER_API_KEY && bun scripts/grok.ts --q "test"  # Should show helpful error
```

### 3. Validation Checklist

Before deploying changes:
- [ ] Script runs without errors
- [ ] `OPENROUTER_API_KEY` is set in environment
- [ ] JSON output includes: `query`, `summary`, `citations`, `usage`, `model`
- [ ] SKILL.md frontmatter is valid YAML
- [ ] Script is executable (`chmod +x scripts/grok.ts`)
- [ ] All personal references removed (no machine-specific paths)
- [ ] No secrets in code or git history

---

## Key Implementation Details

### Script Arguments

| Flag | Type | Description | Default |
|------|------|-------------|---------|
| `--q` | string | Query text (required) | - |
| `--mode` | `on\|off\|auto` | Live Search mode | `auto` |
| `--include` | string[] | X handles to include (max 10) | `[]` |
| `--exclude` | string[] | X handles to exclude (max 10) | `[]` |
| `--from` | YYYY-MM-DD | Start date for search | - |
| `--to` | YYYY-MM-DD | End date for search | - |
| `--max` | number | Max search results (1-50) | `12` |
| `--min-faves` | number | Min favorites per tweet | - |
| `--min-views` | number | Min views per tweet | - |

**Constraints:**
- `--include` and `--exclude` are mutually exclusive
- Dates must be in ISO format (YYYY-MM-DD) and valid calendar dates
- Handles are automatically stripped of '@' prefix, lowercased, and deduplicated

### OpenRouter API Configuration

**Request Structure:**
```typescript
{
  model: "x-ai/grok-4",  // Configurable via GROK_MODEL env
  messages: [
    { role: "system", content: "You are Grok 4 answering with X/Twitter Live Search..." },
    { role: "user", content: query }
  ],
  extra_body: {
    search_parameters: {
      mode: "auto|on|off",
      return_citations: true,
      max_search_results: 12,
      from_date: "2025-11-01",
      to_date: "2025-11-07",
      sources: [{
        type: "x",
        included_x_handles: ["handle1", "handle2"],
        post_favorite_count: 50,
        post_view_count: 0
      }]
    }
  },
  temperature: 0.2,
  max_tokens: 1200
}
```

**Response Handling:**
- Primary content: `choices[0].message.content` (fallback: `choices[0].delta.content`)
- Citations: `citations` | `choices[0].message.citations` | `extra.citations`
  - Fallback: Extract `https://x.com/*` and `https://twitter.com/*` URLs from summary text
- Usage stats: `usage` object forwarded to output
- Model identifier: `model` field (defaults to env or `x-ai/grok-4`)

### Response Format

```typescript
{
  query: string,           // Original query
  summary: string,         // Grok's formatted response
  citations: any[] | null, // Tweet URLs/citations (or extracted from text)
  usage: {                 // Token usage stats
    prompt_tokens: number,
    completion_tokens: number,
    total_tokens: number
  },
  model: string            // Model identifier
}
```

### Network Resilience

- **Timeout**: ~30 seconds via AbortController
- **Retries**: Up to 3 attempts on retriable errors (408, 429, 500, 502, 503, 504)
- **Backoff**: Exponential with jitter (500ms × 2^(attempt-1) + random 0-250ms)
- **Retry-After**: Honors rate limit headers when provided
- **Request IDs**: Logs `x-request-id` or `x-openrouter-id` for debugging

### Exit Codes

- `0` - Success
- `2` - Usage/validation error (invalid flags, missing env, constraint violations)
- `3` - Network/timeout error (connection failures, timeouts, abort)
- `4` - JSON parse error (malformed response)

---

## SKILL.md Requirements

Claude Code discovers skills via `SKILL.md` frontmatter:

```yaml
---
name: grok-skill
description: >
  Search and analyze X (Twitter) using xAI Grok 4 via OpenRouter with Live Search.
  Trigger on prompts that explicitly or implicitly ask to "search Twitter/X", "what's
  trending", "tweets from @handle", "hashtag #…", "what are people saying", or
  that require tweet-level activity/engagement from X.
---
```

**Trigger Patterns:**
- "search twitter/x for…"
- "what's trending on X"
- "tweets from @handle"
- "what are people saying about…"
- Any query requiring live X/Twitter data

---

## Common Issues & Solutions

### Issue: "Missing env OPENROUTER_API_KEY"

**Solution:**
```bash
# Set environment variable
export OPENROUTER_API_KEY="sk-or-..."

# Verify it's set
echo "$OPENROUTER_API_KEY"

# Persist to shell profile
echo 'export OPENROUTER_API_KEY="sk-or-..."' >> ~/.zshrc
source ~/.zshrc
```

### Issue: Sparse or no results

**Solutions:**
- Increase `--max` (try 15-20)
- Remove handle filters (`--include`/`--exclude`)
- Widen date range or remove date constraints
- Use `--mode on` to force Live Search

### Issue: Script not executable

**Solution:**
```bash
chmod +x ~/.claude/skills/grok-skill/scripts/grok.ts
```

### Issue: Citations are null

**Note:** This is expected behavior. Citations format varies by Grok's response. The summary field contains tweet URLs inline, and the script extracts them as a fallback.

---

## Security & Privacy

### Secrets Management

- **NEVER** commit `OPENROUTER_API_KEY` to git
- Store in environment variable or shell profile (`~/.zshrc`, `~/.bashrc`)
- If using a local `.env` file, ensure it's in `.gitignore`
- Rotate keys periodically via OpenRouter dashboard

### .gitignore Protection

The repository includes protection for:
```gitignore
.env
.env.*
!.env.example
```

This prevents accidental secret commits while allowing Bun's automatic `.env` loading for local development.

---

## Cost Management

**Token Usage:**
- Average: 700-1000 prompt tokens
- Average: 300-500 completion tokens
- Total per query: ~1000-1500 tokens

**Best Practices:**
- Keep `--max ≤ 12` for routine queries
- Use specific date ranges to limit scope
- Increase `--max` only when results are sparse
- Monitor usage via returned `usage` field

**OpenRouter Pricing:**
- Check current rates at [openrouter.ai/x-ai/grok-4](https://openrouter.ai/x-ai/grok-4)
- Live Search is in beta (free until June 5, 2025, inference tokens still charged)

---

## Deployment

### Deploy to User Skill Directory

```bash
# From dev repo
cd ~/git/grok-skill

# Deploy to Claude Code skills
rsync -av --delete . ~/.claude/skills/grok-skill/ --exclude '.git'

# Verify
ls -la ~/.claude/skills/grok-skill

# Restart Claude Code to reload skill
```

### Version Control

```bash
# Stage changes
git add -A

# Commit with conventional commit message
git commit -m "feat: add feature description"

# Push to GitHub
git push origin main
```

---

## Testing Guidelines

### Manual Testing Scenarios

1. **Basic functionality**: Simple query returns valid JSON
2. **Multi-value flags**: `--include "@a" "@b"` parses correctly
3. **Date validation**: Rejects invalid dates (2025-02-30)
4. **Mode validation**: Rejects invalid mode values
5. **Mutual exclusivity**: Errors when both include and exclude are set
6. **Missing API key**: Shows helpful, portable error message
7. **Network resilience**: Retries on transient failures
8. **Citation extraction**: Parses URLs from summary when citations null

### Suggested Unit Tests (Future)

```typescript
// Test suite suggestions (using Bun test)
describe("parseArgs", () => {
  test("multi-value includes", () => {...});
  test("mode validation", () => {...});
  test("mutual exclusivity", () => {...});
});

describe("ensureISO", () => {
  test("valid dates", () => {...});
  test("invalid calendar dates", () => {...});
});

describe("normalizeHandles", () => {
  test("strips @, lowercases, dedupes", () => {...});
  test("caps at 10", () => {...});
});
```

---

## Enhancement Ideas

Future improvements to consider:

**Completed:**
- ✅ Retry logic with exponential backoff
- ✅ Timeout handling
- ✅ Request ID logging

**Planned:**
- [ ] Add `--format` flag for output (JSON, Markdown, Plain)
- [ ] Support for hashtag filtering (`--hashtag #topic`)
- [ ] Caching layer for repeated queries
- [ ] Batch query mode for multiple searches
- [ ] Export results to file (`--output results.json`)
- [ ] Add `--dry-run` to preview request body (secrets redacted)
- [ ] Add `--verbose` flag for debug logging
- [ ] Add `--help` flag for inline usage

---

## Code Style

### TypeScript Standards

- Strict mode enabled in code
- Explicit types for interfaces (CLI, Mode)
- Prefer const over let
- Use template literals for multi-line strings
- Handle errors explicitly (no silent failures)

### Conventional Commits

When committing, use prefixes:
- `feat:` - New features
- `fix:` - Bug fixes
- `docs:` - Documentation only
- `refactor:` - Code restructuring
- `test:` - Test additions
- `chore:` - Maintenance tasks

---

## Related Documentation

- [OpenRouter Docs](https://openrouter.ai/docs) - API reference and pricing
- [Grok API Docs](https://docs.x.ai/docs) - xAI model documentation
- [Claude Code Skills](https://docs.claude.com/claude-code/skills) - Official skills guide
- [Bun Runtime Docs](https://bun.sh/docs) - Runtime reference

---

## Troubleshooting Development Issues

### Issue: Changes not reflected in Claude Code

**Solution:**
```bash
# Re-deploy to skill directory
rsync -av --delete ~/git/grok-skill/ ~/.claude/skills/grok-skill/ --exclude '.git'

# Restart Claude Code
```

### Issue: Testing requires API key

**Solution:**
```bash
# Set inline for testing (doesn't persist)
OPENROUTER_API_KEY="sk-or-..." bun scripts/grok.ts --q "test"

# Or export for session
export OPENROUTER_API_KEY="sk-or-..."
```

### Issue: Script changes not taking effect

**Solution:**
Bun caches modules. Clear cache or use:
```bash
bun --bun scripts/grok.ts --q "..."
```

---

**Last Updated:** 2025-11-07
**Repository:** https://github.com/mikedemarais/grok-skill
