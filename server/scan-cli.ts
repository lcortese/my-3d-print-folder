/**
 * Standalone scanner: refreshes the SQLite catalogue without starting the API.
 * Usage: `npm run scan`
 */
import process from 'node:process'
import { config, describeConfig } from './config.ts'
import { Catalog } from './db.ts'
import { scanModelsRoot } from './scanner.ts'

async function main(): Promise<void> {
  console.log('[scan] configuration')
  console.log(describeConfig())

  const catalog = new Catalog(config.dbPath)
  const startedAt = Date.now()

  try {
    const output = await scanModelsRoot({
      root: config.modelsRoot,
      modelExtensions: config.modelExtensions,
      ignoreDirs: config.ignoreDirs,
      maxDirectories: config.maxDirectories,
      maxWarnings: config.maxWarnings,
    })

    const durationMs = Date.now() - startedAt
    catalog.replaceAll(output, durationMs)

    const models = output.projects.reduce((total, project) => total + project.models.length, 0)
    console.log(
      `[scan] done: ${output.projects.length} projects, ${models} models, ` +
        `${output.dirs.length} folders in ${durationMs} ms`,
    )

    for (const warning of output.warnings) {
      console.warn(`[scan] warning: ${warning}`)
    }
  } catch (error) {
    console.error(`[scan] failed: ${(error as Error).message}`)
    process.exitCode = 1
  } finally {
    catalog.close()
  }
}

void main()
