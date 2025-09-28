/**
 * Knowledge Service - Business Logic Layer
 * Backend Dev Agent 💻 - TDD Implementation
 * Standalone Backend Service
 */

const { neonDB } = require('../database/connections/neon');
const { embeddingService } = require('./embeddingService');
const chunkingEngine = require('./chunkingService');

class KnowledgeService {
  constructor() {
    this.validContentTypes = [
      'text', 'markdown', 'pdf', 'html', 'json', 'code'
    ];
  }

  /**
   * Get knowledge documents with filtering support
   */
  async getKnowledgeDocuments(filters = {}) {
    try {
      const { content_type, is_indexed, tags, search, limit = 50, offset = 0 } = filters;
      
      let query = 'SELECT * FROM knowledge_base WHERE 1=1';
      const params = [];
      
      if (content_type) {
        query += ' AND content_type = $' + (params.length + 1);
        params.push(content_type);
      }
      
      if (is_indexed !== undefined) {
        query += ' AND is_indexed = $' + (params.length + 1);
        params.push(is_indexed);
      }
      
      if (tags && tags.length > 0) {
        query += ' AND tags @> $' + (params.length + 1);
        params.push(JSON.stringify(tags));
      }
      
      if (search) {
        query += ' AND (title ILIKE $' + (params.length + 1) + ' OR content ILIKE $' + (params.length + 2) + ')';
        params.push(`%${search}%`, `%${search}%`);
      }
      
      query += ' ORDER BY updated_at DESC';
      query += ' LIMIT $' + (params.length + 1) + ' OFFSET $' + (params.length + 2);
      params.push(limit, offset);
      
      const result = await neonDB.query(query, params);
      return result.rows;
    } catch (error) {
      throw new Error(`Failed to get knowledge documents: ${error.message}`);
    }
  }

  /**
   * Get knowledge document by ID
   */
  async getKnowledgeDocumentById(id) {
    try {
      // Validate ID parameter
      if (!id) {
        const ValidationError = require('../api/middleware/errorHandler').ValidationError;
        throw new ValidationError('Document ID is required');
      }

      const documentId = parseInt(id);
      if (isNaN(documentId) || documentId <= 0) {
        const ValidationError = require('../api/middleware/errorHandler').ValidationError;
        throw new ValidationError(`Invalid document ID: ${id}. Must be a positive integer.`);
      }

      const result = await neonDB.query('SELECT * FROM knowledge_base WHERE id = $1', [documentId]);
      return result.rows[0] || null;
    } catch (error) {
      // Re-throw ValidationError as-is, wrap other errors
      if (error.name === 'ValidationError') {
        throw error;
      }
      throw new Error(`Failed to get knowledge document: ${error.message}`);
    }
  }

  /**
   * Create new knowledge document
   */
  async createKnowledgeDocument(docData) {
    try {
      // Validate required fields
      if (!docData.title) {
        throw new Error('Title is required');
      }
      
      if (!docData.content) {
        throw new Error('Content is required');
      }
      
      // Validate content type
      if (docData.content_type && !this.validContentTypes.includes(docData.content_type)) {
        throw new Error('Invalid content type');
      }

      const {
        title,
        content,
        content_type = 'text',
        source_url = null,
        file_path = null,
        tags = [],
        metadata = {}
      } = docData;

      // Calculate content statistics
      const word_count = content.split(/\s+/).filter(word => word.length > 0).length;
      const character_count = content.length;

      // Use direct SQL to avoid Neon parameter binding issues
      const safeTitle = title ? `'${title.replace(/'/g, "''")}'` : 'NULL';
      const safeContent = content ? `'${content.replace(/'/g, "''")}'` : 'NULL';
      const safeContentType = content_type ? `'${content_type.replace(/'/g, "''")}'` : 'NULL';
      const safeSourceUrl = source_url ? `'${source_url.replace(/'/g, "''")}'` : 'NULL';
      const safeFilePath = file_path ? `'${file_path.replace(/'/g, "''")}'` : 'NULL';
      const safeTags = `'${JSON.stringify(tags).replace(/'/g, "''")}'::jsonb`;
      const safeMetadata = `'${JSON.stringify(metadata).replace(/'/g, "''")}'::jsonb`;
      
      const query = `
        INSERT INTO knowledge_base (
          title, content, content_type, source_url, file_path, tags, metadata,
          word_count, character_count, is_indexed, created_at, updated_at
        )
        VALUES (${safeTitle}, ${safeContent}, ${safeContentType}, ${safeSourceUrl}, ${safeFilePath}, 
                ${safeTags}, ${safeMetadata}, ${word_count}, ${character_count}, 
                false, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
        RETURNING *
      `;
      
      const result = await neonDB.query(query);
      
      return result.rows[0];
    } catch (error) {
      throw new Error(`Failed to create knowledge document: ${error.message}`);
    }
  }

