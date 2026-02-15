/**
 * Stagehand lifecycle manager.
 *
 * Manages a singleton Stagehand instance with lazy initialization,
 * headed Chrome, and persistent profile support.
 */
import { Stagehand, AISdkClient, type Page } from '@browserbasehq/stagehand'
import type { LanguageModel } from 'ai'
import { z } from 'zod'
import path from 'node:path'
import os from 'node:os'
import fs from 'node:fs'

export type StagehandConfig = {
  enabled: boolean
  model: string
  modelApiKey?: string
  browserbaseApiKey?: string
  browserbaseProjectId?: string
  profileDir: string
  verbose: 0 | 1 | 2
}

export type StagehandLogger = {
  info: (message: string) => void
  warn: (message: string) => void
  error: (message: string) => void
}

/**
 * Build a Zod schema from a simple { field: "string"|"number"|"boolean" } map.
 */
export function buildZodSchema(raw: Record<string, string>): z.ZodObject<Record<string, z.ZodTypeAny>> {
  const shape: Record<string, z.ZodTypeAny> = {}
  for (const [key, type] of Object.entries(raw)) {
    switch (type) {
      case 'string':
        shape[key] = z.string()
        break
      case 'number':
        shape[key] = z.number()
        break
      case 'boolean':
        shape[key] = z.boolean()
        break
      default:
        shape[key] = z.string()
    }
  }
  return z.object(shape)
}

export class StagehandManager {
  private stagehand: Stagehand | null = null
  private initPromise: Promise<Stagehand> | null = null
  private config: StagehandConfig
  private logger: StagehandLogger

  constructor(config: StagehandConfig, logger: StagehandLogger) {
    this.config = config
    this.logger = logger
  }

  async ensure(): Promise<Stagehand> {
    if (this.stagehand && !this.stagehand.isClosed) return this.stagehand
    if (this.stagehand?.isClosed) {
      this.stagehand = null
      this.initPromise = null
    }
    if (!this.initPromise) {
      this.initPromise = this.init()
    }
    this.stagehand = await this.initPromise
    return this.stagehand
  }

  private getPage(): Page {
    if (!this.stagehand) throw new Error('stagehand: not initialized')
    return this.stagehand.page
  }

  /**
   * Try to resolve a custom AI SDK provider for models not built into Stagehand.
   * If the model string is "provider/modelName" and the provider isn't in
   * Stagehand's built-in list, attempt to import @ai-sdk/<provider>.
   */
  private async resolveCustomLlmClient(modelStr: string, apiKey?: string): Promise<AISdkClient | null> {
    // Stagehand built-in providers — these are handled natively
    const builtIn = new Set([
      'openai', 'anthropic', 'google', 'xai', 'azure',
      'groq', 'cerebras', 'togetherai', 'mistral', 'deepseek',
      'perplexity', 'ollama',
    ])

    if (!modelStr.includes('/')) return null
    const provider = modelStr.substring(0, modelStr.indexOf('/'))
    if (builtIn.has(provider)) return null

    const modelName = modelStr.substring(modelStr.indexOf('/') + 1)

    // Try @ai-sdk/<provider> package
    const pkgName = `@ai-sdk/${provider}`
    try {
      const mod = await import(pkgName)
      // AI SDK providers export a default function or a named creator
      const createFn = mod[provider] ?? mod.default ?? mod[`create${provider.charAt(0).toUpperCase()}${provider.slice(1)}`]
      if (typeof createFn !== 'function') {
        throw new Error(`${pkgName} does not export a usable provider function`)
      }
      let model: LanguageModel
      if (apiKey) {
        // Provider factory that takes config (e.g. createMoonshotAI({ apiKey }))
        const providerInstance = createFn({ apiKey })
        model = typeof providerInstance === 'function' ? providerInstance(modelName) : providerInstance
      } else {
        model = typeof createFn === 'function' && createFn.length === 0
          ? createFn()(modelName)
          : createFn(modelName)
      }
      this.logger.info(`stagehand: using custom AI SDK provider ${pkgName} for model ${modelName}`)
      return new AISdkClient({ model })
    } catch (err) {
      throw new Error(
        `stagehand: model provider "${provider}" is not built into Stagehand. ` +
        `Tried to import ${pkgName} but failed: ${err instanceof Error ? err.message : String(err)}. ` +
        `Install it with: pnpm add ${pkgName}`,
      )
    }
  }

