# cf-api-gateway

Cloudflare Worker acting as a unified reverse proxy for AI APIs. Stores all upstream keys as CF secrets; callers authenticate with a single `PROXY_TOKEN`.

## Why

Containers behind Anthropic's egress proxy can't reach Google's Generative Language API directly (IP block). Cloudflare's IP ranges are trusted. This Worker relays requests transparently.

## Routes

| Path prefix | Upstream |
|---|---|
| `/gemini/{...}` | `generativelanguage.googleapis.com` |
| `/openai/{...}` | `api.openai.com` |
| `/anthropic/{...}` | `api.anthropic.com` |

## Usage

```bash
curl https://gateway.austegard.com/gemini/v1beta/models/gemini-2.5-flash-lite:generateContent \
  -H "Authorization: Bearer $PROXY_TOKEN" \
  -H "Content-Type: application/json" \
  -X POST \
  -d '{"contents":[{"parts":[{"text":"Hello"}]}]}'
```

## Setup

### 1. CF Secrets (via dashboard or wrangler CLI)

```bash
wrangler secret put PROXY_TOKEN       # generate a strong random value
wrangler secret put GEMINI_API_KEY
wrangler secret put OPENAI_API_KEY    # when needed
wrangler secret put ANTHROPIC_API_KEY # when needed
```

### 2. GitHub Secrets (for CI/CD)

| Secret | Value |
|---|---|
| `CLOUDFLARE_API_TOKEN` | CF API token with Workers:Edit permission |
| `CLOUDFLARE_ACCOUNT_ID` | Your CF account ID |

### 3. DNS

Add a CNAME record in Cloudflare DNS:
```
gateway.austegard.com → (proxied via CF, Worker handles it)
```

### 4. proxy.env (project knowledge)

```
PROXY_TOKEN=<your-token>
PROXY_URL=https://gateway.austegard.com
```

Replace individual `gemini.env`, `claude.env` etc. — the gateway holds the real keys.

## Phase 2: MCP Gateway

Future: expose `/mcp/{service}/sse` endpoints so Claude.ai can connect to upstream services via MCP through a single authenticated gateway, without needing per-service CF connectors.

## Local dev

```bash
npm install wrangler
wrangler dev
```

Set secrets locally via `.dev.vars`:
```
PROXY_TOKEN=dev-token
GEMINI_API_KEY=your-key
```