  /**
   * Update knowledge document
   */
  async updateKnowledgeDocument(id, updateData) {
    try {
      const documentId = parseInt(id);
      if (isNaN(documentId)) {
        throw new Error('Invalid document ID');
      }

      // Validate content type if being updated
      if (updateData.content_type && !this.validContentTypes.includes(updateData.content_type)) {
        throw new Error('Invalid content type');
      }

      const setClause = [];
      const params = [];
      let paramIndex = 1;
      
      // Build dynamic update query
      for (const [key, value] of Object.entries(updateData)) {
        if (['tags', 'metadata'].includes(key)) {
          setClause.push(`${key} = $${paramIndex}`);
          params.push(JSON.stringify(value));
        } else {
          setClause.push(`${key} = $${paramIndex}`);
          params.push(value);
        }
        paramIndex++;
      }
      
      // Recalculate word and character counts if content updated
      if (updateData.content) {
        const word_count = updateData.content.split(/\s+/).filter(word => word.length > 0).length;
        const character_count = updateData.content.length;
        
        setClause.push(`word_count = $${paramIndex}`, `character_count = $${paramIndex + 1}`);
        params.push(word_count, character_count);
        paramIndex += 2;
      }
      
      setClause.push('updated_at = CURRENT_TIMESTAMP');
      params.push(documentId);
      
      const query = `UPDATE knowledge_base SET ${setClause.join(', ')} WHERE id = $${paramIndex} RETURNING *`;
      const result = await neonDB.query(query, params);
      
      return result.rows[0] || null;
    } catch (error) {
      throw new Error(`Failed to update knowledge document: ${error.message}`);
    }
  }

  /**
   * Delete knowledge document with cascade cleanup
   */
  async deleteKnowledgeDocument(id) {
    try {
      const documentId = parseInt(id);
      if (isNaN(documentId)) {
        throw new Error('Invalid document ID');
      }

      return await neonDB.transaction(async (client) => {
        // Clean up related records
        await client.query('DELETE FROM agent_knowledge_access WHERE knowledge_item_id = $1', [documentId]);
        
        // Delete the document
        const result = await client.query('DELETE FROM knowledge_base WHERE id = $1', [documentId]);
        
        return result.rowCount > 0;
      });
    } catch (error) {
      throw new Error(`Failed to delete knowledge document: ${error.message}`);
    }
  }

  /**
   * Search knowledge base using full-text search
   */
  async searchKnowledge(query, options = {}) {
    try {
      if (!query || query.trim() === '') {
        throw new Error('Search query cannot be empty');
      }

      const { 
        content_type, 
        is_indexed = true, 
        limit = 5, 
        similarity_threshold = 0.1 
      } = options;

      let searchQuery = `
        SELECT *, 
               ts_rank_cd(to_tsvector('english', title || ' ' || content), plainto_tsquery('english', $1)) as relevance_score,
               substring(content, 1, 200) as snippet
        FROM knowledge_base 
        WHERE to_tsvector('english', title || ' ' || content) @@ plainto_tsquery('english', $1)
      `;
      
      const params = [query];
      let paramIndex = 2;
      
      if (content_type) {
        searchQuery += ' AND content_type = $' + paramIndex;
        params.push(content_type);
        paramIndex++;
      }
      
      if (is_indexed !== undefined) {
        searchQuery += ' AND is_indexed = $' + paramIndex;
        params.push(is_indexed);
        paramIndex++;
      }
      
      searchQuery += ' AND ts_rank_cd(to_tsvector(title || \' \' || content), plainto_tsquery($1)) > $' + paramIndex;
      params.push(similarity_threshold);
      paramIndex++;
      
      searchQuery += ' ORDER BY relevance_score DESC LIMIT $' + paramIndex;
      params.push(limit);
      
      const result = await neonDB.query(searchQuery, params);
      
      // Log search query for analytics
      await this.logSearchQuery(query, result.rows.length);
      
      return result.rows;
    } catch (error) {
      throw new Error(`Knowledge search failed: ${error.message}`);
    }
  }

  /**
   * Log search query for analytics
   */
  async logSearchQuery(query, resultCount) {
    try {
      const logQuery = `
        INSERT INTO knowledge_queries (query_text, result_count, created_at)
        VALUES ($1, $2, CURRENT_TIMESTAMP)
        RETURNING id
      `;
      
      await neonDB.query(logQuery, [query, resultCount]);
    } catch (error) {
      // Don't throw error for analytics logging failure
      console.warn('Failed to log search query:', error.message);
    }
  }

  /**
   * Reindex document (mark for search indexing)
   */
  async reindexDocument(id) {
    try {
      const documentId = parseInt(id);
      if (isNaN(documentId)) {
        throw new Error('Invalid document ID');
      }

      // Check if document exists
      const document = await this.getKnowledgeDocumentById(documentId);
      if (!document) {
        return false;
      }

      const result = await neonDB.query(
        'UPDATE knowledge_base SET is_indexed = true, updated_at = CURRENT_TIMESTAMP WHERE id = $1',
        [documentId]
      );
      
      return result.rowCount > 0;
    } catch (error) {
      throw new Error(`Failed to reindex document: ${error.message}`);
    }
  }

