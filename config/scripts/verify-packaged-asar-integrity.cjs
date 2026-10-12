const { createHash } = require('node:crypto')
const { closeSync, fstatSync, openSync, readSync } = require('node:fs')

const MAX_HEADER_SIZE = 64 * 1024 * 1024
const MAX_PACKAGE_SIZE = 4 * 1024 * 1024
const READ_SIZE = 64 * 1024
const HASH_PATTERN = /^[a-fA-F0-9]{64}$/
const EMPTY_HASH = createHash('sha256').digest('hex')

function fail(message) {
  throw new Error(`Packaged ASAR integrity: ${message}`)
}

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function readBytes(fd, size, position) {
  const bytes = Buffer.alloc(size)
  let read = 0
  while (read < size) {
    const count = readSync(fd, bytes, read, size - read, position + read)
    if (count === 0) {
      fail(`truncated bytes at ${position + read}`)
    }
    read += count
  }
  return bytes
}

function readHeader(fd, archiveSize) {
  if (archiveSize < 16) {
    fail('truncated header')
  }
  const prefix = readBytes(fd, 16, 0)
  const headerSize = prefix.readUInt32LE(4)
  const jsonSize = prefix.readUInt32LE(12)
  if (
    prefix.readUInt32LE(0) !== 4 ||
    headerSize < 8 ||
    headerSize > MAX_HEADER_SIZE ||
    headerSize + 8 > archiveSize ||
    prefix.readUInt32LE(8) !== headerSize - 4 ||
    headerSize !== 8 + Math.ceil(jsonSize / 4) * 4
  ) {
    fail('invalid header pickle lengths')
  }
  const headerBytes = readBytes(fd, headerSize - 8, 16)
  for (let index = jsonSize; index < headerBytes.length; index++) {
    if (headerBytes[index] !== 0) {
      fail('invalid header pickle padding')
    }
  }
  let header
  try {
    header = JSON.parse(
      new TextDecoder('utf-8', { fatal: true }).decode(headerBytes.subarray(0, jsonSize))
    )
  } catch (error) {
    fail(`invalid header JSON: ${error.message}`)
  }
  return { header, dataStart: 8 + headerSize }
}

function packedEntries(header) {
  const entries = []
  const pending = [{ node: header, path: '', unpacked: false }]
  while (pending.length > 0) {
    const { node, path, unpacked } = pending.pop()
    if (!isObject(node)) {
      fail(`invalid header entry ${path}`)
    }
    if (Object.hasOwn(node, 'files')) {
      if (!isObject(node.files)) {
        fail(`invalid header directory ${path}`)
      }
      for (const [name, child] of Object.entries(node.files)) {
        if (!name || name === '.' || name === '..' || /[\\/\0]/.test(name)) {
          fail(`invalid header name ${name}`)
        }
        pending.push({
          node: child,
          path: path ? `${path}/${name}` : name,
          unpacked: unpacked || node.unpacked === true
        })
      }
    } else if (!unpacked && node.unpacked !== true && !Object.hasOwn(node, 'link')) {
      if (
        !Number.isSafeInteger(node.size) ||
        node.size < 0 ||
        typeof node.offset !== 'string' ||
        !/^(0|[1-9]\d*)$/.test(node.offset)
      ) {
        fail(`invalid size or offset for ${path}`)
      }
      const offset = Number(node.offset)
      if (!Number.isSafeInteger(offset) || !Number.isSafeInteger(offset + node.size)) {
        fail(`unsafe offset for ${path}`)
      }
      entries.push({ path, size: node.size, offset, integrity: node.integrity })
    }
  }
  return entries.sort((a, b) => a.offset - b.offset || a.size - b.size)
}

