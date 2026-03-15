import { HTTPException } from 'hono/http-exception'
import type { CounterRepository, CounterRecord, CreateCounterInput } from './types'

export class CounterService {
    constructor(private readonly repository: CounterRepository) {}

    async findByUrl(url: string): Promise<CounterRecord | null> {
        return this.repository.findByUrl(url)
    }

    async findByUrls(urls: string[]): Promise<CounterRecord[]> {
        return this.repository.findByUrls(urls)
    }

    async createCounter(input: CreateCounterInput): Promise<CounterRecord> {
        if (!input.url) {
            throw new HTTPException(400, { message: 'url is required' })
        }
        if (!Number.isInteger(input.time ?? 0) || (input.time ?? 0) < 0) {
            throw new HTTPException(400, { message: 'time must be a non-negative integer' })
        }
        return this.repository.createCounter({
            ...input,
            time: input.time ?? 0,
            title: input.title ?? '',
        })
    }

    async incrementCounter(objectId: string, amount: number): Promise<CounterRecord> {
        if (!Number.isInteger(amount) || amount <= 0) {
            throw new HTTPException(400, { message: 'Increment amount must be a positive integer' })
        }
        const record = await this.repository.incrementCounterByObjectId(objectId, amount)
        if (!record) {
            throw new HTTPException(404, { message: `Counter ${objectId} not found` })
        }
        return record
    }
}
