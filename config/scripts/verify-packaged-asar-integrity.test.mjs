import { createHash } from 'node:crypto'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createRequire } from 'node:module'
import { afterEach, describe, expect, it } from 'vitest'

const require = createRequire(import.meta.url)
const directories = []
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex')

function fixture(change = () => {}, mutate = (bytes) => bytes) {
  const directory = mkdtempSync(join(tmpdir(), 'packaged-asar-integrity-'))
  directories.push(directory)
  const contents = [
    Buffer.from('{"main":"./out/main/index.js"}'),
    Buffer.from('module.exports = 42'),
    Buffer.from('renderer asset')
  ]
  let offset = 0
  const entries = contents.map((bytes) => {
    const entry = {
      size: bytes.length,
      offset: String(offset),
      integrity: { algorithm: 'SHA256', hash: hash(bytes), blockSize: 8, blocks: [] }
    }
    for (let start = 0; start < bytes.length; start += 8) {
      entry.integrity.blocks.push(hash(bytes.subarray(start, start + 8)))
    }
    offset += bytes.length
    return entry
  })
  const header = {
    files: {
      'package.json': entries[0],
      out: { files: { main: { files: { 'index.js': entries[1] } } } },
      'asset.txt': entries[2]
    }
  }
  const originalContents = [...contents]
  change(header, contents)
  if (contents.some((bytes, index) => bytes !== originalContents[index])) {
    offset = 0
    for (const [index, bytes] of contents.entries()) {
      entries[index].offset = String(offset)
      entries[index].size = bytes.length
      entries[index].integrity.hash = hash(bytes)
      entries[index].integrity.blocks = []
      for (let start = 0; start < bytes.length; start += 8) {
        entries[index].integrity.blocks.push(hash(bytes.subarray(start, start + 8)))
      }
      offset += bytes.length
    }
  }
  const json = Buffer.from(JSON.stringify(header))
  const headerSize = 8 + Math.ceil(json.length / 4) * 4
  const prefix = Buffer.alloc(8 + headerSize)
  prefix.writeUInt32LE(4, 0)
  prefix.writeUInt32LE(headerSize, 4)
  prefix.writeUInt32LE(headerSize - 4, 8)
  prefix.writeUInt32LE(json.length, 12)
  json.copy(prefix, 16)
  const archive = join(directory, 'app.asar')
  writeFileSync(archive, mutate(Buffer.concat([prefix, ...contents]), prefix.length))
  return archive
}

function verify(archive) {
  return require('./verify-packaged-asar-integrity.cjs').verifyPackagedAsarIntegrity(archive)
}

afterEach(() => {
  for (const directory of directories.splice(0)) {
    rmSync(directory, { recursive: true, force: true })
  }
})

