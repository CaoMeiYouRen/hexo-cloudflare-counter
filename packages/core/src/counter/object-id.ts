const PROCESS_UNIQUE_LENGTH = 5
const MAX_COUNTER = 0xffffff

let processUnique: Uint8Array | undefined
let counter: number | undefined

function createRandomBytes(length: number): Uint8Array {
    const bytes = new Uint8Array(length)
    if (typeof globalThis.crypto?.getRandomValues === 'function') {
        return globalThis.crypto.getRandomValues(bytes)
    }

    for (let index = 0; index < length; index += 1) {
        bytes[index] = Math.floor(Math.random() * 256)
    }
    return bytes
}

function createRandomCounter(): number {
    const bytes = createRandomBytes(3)
    return ((bytes[0] ?? 0) << 16) | ((bytes[1] ?? 0) << 8) | (bytes[2] ?? 0)
}

function toHex(value: number, length: number): string {
    return value.toString(16).padStart(length, '0').slice(-length)
}

function bytesToHex(bytes: Uint8Array): string {
    return Array.from(bytes, (byte) => toHex(byte, 2)).join('')
}

function getProcessUnique(): Uint8Array {
    if (!processUnique) {
        processUnique = createRandomBytes(PROCESS_UNIQUE_LENGTH)
    }
    return processUnique
}

function nextCounter(): number {
    if (counter === undefined) {
        counter = createRandomCounter()
    }
    counter = (counter + 1) % MAX_COUNTER
    return counter
}

export function generateObjectId(date = new Date()): string {
    const timestamp = Math.floor(date.getTime() / 1000)
    const timestampHex = toHex(timestamp, 8)
    const processUniqueHex = bytesToHex(getProcessUnique())
    const counterHex = toHex(nextCounter(), 6)
    return `${timestampHex}${processUniqueHex}${counterHex}`
}
