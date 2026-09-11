import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  getOrcaBuildProfile,
  normalizeOrcaBuildProfile,
  type OrcaBuildProfile
} from '../shared/corporate-build-profile'

type CliPackageMetadata = {
  orcaBuildProfile?: unknown
}

function readPackagedBuildProfile(packageJsonPath: string): OrcaBuildProfile | null {
  try {
    const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf8')) as CliPackageMetadata
    return packageJson.orcaBuildProfile === undefined
      ? null
      : normalizeOrcaBuildProfile(packageJson.orcaBuildProfile)
  } catch {
    return null
  }
}

export function resolveCliBuildProfile(
  env: Record<string, string | undefined> = process.env,
  packageJsonPath = join(__dirname, '..', 'package.json')
): OrcaBuildProfile {
  const packagedProfile = readPackagedBuildProfile(packageJsonPath)
  if (packagedProfile === 'corporate') {
    return 'corporate'
  }
  if (env.ORCA_BUILD_PROFILE !== undefined) {
    return normalizeOrcaBuildProfile(env.ORCA_BUILD_PROFILE)
  }
  return packagedProfile ?? getOrcaBuildProfile()
}
