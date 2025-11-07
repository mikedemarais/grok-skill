# grok-skill

[![Built with Bun](https://img.shields.io/badge/runtime-bun-000000.svg?logo=bun)](https://bun.sh)
[![TypeScript](https://img.shields.io/badge/language-typescript-3178C6.svg?logo=typescript)](https://www.typescriptlang.org/)
[![OpenRouter](https://img.shields.io/badge/api-OpenRouter-4B8BBE.svg)](https://openrouter.ai)
[![License: MIT](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)

A Claude Code Skill that routes X/Twitter queries to xAI **Grok 4** via **OpenRouter** with **Live Search** turned on and scoped to the **X** source.

## Features

- **Live Search** - Real-time X/Twitter data via Grok 4's Live Search
- **Handle Filtering** - Multi-value `--include` / `--exclude` for targeted searches
- **Date Range Queries** - Time-bounded searches with calendar validation
- **Engagement Filters** - Filter by favorites and views
- **Network Resilience** - Automatic retries with exponential backoff
- **Citation Extraction** - Tweet URLs with fallback parsing
- **Production Ready** - Comprehensive error handling and validation

## Quick Start

```bash
# 1. Set your OpenRouter API key
export OPENROUTER_API_KEY="sk-or-..."

# 2. Run a query (assumes Bun is installed)
bun scripts/grok.ts --q "what's trending on X about AI?"
```

That's it! The script returns JSON with summary, citations, and usage stats.

## Install

### 1. Get an OpenRouter API Key

Sign up at [openrouter.ai](https://openrouter.ai) and create an API key.

### 2. Set Environment Variable

```bash
# Set your OpenRouter key
export OPENROUTER_API_KEY="sk-or-..."

# Verify it's set
echo "$OPENROUTER_API_KEY"

# To persist across sessions, add to your shell profile:
echo 'export OPENROUTER_API_KEY="sk-or-..."' >> ~/.zshrc
source ~/.zshrc
```

### 3. Install Bun (if needed)

```bash
# macOS/Linux
brew install bun || curl -fsSL https://bun.sh/install | bash

# Windows
powershell -c "irm bun.sh/install.ps1|iex"
```

### 4. Clone and Setup

```bash
# Clone to Claude Code skills directory
git clone https://github.com/mikedemarais/grok-skill.git ~/.claude/skills/grok-skill

# Make script executable
chmod +x ~/.claude/skills/grok-skill/scripts/grok.ts

# Restart Claude Code to discover the skill
```

## Usage

```bash
# Minimal query
bun scripts/grok.ts --q "what are people saying about account abstraction on X?"

# One-off (without shell export)
OPENROUTER_API_KEY="sk-or-..." bun scripts/grok.ts --q "latest crypto news"

# Handles + timeframe + filters
bun scripts/grok.ts \
  --q "AI developments" \
  --include "@OpenAI" "@AnthropicAI" \
  --from 2025-11-01 --to 2025-11-07 \
  --mode on --min-faves 25 --max 12

# Exclude specific handles
bun scripts/grok.ts \
  --q "crypto market sentiment" \
  --exclude "@spam_account" \
  --max 20
```

## Flags

| Flag | Type | Description | Default |
|------|------|-------------|---------|
| `--q` | `string` | Query text (required) | - |
| `--mode` | `on\|off\|auto` | Live Search mode | `auto` |
| `--include` | `@handle...` | X handles to include (max 10) | `[]` |
| `--exclude` | `@handle...` | X handles to exclude (max 10) | `[]` |
| `--from` | `YYYY-MM-DD` | Start date for search | - |
| `--to` | `YYYY-MM-DD` | End date for search | - |
| `--max` | `1..50` | Max search results | `12` |
| `--min-faves` | `integer` | Min favorites per tweet (≥ 0) | - |
| `--min-views` | `integer` | Min views per tweet (≥ 0) | - |

**Environment Variables:**
- `OPENROUTER_API_KEY` (required) - Your OpenRouter API key
- `GROK_MODEL` (optional) - Override model (default: `x-ai/grok-4`)

**Constraints:**
- `--include` and `--exclude` are mutually exclusive
- Dates must be valid calendar dates in `YYYY-MM-DD` format
- Handles automatically stripped of '@' prefix and normalized

## Sample Output

```json
{
  "query": "AI developments",
  "summary": "- **OpenAI releases GPT-5**: Major improvements in reasoning...\n- **Anthropic Claude updates**: New vision capabilities announced...\n- **xAI Grok integration**: Now available via OpenRouter API...",
  "citations": [
    "https://x.com/OpenAI/status/1234567890",
    "https://x.com/AnthropicAI/status/9876543210",
    "https://x.com/xai/status/5555555555"
  ],
  "usage": {
    "prompt_tokens": 892,
    "completion_tokens": 312,
    "total_tokens": 1204
  },
  "model": "x-ai/grok-4"
}
```

## Troubleshooting

### Missing API Key
```bash
# Error: "Missing env OPENROUTER_API_KEY"
export OPENROUTER_API_KEY="sk-or-..."
```

### HTTP 429 / Rate Limits
The client automatically retries with exponential backoff. If you still hit limits:
- Wait a few minutes and retry
- Reduce `--max` to make smaller requests
- Check your OpenRouter account rate limits

### Sparse or No Results
- Increase `--max` (try 15-20)
- Remove or relax `--include`/`--exclude` filters
- Widen or remove date range constraints
- Use `--mode on` to force Live Search

### Citations are Null
This is normal. The script extracts X/Twitter URLs from the summary text as a fallback. Check the `citations` array for discovered links.

### Script Not Executable
```bash
chmod +x scripts/grok.ts
```

## Configuration

### Live Search Parameters

- **mode**: Controls Live Search behavior
  - `auto` (default) - Model decides whether to search
  - `on` - Forces Live Search
  - `off` - Disables search, uses model knowledge only

- **return_citations**: Always `true` to get tweet URLs

- **max_search_results**: Capped at 12 by default for cost/latency

- **sources**: Configured for X/Twitter with optional filters:
  - `included_x_handles` / `excluded_x_handles`
  - `post_favorite_count` / `post_view_count`

### Network Resilience

- **Timeout**: 30 seconds per request via AbortController
- **Retries**: Up to 3 attempts on 408/429/5xx errors
- **Backoff**: Exponential with jitter (500ms × 2^attempt)
- **Retry-After**: Honors rate limit headers when provided

### Exit Codes

- `0` - Success
- `2` - Usage/validation error
- `3` - Network/timeout error
- `4` - JSON parse error

## Cost Management

**Typical token usage per query:**
- Prompt tokens: ~700-1000
- Completion tokens: ~300-500
- Total: ~1000-1500 tokens

**Best practices:**
- Keep `--max ≤ 12` for routine queries
- Use specific date ranges to limit scope
- Monitor costs via the `usage` field in output
- Increase `--max` only when results are sparse

## Contributing

Contributions welcome! Please:
- Open an issue for bugs or feature requests
- Submit PRs with clear descriptions
- Follow the existing code style
- Test changes before submitting

## License

MIT - see [LICENSE](LICENSE)

## Related

- [OpenRouter Documentation](https://openrouter.ai/docs)
- [Grok 4 API Docs](https://docs.x.ai/docs)
- [Claude Code Skills Guide](https://docs.claude.com/claude-code/skills)
- [Bun Runtime](https://bun.sh/docs)

---

**Security Note:** Never commit secrets. If you use a local `.env` file, ensure it's in `.gitignore`.
