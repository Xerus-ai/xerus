/**
 * Chunking Engine Unit Tests
 * Tests the intelligent document chunking functionality
 */

const chunkingEngine = require('../../../services/chunkingService');

describe('ChunkingEngine', () => {
  beforeAll(async () => {
    // Initialize chunking engine
    await chunkingEngine.initialize();
  });

  describe('Initialization', () => {
    test('should initialize successfully', async () => {
      expect(chunkingEngine.initialized).toBe(true);
      
      const healthCheck = await chunkingEngine.healthCheck();
      expect(healthCheck.status).toBe('healthy');
    });

    test('should have valid chunking strategies', () => {
      const stats = chunkingEngine.getStats();
      expect(stats.supportedContentTypes).toContain('text');
      expect(stats.supportedContentTypes).toContain('markdown');
      expect(stats.supportedContentTypes).toContain('code');
      expect(stats.supportedContentTypes).toContain('pdf');
      expect(stats.supportedContentTypes).toContain('html');
      expect(stats.supportedContentTypes).toContain('json');
    });
  });

  describe('Document Chunking', () => {
    test('should chunk a large text document properly', async () => {
      const testDocument = {
        id: 1,
        title: 'Test Document',
        content: 'This is the first paragraph. It contains some important information about the topic.\n\n' +
                'This is the second paragraph. It provides additional details and context.\n\n' +
                'This is the third paragraph. It concludes the document with final thoughts.\n\n' +
                'This is a long document that should be chunked. '.repeat(50), // ~2000+ chars
        content_type: 'text',
        word_count: 300,
        character_count: 2000
      };

      const chunks = await chunkingEngine.chunkDocument(testDocument);

      expect(chunks).toHaveLength(expect.any(Number));
      expect(chunks.length).toBeGreaterThan(1);
      
      // Check chunk properties
      chunks.forEach((chunk, index) => {
        expect(chunk).toHaveProperty('chunk_text');
        expect(chunk).toHaveProperty('chunk_index', index);
        expect(chunk).toHaveProperty('chunk_tokens');
        expect(chunk).toHaveProperty('chunk_size');
        expect(chunk).toHaveProperty('metadata');
        
        // Validate chunk content
        expect(typeof chunk.chunk_text).toBe('string');
        expect(chunk.chunk_text.length).toBeGreaterThan(0);
        expect(chunk.chunk_tokens).toBeGreaterThan(0);
        expect(chunk.chunk_size).toBe(chunk.chunk_text.length);
      });
    });

    test('should handle small documents by creating single chunk', async () => {
      const smallDocument = {
        id: 2,
        title: 'Small Document',
        content: 'This is a very short document.',
        content_type: 'text',
        word_count: 7,
        character_count: 30
      };

      const chunks = await chunkingEngine.chunkDocument(smallDocument);

      expect(chunks).toHaveLength(1);
      expect(chunks[0].chunk_text).toBe(smallDocument.content);
      expect(chunks[0].chunk_index).toBe(0);
      expect(chunks[0].metadata.is_single_chunk).toBe(true);
    });

    test('should handle markdown content with proper separators', async () => {
      const markdownDocument = {
        id: 3,
        title: 'Markdown Guide',
        content: `# Main Title

This is the introduction section with some content.

## Section 1

This is the first section with detailed information. It has multiple sentences and paragraphs to test chunking.

### Subsection 1.1

More detailed information in a subsection.

## Section 2

This is the second section with different content. It should be in a separate chunk if the content is long enough.

### Subsection 2.1

Additional subsection content here.`,
        content_type: 'markdown',
        word_count: 50,
        character_count: 500
      };

      const chunks = await chunkingEngine.chunkDocument(markdownDocument);

      expect(chunks.length).toBeGreaterThanOrEqual(1);
      
      // Check if markdown headers are preserved in metadata
      const chunkWithHeader = chunks.find(chunk => 
        chunk.metadata.section_info && chunk.metadata.section_info.header_text
      );
      
      if (chunkWithHeader) {
        expect(chunkWithHeader.metadata.section_info).toHaveProperty('header_level');
        expect(chunkWithHeader.metadata.section_info).toHaveProperty('header_text');
      }
    });

    test('should handle code content appropriately', async () => {
      const codeDocument = {
        id: 4,
        title: 'JavaScript Functions',
        content: `function calculateSum(a, b) {
  return a + b;
}

function calculateProduct(x, y) {
  const result = x * y;
  console.log('Product:', result);
  return result;
}

class Calculator {
  constructor() {
    this.history = [];
  }

  add(a, b) {
    const result = a + b;
    this.history.push(\`\${a} + \${b} = \${result}\`);
    return result;
  }

  multiply(x, y) {
    const result = x * y;
    this.history.push(\`\${x} * \${y} = \${result}\`);
    return result;
  }
}`,
        content_type: 'code',
        word_count: 60,
        character_count: 800
      };

      const chunks = await chunkingEngine.chunkDocument(codeDocument);

      expect(chunks.length).toBeGreaterThanOrEqual(1);
      
      // Check if code structure is preserved in metadata
      chunks.forEach(chunk => {
        expect(chunk.metadata.content_type).toBe('code');
        if (chunk.chunk_text.includes('function') || chunk.chunk_text.includes('class')) {
          // Should extract function/class info if present
          expect(chunk.metadata).toHaveProperty('section_info');
        }
      });
    });

    test('should handle overlap tracking correctly', async () => {
      const overlappingDocument = {
        id: 5,
        title: 'Overlap Test',
        content: 'Sentence one. Sentence two. Sentence three. Sentence four. ' +
                'Sentence five. Sentence six. Sentence seven. Sentence eight. '.repeat(20),
        content_type: 'text',
        word_count: 160,
        character_count: 1000
      };

      const chunks = await chunkingEngine.chunkDocument(overlappingDocument, {
        enableOverlapTracking: true
      });

      if (chunks.length > 1) {
        // Check overlap tracking
        for (let i = 1; i < chunks.length; i++) {
          expect(chunks[i]).toHaveProperty('overlap_start');
          expect(chunks[i]).toHaveProperty('overlap_end');
        }
      }
    });

    test('should preserve metadata correctly', async () => {
      const documentWithMetadata = {
        id: 6,
        title: 'Metadata Test Document',
        content: 'This document tests metadata preservation during chunking. '.repeat(30),
        content_type: 'text',
        source_url: 'https://example.com/test',
        word_count: 180,
        character_count: 1200
      };

      const chunks = await chunkingEngine.chunkDocument(documentWithMetadata, {
        preserveMetadata: true
      });

      chunks.forEach(chunk => {
        expect(chunk.metadata).toHaveProperty('content_type', 'text');
        expect(chunk.metadata).toHaveProperty('source_title', 'Metadata Test Document');
        expect(chunk.metadata).toHaveProperty('source_url', 'https://example.com/test');
        expect(chunk.metadata).toHaveProperty('total_chunks', chunks.length);
      });
    });
  });

  describe('Token Estimation', () => {
    test('should estimate tokens correctly', () => {
      const testText = 'This is a test sentence with approximately ten tokens here.';
      const estimatedTokens = chunkingEngine.estimateTokenCount(testText);
      
      // Should be roughly 10-15 tokens (approximate)
      expect(estimatedTokens).toBeGreaterThan(10);
      expect(estimatedTokens).toBeLessThan(20);
    });
  });

  describe('Performance and Statistics', () => {
    test('should track performance statistics', async () => {
      const initialStats = chunkingEngine.getStats();
      const initialCount = initialStats.documentsChunked;

      const testDoc = {
        id: 7,
        title: 'Performance Test',
        content: 'Performance test content. '.repeat(50),
        content_type: 'text',
        word_count: 100,
        character_count: 600
      };

      await chunkingEngine.chunkDocument(testDoc);

      const updatedStats = chunkingEngine.getStats();
      expect(updatedStats.documentsChunked).toBe(initialCount + 1);
      expect(updatedStats.totalChunksCreated).toBeGreaterThan(0);
      expect(updatedStats.avgProcessingTimeMs).toBeGreaterThan(0);
    });
  });

  describe('Error Handling', () => {
    test('should handle invalid document gracefully', async () => {
      const invalidDocument = {
        id: null,
        title: '',
        content: '',
        content_type: 'text'
      };

      await expect(chunkingEngine.chunkDocument(invalidDocument))
        .rejects.toThrow();
    });

    test('should handle unsupported content type', async () => {
      const unsupportedDoc = {
        id: 8,
        title: 'Unsupported Content',
        content: 'This document has an unsupported content type.',
        content_type: 'unsupported_type',
        word_count: 8,
        character_count: 50
      };

      // Should fallback to text strategy
      const chunks = await chunkingEngine.chunkDocument(unsupportedDoc);
      expect(chunks).toHaveLength(1); // Single chunk due to small size
    });
  });

  afterAll(async () => {
    // Cleanup if needed
    console.log('ChunkingEngine tests completed');
  });
});