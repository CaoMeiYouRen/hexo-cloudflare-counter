import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { afterEach, expect, test, vi } from 'vitest'

afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
})

test('importing object-id does not access random source in module scope', async () => {
    const getRandomValues = vi.fn((bytes: Uint8Array) => {
        bytes.fill(0x11)
        return bytes
    })
    vi.stubGlobal('crypto', { getRandomValues })

    const moduleUrl = pathToFileURL(path.resolve('packages/core/src/counter/object-id.ts')).href
    const { generateObjectId } = await import(`${moduleUrl}?t=${Date.now()}`)

    expect(getRandomValues).not.toHaveBeenCalled()

    const objectId = generateObjectId(new Date('2024-01-01T00:00:00.000Z'))

    expect(getRandomValues).toHaveBeenCalledTimes(2)
    expect(objectId).toHaveLength(24)
    expect(objectId).toMatch(/^[0-9a-f]{24}$/u)
})