describe('packaged ASAR integrity gate', () => {
  it('accepts independently encoded valid archive bytes', () => {
    expect(verify(fixture())).toMatchObject({ packedFiles: 3, main: 'out/main/index.js' })
  })

  it.each(['package.json', 'out/main/index.js', 'asset.txt'])(
    'rejects corrupted %s bytes',
    (file) => {
      const index = ['package.json', 'out/main/index.js', 'asset.txt'].indexOf(file)
      let starts
      expect(() =>
        verify(
          fixture(
            (_header, contents) => {
              starts = [0, contents[0].length, contents[0].length + contents[1].length]
            },
            (bytes, start) => {
              bytes[start + starts[index]] ^= 1
              return bytes
            }
          )
        )
      ).toThrow(/hash mismatch/i)
    }
  )

  it('rejects a truncated packed payload', () => {
    expect(() =>
      verify(
        fixture(
          () => {},
          (bytes) => bytes.subarray(0, -1)
        )
      )
    ).toThrow(/range|truncated|bounds/i)
  })

  it.each(['1', '-1', '9007199254740992', 'wat'])('rejects invalid package offset %s', (offset) => {
    expect(() =>
      verify(
        fixture((header) => {
          header.files['package.json'].offset = offset
        })
      )
    ).toThrow(/offset|range/i)
  })

  it('rejects overlapping ranges even when each entry hash would match', () => {
    expect(() =>
      verify(
        fixture((header) => {
          header.files['asset.txt'].offset = '0'
        })
      )
    ).toThrow(/overlap|offset|range/i)
  })

  it('rejects unaccounted bytes appended to the archive', () => {
    expect(() =>
      verify(
        fixture(
          () => {},
          (bytes) => Buffer.concat([bytes, Buffer.from('extra')])
        )
      )
    ).toThrow(/bounds|unaccounted|range/i)
  })

  it.each([0, 4, 8, 12])('rejects malformed pickle length at byte %i', (position) => {
    expect(() =>
      verify(
        fixture(
          () => {},
          (bytes) => {
            bytes.writeUInt32LE(0xffffffff, position)
            return bytes
          }
        )
      )
    ).toThrow(/header|pickle/i)
  })

  it('rejects a truncated header', () => {
    expect(() =>
      verify(
        fixture(
          () => {},
          (bytes) => bytes.subarray(0, 18)
        )
      )
    ).toThrow(/header|truncated/i)
  })

  it('requires declared integrity for every packed file', () => {
    expect(() =>
      verify(
        fixture((header) => {
          delete header.files['asset.txt'].integrity
        })
      )
    ).toThrow(/integrity/i)
  })

  it.each(['algorithm', 'hash', 'blockSize', 'blocks'])('rejects missing integrity %s', (key) => {
    expect(() =>
      verify(
        fixture((header) => {
          delete header.files['asset.txt'].integrity[key]
        })
      )
    ).toThrow(/integrity/i)
  })

  it('rejects block hashes that disagree despite matching whole-file hashes', () => {
    expect(() =>
      verify(
        fixture((header) => {
          header.files['asset.txt'].integrity.blocks[0] = '0'.repeat(64)
        })
      )
    ).toThrow(/block.*hash|integrity/i)
  })

  it('rejects extra declared blocks', () => {
    expect(() =>
      verify(
        fixture((header) => {
          header.files['asset.txt'].integrity.blocks.push(hash(Buffer.alloc(0)))
        })
      )
    ).toThrow(/block|integrity/i)
  })

  it.each(['../escape.js', '/absolute.js', 'C:\\main.js', '', 'missing.js'])(
    'rejects unsafe or unresolved main %s',
    (main) => {
      expect(() =>
        verify(
          fixture((_header, contents) => {
            contents[0] = Buffer.from(JSON.stringify({ main }))
          })
        )
      ).toThrow(/main entry/i)
    }
  )

  it('normalizes Windows main separators', () => {
    expect(
      verify(
        fixture((_header, contents) => {
          contents[0] = Buffer.from(JSON.stringify({ main: '.\\out\\main\\index.js' }))
        })
      )
    ).toMatchObject({ main: 'out/main/index.js' })
  })

  it.each(['[]', 'null', '{"main":42}', '{broken'])(
    'rejects invalid package metadata %s',
    (metadata) => {
      expect(() =>
        verify(
          fixture((_header, contents) => {
            contents[0] = Buffer.from(metadata)
          })
        )
      ).toThrow(/package.json/i)
    }
  )

  it('requires packed root package and main entries', () => {
    expect(() =>
      verify(
        fixture((header, contents) => {
          delete header.files['package.json']
          contents[0] = Buffer.alloc(0)
        })
      )
    ).toThrow(/root package.json/i)
    expect(() =>
      verify(
        fixture((header, contents) => {
          header.files.out.files.main.files['index.js'].unpacked = true
          contents[1] = Buffer.alloc(0)
        })
      )
    ).toThrow(/main entry/i)
  })

  it('rejects incorrect whole-file hash despite correct declared blocks', () => {
    expect(() =>
      verify(
        fixture((header) => {
          header.files['asset.txt'].integrity.hash = '0'.repeat(64)
        })
      )
    ).toThrow(/content hash mismatch/i)
  })

  it('accepts empty packed assets without confusing adjacent offsets', () => {
    expect(
      verify(
        fixture((_header, contents) => {
          contents[2] = Buffer.alloc(0)
        })
      )
    ).toMatchObject({ packedFiles: 3 })
  })

  it('does not validate unpacked file hashes altered by existing packaging hooks', () => {
    expect(
      verify(
        fixture((header) => {
          header.files.native = { size: 999, unpacked: true, integrity: { hash: 'outdated' } }
        })
      )
    ).toMatchObject({ packedFiles: 3 })
  })

  it('accepts the asar 3 trailing empty block at an exact block boundary', () => {
    expect(
      verify(
        fixture((header) => {
          const entry = header.files['asset.txt']
          entry.integrity.blockSize = entry.size
          entry.integrity.blocks = [entry.integrity.hash, hash(Buffer.alloc(0))]
        })
      )
    ).toMatchObject({ packedFiles: 3 })
  })
})