  private async init(): Promise<Stagehand> {
    const cfg = this.config

    // Resolve model API key
    const modelApiKey = cfg.modelApiKey
      || process.env.ANTHROPIC_API_KEY
      || process.env.OPENAI_API_KEY

    // Check if we need a custom AI SDK provider (e.g. moonshotai, cohere, etc.)
    const customLlmClient = await this.resolveCustomLlmClient(cfg.model, modelApiKey)

    const commonOpts = {
      verbose: cfg.verbose as 0 | 1 | 2,
      // If custom provider, pass llmClient; otherwise use Stagehand's built-in resolution
      ...(customLlmClient
        ? { llmClient: customLlmClient }
        : {
            modelName: cfg.model,
            ...(modelApiKey ? { modelClientOptions: { apiKey: modelApiKey } } : {}),
          }
      ),
    }

    // Auto-detect Browserbase: config credentials take priority, then env vars
    const bbApiKey = cfg.browserbaseApiKey || process.env.BROWSERBASE_API_KEY
    const bbProjectId = cfg.browserbaseProjectId || process.env.BROWSERBASE_PROJECT_ID
    const useBrowserbase = !!(bbApiKey && bbProjectId)

    let stagehand: Stagehand

    if (useBrowserbase) {
      stagehand = new Stagehand({
        env: 'BROWSERBASE',
        apiKey: bbApiKey,
        projectId: bbProjectId,
        ...commonOpts,
      })
    } else {
      const profileDir = cfg.profileDir.startsWith('~')
        ? path.join(os.homedir(), cfg.profileDir.slice(1))
        : cfg.profileDir

      // Ensure profile directory exists
      fs.mkdirSync(profileDir, { recursive: true })

      stagehand = new Stagehand({
        env: 'LOCAL',
        localBrowserLaunchOptions: {
          headless: false,
          viewport: { width: 1280, height: 900 },
          userDataDir: profileDir,
          preserveUserDataDir: true,
          args: ['--no-first-run', '--disable-infobars'],
        },
        ...commonOpts,
      })
    }

    const env = useBrowserbase ? 'BROWSERBASE' : 'LOCAL'
    this.logger.info(`stagehand: initializing (env=${env}, model=${cfg.model})`)
    await stagehand.init()
    this.logger.info('stagehand: browser ready')

    return stagehand
  }

  async navigate(url: string): Promise<string> {
    await this.ensure()
    const page = this.getPage()
    await page.goto(url, { waitUntil: 'domcontentloaded' })
    const title = await page.title()
    return title ? `Navigated to ${url} — "${title}"` : `Navigated to ${url}`
  }

  async act(action: string): Promise<{ success: boolean; message: string }> {
    await this.ensure()
    const page = this.getPage()
    const result = await page.act(action)
    return { success: result.success, message: result.message }
  }

  async extract(instruction: string, schema?: Record<string, string>): Promise<unknown> {
    await this.ensure()
    const page = this.getPage()
    if (schema) {
      const zodSchema = buildZodSchema(schema)
      return await page.extract({ instruction, schema: zodSchema })
    }
    return await page.extract(instruction)
  }

  async observe(instruction: string): Promise<unknown> {
    await this.ensure()
    const page = this.getPage()
    return await page.observe(instruction)
  }

  async screenshot(): Promise<string> {
    await this.ensure()
    const page = this.getPage()
    const tmpDir = os.tmpdir()
    const filePath = path.join(tmpDir, `stagehand-screenshot-${Date.now()}.png`)
    const buffer = await page.screenshot({ fullPage: false })
    fs.writeFileSync(filePath, buffer)
    return filePath
  }

  async close(): Promise<void> {
    if (this.stagehand) {
      try {
        await this.stagehand.close()
      } catch {
        // ignore close errors
      }
      this.stagehand = null
      this.initPromise = null
      this.logger.info('stagehand: browser closed')
    }
  }
}
