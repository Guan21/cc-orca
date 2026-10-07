import { net } from 'electron'
import { parse } from 'yaml'
import { resolveCorporateConfiguredEndpoint } from '../shared/network/corporate-network-contract'
import { compareVersions, isPrereleaseVersion, isValidVersion } from './updater-fallback'

const ATOM_FEED_URL_ENV = 'ORCA_RELEASE_ATOM_FEED_URL'
const RELEASES_DOWNLOAD_BASE_ENV = 'ORCA_RELEASE_DOWNLOAD_BASE_URL'
const FETCH_TIMEOUT_MS = 5000
const MAX_MANIFEST_PROBE_CANDIDATES = 6

const TAG_HREF_RE = /href="[^"]*\/releases\/tag\/([^"]+)"/g

function resolveConfiguredReleaseEndpoint(capability: string, endpoint: string | undefined): string | null {
  const resolution = resolveCorporateConfiguredEndpoint({
    capability,
    configuredEndpoint: endpoint,
    source: 'updater-release-feed'
  })
  return resolution.status === 'allowed' ? resolution.endpoint : null
}

function getReleaseAtomFeedUrl(): string | null {
  return resolveConfiguredReleaseEndpoint('release-atom-feed', process.env[ATOM_FEED_URL_ENV])
}

export function getReleaseDownloadBaseUrl(): string | null {
  return resolveConfiguredReleaseEndpoint(
    'release-download-base',
    process.env[RELEASES_DOWNLOAD_BASE_ENV]
  )
}

export function getReleaseDownloadUrl(tag: string): string | null {
  const baseUrl = getReleaseDownloadBaseUrl()
  return baseUrl ? `${baseUrl.replace(/\/+$/, '')}/${encodeURIComponent(tag)}` : null
}

function getPlatformManifestName(): string {
  if (process.platform === 'darwin') {
    return 'latest-mac.yml'
  }
  if (process.platform === 'linux') {
    return 'latest-linux.yml'
  }
  return 'latest.yml'
}

function getReleaseManifestUrl(tag: string): string | null {
  const downloadUrl = getReleaseDownloadUrl(tag)
  return downloadUrl ? `${downloadUrl}/${getPlatformManifestName()}` : null
}

function getReleaseAssetUrl(tag: string, assetName: string): string | null {
  const downloadUrl = getReleaseDownloadUrl(tag)
  return downloadUrl ? `${downloadUrl}/${encodeURIComponent(assetName)}` : null
}

export function normalizeTagToVersion(tag: string): string {
  return tag.replace(/^v/i, '')
}

type ReleaseFeedTag = {
  tag: string
  version: string
}

export function isPerfPrereleaseTag(tag: string): boolean {
  const version = normalizeTagToVersion(tag)
  const match = version.match(/^\d+\.\d+\.\d+-([0-9A-Za-z-.]+)(?:\+[0-9A-Za-z-.]+)?$/)
  const identifiers = match?.[1]?.split('.') ?? []
  return (
    identifiers.length === 3 &&
    identifiers[0] === 'rc' &&
    /^\d+$/.test(identifiers[1]) &&
    identifiers[2] === 'perf'
  )
}

async function fetchReleaseFeedTags(): Promise<ReleaseFeedTag[] | null> {
  const feedUrl = getReleaseAtomFeedUrl()
  if (!feedUrl) {
    return null
  }
  try {
    const res = await net.fetch(feedUrl, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) })
    if (!res.ok) {
      return null
    }
    const body = await res.text()
    const tags: ReleaseFeedTag[] = []

    for (const match of body.matchAll(TAG_HREF_RE)) {
      const tag = match[1]
      const version = normalizeTagToVersion(tag)
      if (isValidVersion(version)) {
        tags.push({ tag, version })
      }
    }

    tags.sort((left, right) => compareVersions(right.version, left.version))
    return tags
  } catch {
    return null
  }
}

type ManifestAssetEntry = {
  url?: unknown
  path?: unknown
}