  /**
   * Bulk index multiple documents
   */
  async bulkIndexDocuments(documentIds) {
    try {
      if (!documentIds || documentIds.length === 0) {
        return { indexed_count: 0, total_requested: 0 };
      }

      const result = await neonDB.query(
        'UPDATE knowledge_base SET is_indexed = true, updated_at = CURRENT_TIMESTAMP WHERE id = ANY($1)',
        [documentIds]
      );
      
      return {
        indexed_count: result.rowCount,
        total_requested: documentIds.length
      };
    } catch (error) {
      throw new Error(`Failed to bulk index documents: ${error.message}`);
    }
  }

  /**
   * Get knowledge base analytics
   */
  async getKnowledgeAnalytics() {
    try {
      const query = `
        SELECT 
          COUNT(*) as total_documents,
          COUNT(*) FILTER (WHERE is_indexed = true) as indexed_documents,
          (SELECT COUNT(*) FROM knowledge_queries) as total_searches,
          (SELECT AVG(result_count) FROM knowledge_queries) as avg_search_results
        FROM knowledge_base
      `;
      
      const result = await neonDB.query(query);
      const analytics = result.rows[0];
      
      // Get top search terms
      const topTermsQuery = `
        SELECT query_text, COUNT(*) as frequency
        FROM knowledge_queries
        WHERE created_at > NOW() - INTERVAL '30 days'
        GROUP BY query_text
        ORDER BY frequency DESC
        LIMIT 5
      `;
      
      const topTermsResult = await neonDB.query(topTermsQuery);
      const topSearchTerms = topTermsResult.rows.map(row => row.query_text);
      
      // Get content type distribution
      const contentTypeQuery = `
        SELECT content_type, COUNT(*) as count
        FROM knowledge_base
        GROUP BY content_type
        ORDER BY count DESC
      `;
      
      const contentTypeResult = await neonDB.query(contentTypeQuery);
      const contentTypeDistribution = {};
      contentTypeResult.rows.forEach(row => {
        contentTypeDistribution[row.content_type] = parseInt(row.count);
      });
      
      return {
        total_documents: parseInt(analytics.total_documents) || 0,
        indexed_documents: parseInt(analytics.indexed_documents) || 0,
        total_searches: parseInt(analytics.total_searches) || 0,
        avg_search_results: parseFloat(analytics.avg_search_results) || 0,
        top_search_terms: topSearchTerms,
        content_type_distribution: contentTypeDistribution
      };
    } catch (error) {
      throw new Error(`Failed to get knowledge analytics: ${error.message}`);
    }
  }

  /**
   * FOLDER MANAGEMENT METHODS
   */

  /**
   * Get folders for a user with optional filtering
   */
  async getFolders(userId, filters = {}) {
    try {
      const { parent_id, search, limit = 100, offset = 0 } = filters;
      
      let query = `
        SELECT f.*, 
               COALESCE(doc_count.count, 0) as document_count,
               COALESCE(doc_count.total_words, 0) as total_words
        FROM folders f
        LEFT JOIN (
          SELECT folder_id, COUNT(*) as count, SUM(word_count) as total_words
          FROM knowledge_base 
          WHERE folder_id IS NOT NULL
          GROUP BY folder_id
        ) doc_count ON f.id = doc_count.folder_id
        WHERE f.user_id = $1
      `;
      const params = [userId];
      
      if (parent_id !== undefined) {
        if (parent_id === null || parent_id === 'null') {
          query += ' AND f.parent_id IS NULL';
        } else {
          query += ' AND f.parent_id = $' + (params.length + 1);
          params.push(parseInt(parent_id));
        }
      }
      
      if (search) {
        query += ' AND (f.name ILIKE $' + (params.length + 1) + ' OR f.description ILIKE $' + (params.length + 2) + ')';
        params.push(`%${search}%`, `%${search}%`);
      }
      
      query += ' ORDER BY f.name ASC';
      query += ' LIMIT $' + (params.length + 1) + ' OFFSET $' + (params.length + 2);
      params.push(limit, offset);
      
      const result = await neonDB.query(query, params);
      return result.rows;
    } catch (error) {
      throw new Error(`Failed to get folders: ${error.message}`);
    }
  }

  /**
   * Get folder by ID
   */
  async getFolderById(folderId, userId) {
    try {
      const result = await neonDB.query(`
        SELECT f.*, 
               COALESCE(doc_count.count, 0) as document_count,
               COALESCE(doc_count.total_words, 0) as total_words
        FROM folders f
        LEFT JOIN (
          SELECT folder_id, COUNT(*) as count, SUM(word_count) as total_words
          FROM knowledge_base 
          WHERE folder_id = $1
          GROUP BY folder_id
        ) doc_count ON f.id = doc_count.folder_id
        WHERE f.id = $1 AND f.user_id = $2
      `, [parseInt(folderId), userId]);
      
      return result.rows[0] || null;
    } catch (error) {
      throw new Error(`Failed to get folder: ${error.message}`);
    }
  }

