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
| **Runtime** | Bun (installed via mise) |

---

## File Structure

```
grok-skill/
├── SKILL.md           # Skill definition for Claude Code
├── README.md          # User documentation
├── CLAUDE.md          # This file (development guidelines)
└── scripts/
    └── grok.ts        # Main executable TypeScript script
```

---

## Development Workflow

### 1. Making Changes

When modifying the skill:

1. **Edit files in this repo** (`~/git/grok-skill/`)
2. **Test changes** here first
3. **Deploy to skill directory** when ready:
   ```bash
   rsync -av --delete ~/git/grok-skill/ ~/.claude/skills/grok-skill/
   ```

### 2. Testing

```bash
# Source secrets for API key
source ~/.zsh_secrets

# Test minimal query
bun scripts/grok.ts --q "test query"

# Test with filters
bun scripts/grok.ts \
  --q "recent activity" \
  --include "@rainbowdotme" \
  --from 2025-11-01 \
  --to 2025-11-07 \
  --mode on \
  --max 8
```

### 3. Validation Checklist

Before deploying changes:
- [ ] Script runs without errors
- [ ] API key is properly sourced from `~/.zsh_secrets`
- [ ] JSON output includes: `query`, `summary`, `citations`, `usage`, `model`
- [ ] SKILL.md frontmatter is valid YAML
- [ ] Script is executable (`chmod +x scripts/grok.ts`)

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
- Dates must be in ISO format (YYYY-MM-DD)
- Handles are automatically stripped of '@' prefix

### OpenRouter API Configuration

```typescript
// Request structure
{
  model: "x-ai/grok-4",
  messages: [
    { role: "system", content: "..." },
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

### Response Format

```typescript
{
  query: string,           // Original query
  summary: string,         // Grok's formatted response
  citations: any[] | null, // Tweet URLs/citations
  usage: {                 // Token usage stats
    prompt_tokens: number,
    completion_tokens: number,
    total_tokens: number
  },
  model: string            // Model identifier
}
```

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
# Verify key is in secrets
grep OPENROUTER_API_KEY ~/.zsh_secrets

# Source secrets manually
source ~/.zsh_secrets

# Verify key is set
echo $OPENROUTER_API_KEY
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

**Note:** This is expected behavior. Citations format varies by Grok's response. The summary field contains tweet URLs inline when available.

---

## Security & Privacy

### Secrets Management

- **NEVER** commit `OPENROUTER_API_KEY` to git
- Key stored in `~/.zsh_secrets` (encrypted via chezmoi)
- `~/.zsh_secrets` is in `.gitignore` (dotfiles repo)
- Use `chezmoi secret` commands for rotation

### API Key Rotation

```bash
# Edit secrets safely
chezmoi secret edit ~/.zsh_secrets

# Update OPENROUTER_API_KEY line
# Save and reload shell
source ~/.zshrc
```

---

## Cost Management

**Token Usage:**
- Average: 700-1000 prompt tokens
- Average: 300-500 completion tokens
- Total per query: ~1000-1500 tokens

**Best Practices:**
- Keep `--max` ≤ 12 for routine queries
- Use specific date ranges to limit scope
- Increase `--max` only when results are sparse
- Monitor usage via returned `usage` field

---

## Deployment

### Deploy to User Skill Directory

```bash
# From dev repo
cd ~/git/grok-skill

# Deploy to Claude Code skills
rsync -av --delete . ~/.claude/skills/grok-skill/

# Verify
eza -la ~/.claude/skills/grok-skill
```

### Version Control

```bash
# Stage changes
git add -A

# Commit
git commit -m "Add: feature description"

# Push to remote (if configured)
git push origin main
```

---

## Enhancement Ideas

Future improvements to consider:
- [ ] Add `--format` flag for output (JSON, Markdown, Plain)
- [ ] Support for hashtag filtering (`--hashtag #topic`)
- [ ] Rate limiting / retry logic for API failures
- [ ] Caching layer for repeated queries
- [ ] Batch query mode for multiple searches
- [ ] Export results to file (`--output results.json`)

---

## Related Documentation

- [OpenRouter Docs](https://openrouter.ai/docs)
- [Grok API Docs](https://docs.x.ai/docs)
- [Claude Code Skills](https://docs.claude.com/claude-code/skills)
- [Bun Runtime Docs](https://bun.sh/docs)

---

**Last Updated:** 2025-11-06
**Maintained By:** @mikedemarais