function verifyEntry(fd, entry, dataStart) {
  const { integrity, path, size, offset } = entry
  if (
    !isObject(integrity) ||
    integrity.algorithm !== 'SHA256' ||
    typeof integrity.hash !== 'string' ||
    !HASH_PATTERN.test(integrity.hash) ||
    !Number.isSafeInteger(integrity.blockSize) ||
    integrity.blockSize <= 0 ||
    !Array.isArray(integrity.blocks) ||
    !integrity.blocks.every((hash) => typeof hash === 'string' && HASH_PATTERN.test(hash))
  ) {
    fail(`missing or invalid declared integrity for ${path}`)
  }
  const blockCount = Math.ceil(size / integrity.blockSize)
  // asar 3 appends an empty block at exact boundaries; asar 4 omits it.
  const hasEmptyBlock =
    size % integrity.blockSize === 0 && integrity.blocks.length === blockCount + 1
  if (integrity.blocks.length !== blockCount && !hasEmptyBlock) {
    fail(`invalid integrity block count for ${path}`)
  }
  const fileHash = createHash('sha256')
  let blockHash = createHash('sha256')
  let position = 0
  let blockBytes = 0
  let blockIndex = 0
  while (position < size) {
    const count = Math.min(READ_SIZE, size - position, integrity.blockSize - blockBytes)
    const bytes = readBytes(fd, count, dataStart + offset + position)
    fileHash.update(bytes)
    blockHash.update(bytes)
    position += count
    blockBytes += count
    if (blockBytes === integrity.blockSize || position === size) {
      if (blockHash.digest('hex') !== integrity.blocks[blockIndex].toLowerCase()) {
        fail(`block hash mismatch for ${path} at block ${blockIndex}`)
      }
      blockIndex++
      blockBytes = 0
      blockHash = createHash('sha256')
    }
  }
  if (hasEmptyBlock && integrity.blocks[blockCount].toLowerCase() !== EMPTY_HASH) {
    fail(`empty block hash mismatch for ${path}`)
  }
  if (fileHash.digest('hex') !== integrity.hash.toLowerCase()) {
    fail(`content hash mismatch for ${path}`)
  }
}

function readMain(fd, entries, dataStart) {
  const rootPackage = entries.find((entry) => entry.path === 'package.json')
  if (!rootPackage || rootPackage.size === 0 || rootPackage.size > MAX_PACKAGE_SIZE) {
    fail('root package.json must be a nonempty packed file')
  }
  let metadata
  try {
    metadata = JSON.parse(
      new TextDecoder('utf-8', { fatal: true }).decode(
        readBytes(fd, rootPackage.size, dataStart + rootPackage.offset)
      )
    )
  } catch (error) {
    fail(`invalid root package.json: ${error.message}`)
  }
  if (!isObject(metadata) || typeof metadata.main !== 'string' || !metadata.main.trim()) {
    fail('root package.json requires a main entry')
  }
  const main = metadata.main.replaceAll('\\', '/')
  if (main.startsWith('/') || /[:\0]/.test(main) || main.split('/').includes('..')) {
    fail(`unsafe main entry ${main}`)
  }
  const normalizedMain = main
    .split('/')
    .filter((part) => part && part !== '.')
    .join('/')
  const mainEntry = entries.find((entry) => entry.path === normalizedMain)
  if (!mainEntry || mainEntry.size === 0) {
    fail(`main entry must be a nonempty packed file: ${normalizedMain}`)
  }
  return normalizedMain
}

function verifyPackagedAsarIntegrity(archivePath) {
  const fd = openSync(archivePath, 'r')
  try {
    const before = fstatSync(fd)
    if (!before.isFile() || !Number.isSafeInteger(before.size)) {
      fail('archive must be a regular file of safe size')
    }
    const { header, dataStart } = readHeader(fd, before.size)
    if (!isObject(header) || !Object.hasOwn(header, 'files')) {
      fail('invalid root header')
    }
    const entries = packedEntries(header)
    let expectedOffset = 0
    for (const entry of entries) {
      if (entry.offset !== expectedOffset) {
        fail(
          `overlap or gap in entry offset for ${entry.path}: expected ${expectedOffset}, got ${entry.offset}`
        )
      }
      expectedOffset += entry.size
      if (dataStart + expectedOffset > before.size) {
        fail(`entry range exceeds archive bounds for ${entry.path}`)
      }
    }
    if (dataStart + expectedOffset !== before.size) {
      fail('unaccounted bytes outside declared entry ranges')
    }
    for (const entry of entries) {
      verifyEntry(fd, entry, dataStart)
    }
    const main = readMain(fd, entries, dataStart)
    const after = fstatSync(fd)
    if (
      after.size !== before.size ||
      after.mtimeMs !== before.mtimeMs ||
      after.ctimeMs !== before.ctimeMs
    ) {
      fail('archive changed during verification')
    }
    return { archivePath, packedFiles: entries.length, packedBytes: expectedOffset, main }
  } finally {
    closeSync(fd)
  }
}

module.exports = { verifyPackagedAsarIntegrity }

if (require.main === module) {
  try {
    if (process.argv.length !== 3) {
      fail('usage: node verify-packaged-asar-integrity.cjs <app.asar>')
    }
    console.log(JSON.stringify(verifyPackagedAsarIntegrity(process.argv[2])))
  } catch (error) {
    console.error(error.message)
    process.exitCode = 1
  }
}