  /**
   * Create new folder
   */
  async createFolder(folderData, userId) {
    try {
      
      // Validate required fields
      if (!folderData.name) {
        throw new Error('Folder name is required');
      }
      
      const {
        name,
        parent_id = null,
        color = 'blue',
        icon_emoji = '📁',
        description = null
      } = folderData;
      

      // Validate parent folder exists and belongs to user
      if (parent_id) {
        const parentFolder = await this.getFolderById(parent_id, userId);
        if (!parentFolder) {
          throw new Error('Parent folder not found or access denied');
        }
      }

      // Prepare the parent_id value for insertion
      // Ensure we handle undefined, null, and empty string correctly
      let finalParentId = null;
      if (parent_id && parent_id !== 'null' && parent_id !== 'undefined') {
        finalParentId = parseInt(parent_id);
        // Check if parseInt returned NaN
        if (isNaN(finalParentId)) {
          finalParentId = null;
        }
      }

      // Build query based on whether parent_id is provided
      let query;
      let params;
      
      if (finalParentId !== null && finalParentId !== undefined) {
        // Include parent_id in the query
        query = `
          INSERT INTO folders (name, parent_id, user_id, color, icon_emoji, description)
          VALUES ($1, $2, $3, $4, $5, $6)
          RETURNING *, 0 as document_count, 0 as total_words
        `;
        params = [name, finalParentId, userId, color, icon_emoji, description];
      } else {
        // Use NULL for parent_id instead of omitting it entirely
        query = `
          INSERT INTO folders (name, parent_id, user_id, color, icon_emoji, description)
          VALUES ($1, $2, $3, $4, $5, $6)
          RETURNING *, 0 as document_count, 0 as total_words
        `;
        params = [name, null, userId, color, icon_emoji, description];
      }
      
      
      const result = await neonDB.query(query, params);
      
      return result.rows[0];
    } catch (error) {
      if (error.message.includes('duplicate key')) {
        const ConflictError = require('../api/middleware/errorHandler').ConflictError;
        throw new ConflictError('A folder with this name already exists in this location');
      }
      throw new Error(`Failed to create folder: ${error.message}`);
    }
  }

  /**
   * Update folder
   */
  async updateFolder(folderId, updateData, userId) {
    try {
      const folder = await this.getFolderById(folderId, userId);
      if (!folder) {
        throw new Error('Folder not found or access denied');
      }

      const allowedFields = ['name', 'parent_id', 'color', 'icon_emoji', 'description'];
      const setClause = [];
      const params = [];
      let paramIndex = 1;
      
      // Build dynamic update query
      for (const [key, value] of Object.entries(updateData)) {
        if (allowedFields.includes(key)) {
          setClause.push(`${key} = $${paramIndex}`);
          params.push(value);
          paramIndex++;
        }
      }
      
      if (setClause.length === 0) {
        throw new Error('No valid fields to update');
      }
      
      // Validate parent folder if being changed
      if (updateData.parent_id && updateData.parent_id !== folder.parent_id) {
        const parentFolder = await this.getFolderById(updateData.parent_id, userId);
        if (!parentFolder) {
          throw new Error('Parent folder not found or access denied');
        }
        
        // Prevent creating circular references
        if (updateData.parent_id === folderId) {
          throw new Error('A folder cannot be its own parent');
        }
      }
      
      params.push(parseInt(folderId), userId);
      
      const query = `
        UPDATE folders 
        SET ${setClause.join(', ')}, updated_at = CURRENT_TIMESTAMP
        WHERE id = $${paramIndex} AND user_id = $${paramIndex + 1}
        RETURNING *
      `;
      
      const result = await neonDB.query(query, params);
      return result.rows[0] || null;
    } catch (error) {
      throw new Error(`Failed to update folder: ${error.message}`);
    }
  }

  /**
   * Delete folder with cascade options
   */
  async deleteFolder(folderId, userId, options = {}) {
    try {
      const folder = await this.getFolderById(folderId, userId);
      if (!folder) {
        throw new Error('Folder not found or access denied');
      }

      return await neonDB.transaction(async (client) => {
        // Handle documents in the folder
        if (options.moveDocumentsToParent) {
          // Move documents to parent folder
          await client.query(
            'UPDATE knowledge_base SET folder_id = $1 WHERE folder_id = $2 AND user_id = $3',
            [folder.parent_id, parseInt(folderId), userId]
          );
        } else if (options.deleteDocuments) {
          // Delete all documents in folder
          await client.query(
            'DELETE FROM knowledge_base WHERE folder_id = $1 AND user_id = $2',
            [parseInt(folderId), userId]
          );
        } else {
          // Default: move documents to root (no folder)
          await client.query(
            'UPDATE knowledge_base SET folder_id = NULL WHERE folder_id = $1 AND user_id = $2',
            [parseInt(folderId), userId]
          );
        }

        // Handle child folders
        if (options.moveSubfoldersToParent) {
          // Move child folders to parent
          await client.query(
            'UPDATE folders SET parent_id = $1 WHERE parent_id = $2 AND user_id = $3',
            [folder.parent_id, parseInt(folderId), userId]
          );
        }
        // Note: Cascade deletion of child folders is handled by database constraint

        // Delete the folder
        const result = await client.query(
          'DELETE FROM folders WHERE id = $1 AND user_id = $2',
          [parseInt(folderId), userId]
        );
        
        return result.rowCount > 0;
      });
    } catch (error) {
      throw new Error(`Failed to delete folder: ${error.message}`);
    }
  }

