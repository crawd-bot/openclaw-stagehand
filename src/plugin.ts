/**
 * OpenClaw plugin entry point for Stagehand browser automation.
 *
 * Registers:
 * - `browser_navigate` tool — load a URL
 * - `browser_act` tool — perform an AI-driven browser action
 * - `browser_extract` tool — extract structured data from page
 * - `browser_observe` tool — analyze page state and available actions
 * - `browser_screenshot` tool — capture current page view
 * - `browser_close` tool — close the browser session
 * - `stagehand` service — browser lifecycle management
 */
import { Type } from '@sinclair/typebox'
import { StagehandManager, type StagehandConfig } from './stagehand.js'
import path from 'node:path'
import os from 'node:os'

// Minimal plugin types — defined inline so this package builds without openclaw peerDep.
type PluginLogger = {
  info: (message: string) => void
  warn: (message: string) => void
  error: (message: string) => void
}

type PluginApi = {
  pluginConfig?: Record<string, unknown>
  logger: PluginLogger
  registerTool: (tool: Record<string, unknown>, opts?: { name?: string }) => void
  registerService: (service: { id: string; start: () => Promise<void>; stop?: () => Promise<void> }) => void
}

type PluginDefinition = {
  id: string
  name: string
  description: string
  configSchema?: Record<string, unknown>
  register?: (api: PluginApi) => void | Promise<void>
}

// ---------------------------------------------------------------------------
// Config parsing
// ---------------------------------------------------------------------------

const DEFAULT_PROFILE_DIR = path.join(os.homedir(), '.openclaw', 'browser', 'stagehand', 'user-data')

function parsePluginConfig(raw: Record<string, unknown> | undefined): StagehandConfig {
  const cfg = raw ?? {}
  return {
    enabled: cfg.enabled !== false,
    model: typeof cfg.model === 'string' ? cfg.model : 'anthropic/claude-haiku-4-5-20251001',
    modelApiKey: typeof cfg.modelApiKey === 'string' ? cfg.modelApiKey : undefined,
    browserbaseApiKey: typeof cfg.browserbaseApiKey === 'string' ? cfg.browserbaseApiKey : undefined,
    browserbaseProjectId: typeof cfg.browserbaseProjectId === 'string' ? cfg.browserbaseProjectId : undefined,
    profileDir: typeof cfg.profileDir === 'string' ? cfg.profileDir : DEFAULT_PROFILE_DIR,
    verbose: cfg.verbose === 0 || cfg.verbose === 1 || cfg.verbose === 2 ? cfg.verbose : 1,
  }
}

// ---------------------------------------------------------------------------
// Plugin definition
// ---------------------------------------------------------------------------

const stagehandConfigSchema = {
  parse(value: unknown) {
    const raw = value && typeof value === 'object' && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {}
    return parsePluginConfig(raw)
  },
  uiHints: {
    enabled: { label: 'Enabled' },
    model: { label: 'AI Model', placeholder: 'anthropic/claude-haiku-4-5-20251001' },
    modelApiKey: { label: 'Model API Key', sensitive: true },
    browserbaseApiKey: { label: 'Browserbase API Key', sensitive: true },
    browserbaseProjectId: { label: 'Browserbase Project ID' },
    profileDir: { label: 'Profile Directory', advanced: true },
    verbose: { label: 'Verbosity', advanced: true },
  },
}

