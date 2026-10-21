import { isDeepStrictEqual } from 'node:util'
import type { PersistedState } from '../../../shared/persisted-state-types'
import type { Repo } from '../../../shared/repo-types'
import {
  captureNativeLocalWorktreeMetadataScanExpectation,
  selectProbeableLocalWorktreeMetadataCandidates,
  pruneSessionlessMissingLocalWorktreeMetadataForRepo,
  type NativeLocalWorktreeMetadataScanExpectation as Scan,
  type LocalWorktreeMetadataPruneExpectation as Candidate
} from '../tracking-repos/missing-local-worktree-metadata-pruning'

type CapturedScan = {
  internal: Scan
  snapshot: Scan
  candidates: Map<Candidate, Candidate>
}

/** Keep identity-CAS references private; public scans carry detached records only. */
export class WorktreeScanOwnership {
  private readonly captures = new WeakMap<Scan, CapturedScan>()

  capture(state: PersistedState, repo: Repo): Scan {
    const internal = captureNativeLocalWorktreeMetadataScanExpectation(state, repo)
    const exposed = structuredClone(internal)
    this.captures.set(exposed, {
      internal,
      snapshot: structuredClone(exposed),
      candidates: new Map(
        exposed.metadata.map((candidate, index) => [candidate, internal.metadata[index]!])
      )
    })
    return exposed
  }

  private current(scan: Scan): CapturedScan | undefined {
    const captured = this.captures.get(scan)
    return captured && isDeepStrictEqual(scan, captured.snapshot) ? captured : undefined
  }

  select(state: PersistedState, scan: Scan): readonly Candidate[] {
    const captured = this.current(scan)
    if (!captured) {
      return []
    }
    const selected = new Set(
      selectProbeableLocalWorktreeMetadataCandidates(state, captured.internal)
    )
    return scan.metadata.filter((candidate) => selected.has(captured.candidates.get(candidate)!))
  }

  prune(state: PersistedState, scan: Scan, missing: readonly Candidate[]): string[] {
    const captured = this.current(scan)
    if (!captured || missing.some((candidate) => !captured.candidates.has(candidate))) {
      return []
    }
    return pruneSessionlessMissingLocalWorktreeMetadataForRepo(
      state,
      captured.internal,
      missing.map((candidate) => captured.candidates.get(candidate)!)
    )
  }
}