function getManifestAssetNames(manifestText: string): string[] {
  const parsed = parse(manifestText) as {
    files?: ManifestAssetEntry[]
    path?: unknown
  } | null

  const names = new Set<string>()
  for (const file of Array.isArray(parsed?.files) ? parsed.files : []) {
    const value = typeof file.url === 'string' ? file.url : file.path
    if (typeof value === 'string' && value.trim()) {
      names.add(value.trim())
    }
  }
  if (typeof parsed?.path === 'string' && parsed.path.trim()) {
    names.add(parsed.path.trim())
  }
  return [...names]
}

type ReleaseReadiness = 'ready' | 'not-ready' | 'unavailable'

function getRedirectedReleaseAssetReadiness(assetUrl: string): Promise<ReleaseReadiness> {
  return new Promise((resolve) => {
    const request = net.request({ method: 'HEAD', url: assetUrl, redirect: 'manual' })
    let settled = false
    const settle = (readiness: ReleaseReadiness): void => {
      if (settled) {
        return
      }
      settled = true
      clearTimeout(timeout)
      resolve(readiness)
    }
    const timeout = setTimeout(() => {
      try {
        request.abort()
      } catch {
        // The request may already have been cancelled by Electron.
      }
      settle('unavailable')
    }, FETCH_TIMEOUT_MS)

    request.on('redirect', (statusCode) => {
      // Why: a redirect proves the asset exists without probing its signed storage URL.
      settle(statusCode >= 300 && statusCode < 400 ? 'ready' : 'unavailable')
    })
    request.on('response', (response) => {
      settle(
        response.statusCode === 404
          ? 'not-ready'
          : response.statusCode >= 200 && response.statusCode < 300
            ? 'ready'
            : 'unavailable'
      )
    })
    request.on('error', () => settle('unavailable'))
    try {
      request.end()
    } catch {
      settle('unavailable')
    }
  })
}

async function getReleaseAssetReadiness(tag: string, assetName: string): Promise<ReleaseReadiness> {
  const isRelativeAsset = !/^https?:\/\//i.test(assetName)
  const shouldUseRedirectProbe = process.platform === 'win32' && isRelativeAsset
  const assetUrl = isRelativeAsset
    ? getReleaseAssetUrl(tag, assetName.split('/').findLast(Boolean) ?? assetName)
    : assetName
  if (!assetUrl) {
    return 'unavailable'
  }
  if (shouldUseRedirectProbe) {
    return getRedirectedReleaseAssetReadiness(assetUrl)
  }

  try {
    const res = await net.fetch(assetUrl, {
      method: 'HEAD',
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS)
    })
    if (res.status === 404) {
      return 'not-ready'
    }
    return res.ok ? 'ready' : 'unavailable'
  } catch {
    return 'unavailable'
  }
}

async function getPlatformManifestReadiness(tag: string): Promise<ReleaseReadiness> {
  try {
    // Why: cancelled/draft releases can appear in GitHub's atom feed before
    // they have updater manifests or the ZIP/exe/AppImage assets referenced by
    // those manifests. Pinning to those tags makes download clicks 404.
    const manifestUrl = getReleaseManifestUrl(tag)
    if (!manifestUrl) {
      return 'unavailable'
    }
    const res = await net.fetch(manifestUrl, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) })
    if (res.status === 404) {
      return 'not-ready'
    }
    if (!res.ok) {
      return 'unavailable'
    }
    const manifestText = await res.text()
    let assetNames: string[]
    try {
      assetNames = getManifestAssetNames(manifestText)
    } catch {
      return 'not-ready'
    }
    if (assetNames.length === 0) {
      return 'not-ready'
    }
    const assetResults = await Promise.all(
      assetNames.map((assetName) => getReleaseAssetReadiness(tag, assetName))
    )
    return assetResults.includes('not-ready')
      ? 'not-ready'
      : assetResults.includes('unavailable')
        ? 'unavailable'
        : 'ready'
  } catch {
    return 'unavailable'
  }
}