  /**
   * Move document to folder
   */
  async moveDocumentToFolder(documentId, folderId, userId) {
    try {
      // Validate document exists and belongs to user
      const document = await neonDB.query(
        'SELECT id FROM knowledge_base WHERE id = $1 AND user_id = $2',
        [parseInt(documentId), userId]
      );
      
      if (!document.rows[0]) {
        throw new Error('Document not found or access denied');
      }

      // Validate folder exists and belongs to user (if provided)
      if (folderId) {
        const folder = await this.getFolderById(folderId, userId);
        if (!folder) {
          throw new Error('Folder not found or access denied');
        }
      }

      const result = await neonDB.query(
        'UPDATE knowledge_base SET folder_id = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2 AND user_id = $3 RETURNING *',
        [folderId ? parseInt(folderId) : null, parseInt(documentId), userId]
      );
      
      return result.rows[0] || null;
    } catch (error) {
      throw new Error(`Failed to move document: ${error.message}`);
    }
  }

  /**
   * Get folder hierarchy for a user
   */
  async getFolderHierarchy(userId) {
    try {
      const query = `
        WITH RECURSIVE folder_tree AS (
          -- Root folders
          SELECT 
            id, name, parent_id, user_id, color, icon_emoji, description,
            created_at, updated_at,
            0 as depth,
            ARRAY[id] as path,
            name as full_path
          FROM folders 
          WHERE parent_id IS NULL AND user_id = $1
          
          UNION ALL
          
          -- Child folders
          SELECT 
            f.id, f.name, f.parent_id, f.user_id, f.color, f.icon_emoji, f.description,
            f.created_at, f.updated_at,
            ft.depth + 1,
            ft.path || f.id,
            ft.full_path || ' / ' || f.name
          FROM folders f
          JOIN folder_tree ft ON f.parent_id = ft.id
          WHERE f.user_id = $1
        )
        SELECT 
          ft.*,
          COALESCE(doc_counts.document_count, 0) as document_count,
          COALESCE(doc_counts.total_words, 0) as total_words
        FROM folder_tree ft
        LEFT JOIN (
          SELECT 
            folder_id,
            COUNT(*) as document_count,
            SUM(word_count) as total_words
          FROM knowledge_base 
          WHERE folder_id IS NOT NULL AND user_id = $1
          GROUP BY folder_id
        ) doc_counts ON ft.id = doc_counts.folder_id
        ORDER BY ft.depth, ft.name
      `;
      
      const result = await neonDB.query(query, [userId]);
      return result.rows;
    } catch (error) {
      throw new Error(`Failed to get folder hierarchy: ${error.message}`);
    }
  }

  /**
   * Update existing methods to support user filtering and folder assignment
   */

  /**
   * Override getKnowledgeDocuments to include user filtering
   */
  async getKnowledgeDocuments(filters = {}) {
    try {
      const { content_type, is_indexed, tags, search, limit = 50, offset = 0, user_id, folder_id } = filters;
      
      let query = `
        SELECT kb.*, f.name as folder_name, f.color as folder_color
        FROM knowledge_base kb
        LEFT JOIN folders f ON kb.folder_id = f.id
        WHERE 1=1
      `;
      const params = [];
      
      // User filtering
      if (user_id) {
        query += ' AND kb.user_id = $' + (params.length + 1);
        params.push(user_id);
      }
      
      // Folder filtering
      if (folder_id !== undefined) {
        if (folder_id === null || folder_id === 'null') {
          query += ' AND kb.folder_id IS NULL';
        } else {
          query += ' AND kb.folder_id = $' + (params.length + 1);
          params.push(parseInt(folder_id));
        }
      }
      
      if (content_type) {
        query += ' AND kb.content_type = $' + (params.length + 1);
        params.push(content_type);
      }
      
      if (is_indexed !== undefined) {
        query += ' AND kb.is_indexed = $' + (params.length + 1);
        params.push(is_indexed);
      }
      
      if (tags && tags.length > 0) {
        query += ' AND kb.tags @> $' + (params.length + 1);
        params.push(JSON.stringify(tags));
      }
      
      if (search) {
        query += ' AND (kb.title ILIKE $' + (params.length + 1) + ' OR kb.content ILIKE $' + (params.length + 2) + ')';
        params.push(`%${search}%`, `%${search}%`);
      }
      
      query += ' ORDER BY kb.updated_at DESC';
      query += ' LIMIT $' + (params.length + 1) + ' OFFSET $' + (params.length + 2);
      params.push(limit, offset);
      
      const result = await neonDB.query(query, params);
      return result.rows;
    } catch (error) {
      throw new Error(`Failed to get knowledge documents: ${error.message}`);
    }
  }

