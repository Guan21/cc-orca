# Corporate Windows ASAR corruption (#121)

## Confirmed producer failure

Source: `8d5fce5c9910dc6e2046b35cb0ffb6513c5d7c70`.
Original installer SHA256:
`56361f417f31ac5bec3e088d0e5b30c30ce67396126f1002b33059d0aebff209`.
Original ASAR SHA256:
`684deaa6afec3511f6596dfdbeb8bb9131a03301633c5ba7ca678f04584f3816`.
Original artifacts and private diagnostic files are preserved separately; none are uploaded.

An independent pickle-header parser and raw byte reads reproduce the extraction
failure. The header is 1,038,412 bytes, the payload begins at 1,038,420, and
2,282 packed entries are declared. The first seven entries match their SHA256.

The earliest disagreement is immediately after
`acceptance/issue-119/typecheck.log`. Its header size is 84 bytes and its declared
SHA256 matches the first 84 payload bytes. The physical payload contains 178
bytes: the same prefix followed by two 47-byte CRLF-terminated
`[ELIFECYCLE] Command failed with exit code 1.` lines. The preserved on-disk log
matches all 178 bytes. The next entry starts 94 bytes later than declared.

| Entry                              | Declared offset |    Size |  Actual matching offset |
| ---------------------------------- | --------------: | ------: | ----------------------: |
| acceptance/issue-119/typecheck.log |          127186 |      84 | 127186 (84-byte prefix) |
| out/main/index.js                  |         4057197 | 7457584 |                 4057291 |
| package.json                       |       115280967 |    3113 |               115281061 |

The archive is 116,325,872 bytes, exactly 94 bytes longer than the declared end.
Applying that single shift to entries following the log recovers **all 2,282
declared content hashes**, with no remaining mismatches. Root JSON then parses
and declares `./out/main/index.js`. This is diagnostic recovery, not a repaired
distributable.

The all-negation packaging rules implicitly include `**/*`, including local
acceptance evidence. The pinned electron-builder producer uses cached `stat.size`
for offsets and later streams the file again without enforcing that size. A
deterministic real `AsarPackager` regression reproduces the corruption by
appending to a file after metadata collection. Stable CRLF/Unicode inputs and
package.json transformation do not reproduce it. No post-pack hook writes
packed bytes; installed and build-host archive hashes match, excluding NSIS
extraction as the source of this observed insertion.

The exact concurrent command that appended the two lines is not established.
The archive establishes the size/hash-versus-stream mismatch, not the writer's
identity or exact timing. Additional startup defects cannot be excluded until
a newly built application starts in the Windows VM.

## Minimal correction and release gate

Exclude `acceptance/` and `.omx/` from runtime packaging. They contain mutable
diagnostic output and private evidence, and are not application resources.
Do not globally exclude runtime `.log` files or replace the runtime layout.

The `afterPack` gate reads the archive directly before other checks and again
after all existing post-pack operations. It verifies pickle bounds/padding,
contiguous non-overlapping packed ranges, exact physical length, all packed
SHA256 content and block hashes, valid root JSON, and a declared nonempty packed
main entry. Missing integrity metadata fails closed. Reads are bounded to 64 KiB;
the header and root JSON have explicit size limits. ASAR 3's terminal empty hash
block and ASAR 4's nonempty-block convention are both accepted and verified.
Unpacked resources are deliberately left to existing resource checks, because
the CLI metadata hook rewrites their declared contents after packing.

An exception aborts electron-builder before NSIS target generation. Windows PR
CI additionally runs the verifier on its actual unpacked artifact. The check
does not replace signing, executable integrity-resource validation, or installed
startup testing. No dependency, sandbox, Corporate policy, or signing setting
is changed.

## Verification status

Regression tests cover corrupt content, truncation, gaps/overlaps/unsafe offsets,
malformed pickle/header JSON, missing integrity, incorrect whole/block hashes,
invalid root JSON/main entries, ASAR block conventions, and the real producer's
stale-stat race. The Corporate hook test rejects a malformed archive before
unpacked metadata preparation. Tests were observed failing before implementation.

New installer and VM startup evidence are required before #121 or parent #119
can be marked passed. Project Map acceptance remains blocked until that startup
check succeeds.
