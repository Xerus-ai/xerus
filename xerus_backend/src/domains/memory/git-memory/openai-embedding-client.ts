// OpenAI Embedding Client
// Implements EmbeddingClient interface for the OpenAI Embeddings API.
// Extracted from memory-search-index.service.ts for file size compliance.

import { DEFAULT_EMBEDDING_CONFIG } from '../memory.types';
import type { EmbeddingClient, SearchIndexRepository } from './memory-search-index.service';
import { MemorySearchIndexService } from './memory-search-index.service';

// -- OpenAI Embedding Response ------------------------------------------------

interface OpenAIEmbeddingResponse {
    data: Array<{ embedding: number[]; index: number }>;
    usage: { prompt_tokens: number; total_tokens: number };
}

// -- OpenAI Embedding Client --------------------------------------------------

export class OpenAIEmbeddingClient implements EmbeddingClient {
    private readonly model: string;
    private readonly dimensions: number;

    constructor(
        model = DEFAULT_EMBEDDING_CONFIG.model,
        dimensions = DEFAULT_EMBEDDING_CONFIG.dimensions
    ) {
        this.model = model;
        this.dimensions = dimensions;
    }

    async generateEmbeddings(texts: string[]): Promise<number[][]> {
        if (texts.length === 0) {
            return [];
        }
        const apiKey = process.env.OPENAI_API_KEY;
        if (!apiKey) {
            throw new Error('OPENAI_API_KEY environment variable is not configured');
        }

        const response = await fetch('https://api.openai.com/v1/embeddings', {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${apiKey}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                model: this.model,
                input: texts,
                dimensions: this.dimensions,
            }),
        });

        if (!response.ok) {
            const errorBody = await response.text();
            throw new Error(`OpenAI embedding request failed (${response.status}): ${errorBody}`);
        }

        const data = (await response.json()) as OpenAIEmbeddingResponse;
        const sorted = [...data.data].sort((a, b) => a.index - b.index);
        return sorted.map((item) => item.embedding);
    }
}

// -- Factory ------------------------------------------------------------------

export function createMemorySearchIndexService(): MemorySearchIndexService {
    const { NeonSearchIndexRepository } = require('./memory-search-index.repository') as {
        NeonSearchIndexRepository: new () => SearchIndexRepository;
    };
    return new MemorySearchIndexService(new OpenAIEmbeddingClient(), new NeonSearchIndexRepository());
}
