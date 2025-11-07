# grok-skill

A Claude Code Skill that routes X/Twitter queries to xAI **Grok 4** via **OpenRouter** with **Live Search** turned on and scoped to the **X** source.

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
brew install bun || curl -fsSL https://bun.sh/install | bash
```

### 4. Make script executable

```bash
chmod +x scripts/grok.ts
```

## Usage

```bash
# Minimal
bun scripts/grok.ts --q "what are people saying about account abstraction on X?"

# One-off (without shell export)
OPENROUTER_API_KEY="sk-or-..." bun scripts/grok.ts --q "latest crypto news"

# Handles + timeframe + filters
bun scripts/grok.ts \
  --q "AI developments" \
  --include "@OpenAI" "@AnthropicAI" \
  --from 2025-11-01 --to 2025-11-07 \
  --mode on --min-faves 25 --max 12
```

The script outputs JSON with a concise `summary`, `citations` (tweet URLs), and `usage`. Share a short synthesis with linked tweets.

**Security Note:** Never commit secrets. If you use a local `.env` file, ensure it's in `.gitignore`.

## Notes

- Live Search parameters used:
  - `mode`: `auto | on | off`
  - `return_citations`: `true`
  - `from_date` / `to_date` (YYYY-MM-DD)
  - `max_search_results` (default capped to 12 here)
  - `sources: [{ type: "x", included_x_handles|excluded_x_handles, post_favorite_count, post_view_count }]`

- Keep `--max` conservative for cost/latency; raise only if necessary.