  /**
   * Override createKnowledgeDocument to include user_id, folder_id, and embedding generation
   */
  async createKnowledgeDocument(docData, userId) {
    try {
      // Validate required fields
      if (!docData.title) {
        throw new Error('Title is required');
      }
      
      if (!docData.content) {
        throw new Error('Content is required');
      }
      
      // Validate content type
      if (docData.content_type && !this.validContentTypes.includes(docData.content_type)) {
        throw new Error('Invalid content type');
      }

      // Validate folder if provided
      if (docData.folder_id) {
        const folder = await this.getFolderById(docData.folder_id, userId);
        if (!folder) {
          throw new Error('Folder not found or access denied');
        }
      }

      const {
        title,
        content,
        content_type = 'text',
        source_url = null,
        file_path = null,
        tags = [],
        metadata = {},
        folder_id = null,
        auto_index = false,
        enable_chunking = true
      } = docData;

      // Calculate content statistics
      const word_count = content.split(/\s+/).filter(word => word.length > 0).length;
      const character_count = content.length;

      let embedding_vector = null;
      let is_indexed = false;
      let index_status = 'pending';

      // Generate embedding if auto_index is requested
      if (auto_index) {
        try {
          console.log('[AI] Generating embedding for document:', title);
          
          // Initialize embedding service if needed
          if (!embeddingService.initialized) {
            await embeddingService.initialize();
          }

          // Generate embedding from title + content for better context
          const textToEmbed = `${title}\n\n${content}`;
          const embedding = await embeddingService.generateEmbedding(textToEmbed);
          
          if (embedding && Array.isArray(embedding) && embedding.length > 0) {
            // Convert embedding array to pgvector format
            embedding_vector = `[${embedding.join(',')}]`;
            is_indexed = true;
            index_status = 'completed';
            console.log(`[OK] Embedding generated successfully: ${embedding.length} dimensions`);
          } else {
            console.warn('[WARNING] Embedding generation returned invalid result, proceeding without embedding');
          }
        } catch (embeddingError) {
          console.error('[ERROR] Embedding generation failed:', embeddingError.message);
          console.log('📝 Document will be created without embedding (can be generated later)');
          // Continue with document creation even if embedding fails
        }
      }

      const query = `
        INSERT INTO knowledge_base (
          title, content, content_type, source_url, file_path, tags, metadata,
          word_count, character_count, embedding_vector, is_indexed, index_status, 
          user_id, folder_id, created_at, updated_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::vector, $11, $12, $13, $14, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
        RETURNING *
      `;
      
      const result = await neonDB.query(query, [
        title,
        content,
        content_type,
        source_url,
        file_path,
        JSON.stringify(tags),
        JSON.stringify(metadata),
        word_count,
        character_count,
        embedding_vector, // pgvector format or null
        is_indexed,
        index_status,
        userId,
        folder_id ? parseInt(folder_id) : null
      ]);
      
      const document = result.rows[0];
      
      // Log embedding status for debugging
      console.log(`[DATA] Document created: ID=${document.id}, indexed=${document.is_indexed}, status=${document.index_status}`);

      // Create document chunks if enabled and document is large enough
      if (enable_chunking) {
        try {
          await this.createDocumentChunks(document, { auto_index });
        } catch (chunkingError) {
          console.error('[WARNING] Document chunking failed:', chunkingError.message);
          console.log('📝 Document created successfully, but chunks could not be generated');
          // Don't fail the entire operation if chunking fails
        }
      }
      
      return document;
    } catch (error) {
      throw new Error(`Failed to create knowledge document: ${error.message}`);
    }
  }

  /**
   * Generate embedding for existing document
   */
  async generateDocumentEmbedding(documentId, options = {}) {
    try {
      // Get the document
      const document = await this.getKnowledgeDocumentById(documentId);
      if (!document) {
        throw new Error('Document not found');
      }

      console.log('[AI] Generating embedding for existing document:', document.title);

      // Initialize embedding service if needed
      if (!embeddingService.initialized) {
        await embeddingService.initialize();
      }

      // Generate embedding from title + content
      const textToEmbed = `${document.title}\n\n${document.content}`;
      console.log(`[AI] Generating embedding for text: ${textToEmbed.substring(0, 100)}...`);
      
      const embedding = await embeddingService.generateEmbedding(textToEmbed);

      console.log(`[DATA] Embedding generated: length=${embedding?.length}, type=${Array.isArray(embedding) ? 'array' : typeof embedding}`);

      if (!embedding || !Array.isArray(embedding) || embedding.length === 0) {
        throw new Error('Invalid embedding generated');
      }

      if (embedding.length !== 1536) {
        console.error(`[ERROR] Embedding dimension mismatch: expected 1536, got ${embedding.length}`);
        throw new Error(`Embedding dimension mismatch: expected 1536, got ${embedding.length}`);
      }

      // Convert embedding array to pgvector format
      const embedding_vector = `[${embedding.join(',')}]`;

      // Update document with embedding
      const updateQuery = `
        UPDATE knowledge_base 
        SET embedding_vector = $1::vector, is_indexed = $2, index_status = $3, updated_at = CURRENT_TIMESTAMP
        WHERE id = $4
        RETURNING id, title, is_indexed, index_status, embedding_vector IS NOT NULL as has_embedding, updated_at
      `;

      console.log(`[LOADING] Executing UPDATE query with:`, {
        documentId: parseInt(documentId),
        embedding_length: embedding.length,
        embedding_vector_sample: embedding_vector.substring(0, 50) + '...',
        is_indexed: true,
        index_status: 'completed'
      });

      const result = await neonDB.query(updateQuery, [
        embedding_vector,
        true,
        'completed',
        parseInt(documentId)
      ]);

      console.log(`[SEARCH] Database update result:`, {
        rowCount: result.rowCount,
        hasRows: result.rows && result.rows.length > 0,
        firstRow: result.rows?.[0] || 'no rows returned'
      });

      const updatedDocument = result.rows[0];
      console.log(`[OK] Embedding generated successfully: ID=${updatedDocument.id}, dimensions=${embedding.length}`);

      return updatedDocument;
    } catch (error) {
      console.error('[ERROR] Embedding generation failed:', error.message);
      throw new Error(`Failed to generate embedding: ${error.message}`);
    }
  }