/**
 * Walks the GitHub releases atom feed and returns the tag of the newest
 * release strictly greater than `currentVersion`.
 *
 * Why: electron-updater's GitHubProvider filters the feed by channel, and
 * GitHub's /latest/download redirect can move between check and download.
 * By resolving the newest tag ourselves and pinning the generic provider at
 * `/releases/download/<tag>`, the manifest and downloaded asset stay tied to
 * the same release.
 *
 * Returns null if the fetch fails, the feed has no parseable tags, or
 * nothing in the feed is newer than `currentVersion`.
 */
type FetchNewerReleaseTagOptions = {
  includePrerelease?: boolean
  releaseFilter?: 'perf'
}

export type FetchNewerReleaseTagsResult =
  | { tags: string[]; state: 'ready' }
  | { tags: string[]; state: 'no-newer' }
  | { tags: string[]; state: 'not-ready'; lastGoodTag?: string }
  | { tags: string[]; state: 'unavailable'; unavailableReason: 'feed' | 'manifest' }

export async function fetchNewerReleaseTag(
  currentVersion: string,
  options: FetchNewerReleaseTagOptions = {}
): Promise<string | null> {
  return (await fetchNewerReleaseTags(currentVersion, 1, options))[0] ?? null
}

export async function fetchNewerReleaseTags(
  currentVersion: string,
  maxTags: number,
  options: FetchNewerReleaseTagOptions = {}
): Promise<string[]> {
  return (await fetchNewerReleaseTagsWithReadiness(currentVersion, maxTags, options)).tags
}

export async function fetchNewerReleaseTagsWithReadiness(
  currentVersion: string,
  maxTags: number,
  options: FetchNewerReleaseTagOptions = {}
): Promise<FetchNewerReleaseTagsResult> {
  const includePrerelease = options.includePrerelease ?? true
  if (maxTags <= 0) {
    return { tags: [], state: 'no-newer' }
  }
  const tags = await fetchReleaseFeedTags()
  if (!tags) {
    return { tags: [], state: 'unavailable', unavailableReason: 'feed' }
  }

  // Why: perf builds are explicit opt-in; regular prerelease checks should
  // stay on the main RC/stable series even though perf tags are semver-newer.
  const candidates =
    options.releaseFilter === 'perf'
      ? tags.filter(({ tag }) => isPerfPrereleaseTag(tag))
      : includePrerelease
        ? tags.filter(({ tag }) => !isPerfPrereleaseTag(tag))
        : tags.filter(({ version }) => !isPrereleaseVersion(version))
  const newestNewerIndex = candidates.findIndex(
    ({ version }) => compareVersions(version, currentVersion) > 0
  )
  if (newestNewerIndex === -1) {
    return { tags: [], state: 'no-newer' }
  }

  // Why: a cancelled release can leave several feed entries without manifests,
  // but update checks must not stall on an unbounded run of 5s probes.
  const probeCandidates = candidates.slice(
    newestNewerIndex,
    newestNewerIndex + MAX_MANIFEST_PROBE_CANDIDATES
  )
  const manifestResults = await Promise.all(
    probeCandidates.map(async ({ tag, version }) => ({
      tag,
      version,
      readiness: await getPlatformManifestReadiness(tag)
    }))
  )

  const primaryIndex = manifestResults.findIndex(
    ({ readiness, version }) =>
      readiness === 'ready' && compareVersions(version, currentVersion) > 0
  )
  if (primaryIndex === -1) {
    if (manifestResults[0]?.readiness === 'unavailable') {
      return { tags: [], state: 'unavailable', unavailableReason: 'manifest' }
    }
    const lastGoodTag = manifestResults.find(({ readiness }) => readiness === 'ready')?.tag
    return lastGoodTag
      ? { tags: [], state: 'not-ready', lastGoodTag }
      : { tags: [], state: 'not-ready' }
  }

  if (primaryIndex > 0) {
    if (manifestResults[0]?.readiness === 'unavailable') {
      return { tags: [], state: 'unavailable', unavailableReason: 'manifest' }
    }
    return { tags: [], state: 'not-ready', lastGoodTag: manifestResults[primaryIndex].tag }
  }

  return {
    tags: manifestResults
      .slice(primaryIndex)
      .filter(({ readiness }) => readiness === 'ready')
      .slice(0, maxTags)
      .map(({ tag }) => tag),
    state: 'ready'
  }
}