const plugin: PluginDefinition = {
  id: 'stagehand',
  name: 'Stagehand Browser',
  description: 'AI-powered browser automation via Stagehand — headed Chrome with persistent profiles',
  configSchema: stagehandConfigSchema,

  register(api: PluginApi) {
    const config = parsePluginConfig(api.pluginConfig)
    if (!config.enabled) {
      api.logger.info('stagehand: disabled')
      return
    }

    const manager = new StagehandManager(config, {
      info: (msg) => api.logger.info(`[stagehand] ${msg}`),
      warn: (msg) => api.logger.warn(`[stagehand] ${msg}`),
      error: (msg) => api.logger.error(`[stagehand] ${msg}`),
    })

    // browser_navigate
    api.registerTool(
      {
        name: 'browser_navigate',
        label: 'Navigate',
        description:
          'Navigate the browser to a URL. Opens the page and waits for it to load.',
        parameters: Type.Object({
          url: Type.String({ description: 'URL to navigate to' }),
        }),
        async execute(_toolCallId: string, params: unknown) {
          const { url } = params as { url: string }
          const result = await manager.navigate(url)
          return {
            content: [{ type: 'text', text: result }],
          }
        },
      },
      { name: 'browser_navigate' },
    )

    // browser_act
    api.registerTool(
      {
        name: 'browser_act',
        label: 'Act',
        description:
          'Perform a browser action described in natural language. Examples: "click the login button", "type hello into the search box", "scroll down", "select the second option from the dropdown".',
        parameters: Type.Object({
          action: Type.String({ description: 'Natural language description of the action to perform' }),
        }),
        async execute(_toolCallId: string, params: unknown) {
          const { action } = params as { action: string }
          const result = await manager.act(action)
          return {
            content: [{ type: 'text', text: result.success ? `Action performed: ${result.message}` : `Action failed: ${result.message}` }],
            details: result,
          }
        },
      },
      { name: 'browser_act' },
    )

    // browser_extract
    api.registerTool(
      {
        name: 'browser_extract',
        label: 'Extract',
        description:
          'Extract structured data from the current page using natural language. Optionally provide a schema to get typed results. Schema format: { "fieldName": "string"|"number"|"boolean" }.',
        parameters: Type.Object({
          instruction: Type.String({ description: 'What data to extract from the page' }),
          schema: Type.Optional(
            Type.Record(Type.String(), Type.String({ description: '"string", "number", or "boolean"' }), {
              description: 'Optional schema mapping field names to types',
            }),
          ),
        }),
        async execute(_toolCallId: string, params: unknown) {
          const { instruction, schema } = params as { instruction: string; schema?: Record<string, string> }
          const result = await manager.extract(instruction, schema)
          const text = typeof result === 'string' ? result : JSON.stringify(result, null, 2)
          return {
            content: [{ type: 'text', text }],
            details: result,
          }
        },
      },
      { name: 'browser_extract' },
    )

    // browser_observe
    api.registerTool(
      {
        name: 'browser_observe',
        label: 'Observe',
        description:
          'Observe the current page state. Returns a list of available actions and interactive elements. Use this to understand what you can do on the page before acting.',
        parameters: Type.Object({
          instruction: Type.String({ description: 'What to observe on the page, e.g. "what actions can I take?" or "find all form fields"' }),
        }),
        async execute(_toolCallId: string, params: unknown) {
          const { instruction } = params as { instruction: string }
          const result = await manager.observe(instruction)
          const text = JSON.stringify(result, null, 2)
          return {
            content: [{ type: 'text', text }],
            details: result,
          }
        },
      },
      { name: 'browser_observe' },
    )

    // browser_screenshot
    api.registerTool(
      {
        name: 'browser_screenshot',
        label: 'Screenshot',
        description:
          'Capture a screenshot of the current page. Returns the file path to the saved PNG image.',
        parameters: Type.Object({}),
        async execute(_toolCallId: string, _params: unknown) {
          const filePath = await manager.screenshot()
          return {
            content: [{ type: 'text', text: `Screenshot saved to ${filePath}` }],
            details: { filePath },
          }
        },
      },
      { name: 'browser_screenshot' },
    )

    // browser_close
    api.registerTool(
      {
        name: 'browser_close',
        label: 'Close Browser',
        description:
          'Close the browser session. The browser will be re-launched on the next browser tool call.',
        parameters: Type.Object({}),
        async execute(_toolCallId: string, _params: unknown) {
          await manager.close()
          return {
            content: [{ type: 'text', text: 'Browser closed.' }],
          }
        },
      },
      { name: 'browser_close' },
    )

    // Service lifecycle
    api.registerService({
      id: 'stagehand',
      start: async () => {
        try {
          await manager.ensure()
          api.logger.info('stagehand: browser service started')
        } catch (err) {
          api.logger.error(
            `stagehand: failed to start — ${err instanceof Error ? err.message : String(err)}`,
          )
        }
      },
      stop: async () => {
        await manager.close()
      },
    })
  },
}

export default plugin