  /**
   * Bulk generate embeddings for multiple documents
   */
  async bulkGenerateEmbeddings(documentIds = [], options = {}) {
    try {
      const { batchSize = 5 } = options;
      const results = {
        successful: [],
        failed: [],
        total: documentIds.length
      };

      console.log(`[AI] Starting bulk embedding generation for ${documentIds.length} documents`);

      // Initialize embedding service if needed
      if (!embeddingService.initialized) {
        await embeddingService.initialize();
      }

      // Process in batches to avoid overwhelming the API
      for (let i = 0; i < documentIds.length; i += batchSize) {
        const batch = documentIds.slice(i, i + batchSize);
        console.log(`[PACKAGE] Processing batch ${Math.floor(i/batchSize) + 1}/${Math.ceil(documentIds.length/batchSize)}`);

        const batchPromises = batch.map(async (docId) => {
          try {
            const result = await this.generateDocumentEmbedding(docId);
            results.successful.push({
              id: docId,
              status: 'completed',
              dimensions: result.has_embedding ? 'generated' : 'failed'
            });
          } catch (error) {
            results.failed.push({
              id: docId,
              status: 'failed',
              error: error.message
            });
          }
        });

        await Promise.all(batchPromises);

        // Small delay between batches to avoid rate limiting
        if (i + batchSize < documentIds.length) {
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      }

      console.log(`[OK] Bulk embedding generation completed: ${results.successful.length}/${results.total} successful`);
      return results;
    } catch (error) {
      throw new Error(`Failed to bulk generate embeddings: ${error.message}`);
    }
  }

  /**
   * Create document chunks using intelligent chunking engine
   */
  async createDocumentChunks(document, options = {}) {
    try {
      const { auto_index = false } = options;
      
      console.log(`[PACKAGE] Creating chunks for document: ${document.title}`);
      
      // Initialize chunking engine if needed
      if (!chunkingEngine.initialized) {
        await chunkingEngine.initialize();
      }

      // Generate chunks using intelligent chunking
      const chunks = await chunkingEngine.chunkDocument(document, {
        enableOverlapTracking: true,
        preserveMetadata: true
      });

      if (chunks.length === 0) {
        console.log('[SKIP] No chunks created (document too small)');
        return [];
      }

      // Initialize embedding service if auto_index is enabled
      if (auto_index && !embeddingService.initialized) {
        await embeddingService.initialize();
      }

      // Insert chunks into database with optional embeddings
      const insertedChunks = [];
      
      for (const chunk of chunks) {
        let embedding_vector = null;
        
        // Generate embedding for chunk if requested
        if (auto_index) {
          try {
            const embedding = await embeddingService.generateEmbedding(chunk.chunk_text);
            if (embedding && Array.isArray(embedding) && embedding.length > 0) {
              embedding_vector = `[${embedding.join(',')}]`;
              console.log(`[OK] Generated embedding for chunk ${chunk.chunk_index}`);
            }
          } catch (embeddingError) {
            console.warn(`[WARNING] Embedding generation failed for chunk ${chunk.chunk_index}:`, embeddingError.message);
          }
        }

        // Insert chunk into database
        const insertQuery = `
          INSERT INTO document_chunks (
            knowledge_base_id, chunk_text, chunk_index, chunk_tokens, chunk_size,
            embedding_vector, overlap_start, overlap_end, metadata
          ) VALUES ($1, $2, $3, $4, $5, $6::vector, $7, $8, $9)
          RETURNING *
        `;

        const result = await neonDB.query(insertQuery, [
          document.id,
          chunk.chunk_text,
          chunk.chunk_index,
          chunk.chunk_tokens,
          chunk.chunk_size,
          embedding_vector,
          chunk.overlap_start,
          chunk.overlap_end,
          JSON.stringify(chunk.metadata)
        ]);

        insertedChunks.push(result.rows[0]);
      }

      console.log(`[OK] Created ${insertedChunks.length} chunks for document ${document.id}`);
      return insertedChunks;

    } catch (error) {
      console.error('[ERROR] Document chunking failed:', error);
      throw new Error(`Failed to create document chunks: ${error.message}`);
    }
  }

  /**
   * Get chunks for a specific document
   */
  async getDocumentChunks(documentId, options = {}) {
    try {
      const { include_embeddings = false } = options;
      
      let query = `
        SELECT id, knowledge_base_id, chunk_text, chunk_index, chunk_tokens, chunk_size,
               overlap_start, overlap_end, metadata, created_at
        ${include_embeddings ? ', embedding_vector IS NOT NULL as has_embedding' : ''}
        FROM document_chunks 
        WHERE knowledge_base_id = $1
        ORDER BY chunk_index ASC
      `;

      const result = await neonDB.query(query, [parseInt(documentId)]);
      return result.rows;
    } catch (error) {
      throw new Error(`Failed to get document chunks: ${error.message}`);
    }
  }

  /**
   * Search chunks with vector similarity
   */
  async searchChunks(query, options = {}) {
    try {
      const { 
        limit = 10, 
        similarity_threshold = 0.7,
        user_id = null,
        document_ids = []
      } = options;

      // Generate query embedding
      if (!embeddingService.initialized) {
        await embeddingService.initialize();
      }

      const queryEmbedding = await embeddingService.generateEmbedding(query);
      if (!queryEmbedding || !Array.isArray(queryEmbedding)) {
        throw new Error('Failed to generate query embedding');
      }

      const embeddingVector = `[${queryEmbedding.join(',')}]`;

      // Build search query with access control
      let searchQuery = `
        SELECT 
          dc.id,
          dc.knowledge_base_id,
          dc.chunk_text,
          dc.chunk_index,
          dc.chunk_tokens,
          dc.metadata,
          kb.title as document_title,
          kb.content_type,
          (dc.embedding_vector <=> $1::vector) as similarity_score
        FROM document_chunks dc
        JOIN knowledge_base kb ON dc.knowledge_base_id = kb.id
        WHERE dc.embedding_vector IS NOT NULL
      `;

      const params = [embeddingVector];
      let paramIndex = 2;

      // User access control
      if (user_id) {
        searchQuery += ` AND kb.user_id = $${paramIndex}`;
        params.push(user_id);
        paramIndex++;
      }

      // Filter by specific documents
      if (document_ids.length > 0) {
        searchQuery += ` AND dc.knowledge_base_id = ANY($${paramIndex})`;
        params.push(document_ids);
        paramIndex++;
      }

      // Similarity threshold
      searchQuery += ` AND (dc.embedding_vector <=> $1::vector) <= $${paramIndex}`;
      params.push(1 - similarity_threshold); // pgvector uses distance, not similarity
      paramIndex++;

      searchQuery += ` ORDER BY similarity_score ASC LIMIT $${paramIndex}`;
      params.push(limit);

      const result = await neonDB.query(searchQuery, params);
      
      // Convert distance back to similarity score
      const chunks = result.rows.map(row => ({
        ...row,
        similarity_score: 1 - row.similarity_score
      }));

      console.log(`[SEARCH] Found ${chunks.length} chunk matches for query`);
      return chunks;

    } catch (error) {
      throw new Error(`Chunk search failed: ${error.message}`);
    }
  }

  /**
   * Delete chunks for a document
   */
  async deleteDocumentChunks(documentId) {
    try {
      const result = await neonDB.query(
        'DELETE FROM document_chunks WHERE knowledge_base_id = $1',
        [parseInt(documentId)]
      );
      
      console.log(`[DELETE] Deleted ${result.rowCount} chunks for document ${documentId}`);
      return result.rowCount;
    } catch (error) {
      throw new Error(`Failed to delete document chunks: ${error.message}`);
    }
  }

  /**
   * Regenerate chunks for existing document
   */
  async regenerateDocumentChunks(documentId, options = {}) {
    try {
      // Get the document
      const document = await this.getKnowledgeDocumentById(documentId);
      if (!document) {
        throw new Error('Document not found');
      }

      // Delete existing chunks
      await this.deleteDocumentChunks(documentId);

      // Create new chunks
      const chunks = await this.createDocumentChunks(document, options);
      
      console.log(`[LOADING] Regenerated ${chunks.length} chunks for document ${documentId}`);
      return chunks;
    } catch (error) {
      throw new Error(`Failed to regenerate chunks: ${error.message}`);
    }
  }

  /**
   * Get documents that need embedding generation
   */
  async getDocumentsNeedingEmbeddings(limit = 50) {
    try {
      const query = `
        SELECT id, title, content, created_at
        FROM knowledge_base
        WHERE (is_indexed = false OR embedding_vector IS NULL)
        AND content IS NOT NULL AND content != ''
        ORDER BY created_at DESC
        LIMIT $1
      `;

      const result = await neonDB.query(query, [limit]);
      return result.rows;
    } catch (error) {
      throw new Error(`Failed to get documents needing embeddings: ${error.message}`);
    }
  }
}

module.exports = KnowledgeService;