export interface CounterRecord {
    objectId: string
    title: string
    url: string
    time: number
    createdAt: string
    updatedAt: string
}

export interface CreateCounterInput {
    title?: string
    url: string
    time?: number
}

export interface IncrementOperation {
    __op: 'Increment'
    amount: number
}

export interface CounterRepository {
    findByUrl(url: string): Promise<CounterRecord | null>
    findByUrls(urls: string[]): Promise<CounterRecord[]>
    createCounter(input: CreateCounterInput): Promise<CounterRecord>
    incrementCounterByObjectId(objectId: string, amount: number): Promise<CounterRecord | null>
    findByObjectId(objectId: string): Promise<CounterRecord | null>
}
