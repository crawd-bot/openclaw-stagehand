# openclaw-stagehand

OpenClaw plugin for AI-powered browser automation via [Stagehand](https://github.com/browserbase/stagehand). Headed Chrome with persistent profiles — cookies, localStorage, and login sessions survive across restarts.

## Install

### From local path

```bash
openclaw plugins install /path/to/openclaw-stagehand
```

Or add it manually to `~/.openclaw/openclaw.json`:

```json
{
  "plugins": {
    "load": {
      "paths": [
        "/path/to/openclaw-stagehand"
      ]
    },
    "entries": {
      "stagehand": {
        "enabled": true,
        "config": {}
      }
    }
  }
}
```

Then install dependencies:

```bash
cd /path/to/openclaw-stagehand
pnpm install
```

### From git

```bash
git clone https://github.com/crawd-bot/openclaw-stagehand.git
cd openclaw-stagehand
pnpm install
```

Then add the path to your `~/.openclaw/openclaw.json` as shown above.

## Configuration

All config is optional. The plugin works out of the box with local Chrome and defaults to `anthropic/claude-haiku-4-5-20251001` for Stagehand's AI model.

```json
{
  "stagehand": {
    "enabled": true,
    "config": {
      "model": "anthropic/claude-haiku-4-5-20251001",
      "modelApiKey": "sk-...",
      "profileDir": "~/.openclaw/browser/stagehand/user-data",
      "verbose": 1
    }
  }
}
```

| Option | Default | Description |
|--------|---------|-------------|
| `model` | `anthropic/claude-haiku-4-5-20251001` | AI model for Stagehand's vision/reasoning. Any [Vercel AI SDK](https://sdk.vercel.ai/) model string works (e.g. `openai/gpt-4o`, `google/gemini-2.5-flash`). |
| `modelApiKey` | — | API key for the model provider. Falls back to `ANTHROPIC_API_KEY` or `OPENAI_API_KEY` env vars. |
| `profileDir` | `~/.openclaw/browser/stagehand/user-data` | Chrome user data directory. Persists cookies, localStorage, and sessions. |
| `verbose` | `1` | Stagehand logging verbosity (0=quiet, 1=normal, 2=debug). |
| `browserbaseApiKey` | — | Browserbase API key. Set this **and** `browserbaseProjectId` to use cloud browsers instead of local Chrome. Also reads `BROWSERBASE_API_KEY` env var. |
| `browserbaseProjectId` | — | Browserbase project ID. Also reads `BROWSERBASE_PROJECT_ID` env var. |

### Local vs Browserbase

By default the plugin launches a local headed Chrome. To use [Browserbase](https://www.browserbase.com/) cloud browsers instead, set both `browserbaseApiKey` and `browserbaseProjectId` (in config or env vars). No other changes needed.

## Tools

| Tool | Description | Parameters |
|------|-------------|------------|
| `browser_navigate` | Load a URL | `url` |
| `browser_act` | Perform a browser action in natural language | `action` |
| `browser_extract` | Extract structured data from the page | `instruction`, `schema?` |
| `browser_observe` | Analyze page state and available actions | `instruction` |
| `browser_screenshot` | Capture current page to a PNG file | — |
| `browser_close` | Close the browser session | — |

### Extract schemas

Pass an optional `schema` to `browser_extract` for typed results:

```json
{
  "instruction": "extract the product details",
  "schema": {
    "name": "string",
    "price": "number",
    "inStock": "boolean"
  }
}
```

## Development

```bash
pnpm install
pnpm typecheck    # tsc --noEmit
pnpm build        # tsup → dist/
```

## License

MIT
