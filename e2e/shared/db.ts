import { Pool, type QueryResult } from 'pg'
import { CONFIG } from './config'

let pool: Pool | null = null

function getPool(): Pool {
  if (!pool) {
    pool = new Pool({
      connectionString: CONFIG.neon.connectionString,
      ssl: true,
      max: 3,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: CONFIG.timeouts.dbQuery,
    })
  }
  return pool
}

export const db = {
  /**
   * Run a raw SQL query with parameterized values.
   */
  async query<T extends Record<string, unknown> = Record<string, unknown>>(
    sql: string,
    params: unknown[] = []
  ): Promise<T[]> {
    const result: QueryResult<T> = await getPool().query(sql, params)
    return result.rows
  },

  /**
   * Count rows matching conditions.
   */
  async count(
    table: string,
    where: Record<string, unknown> = {}
  ): Promise<number> {
    const keys = Object.keys(where)
    const conditions = keys.map((k, i) => `"${k}" = $${i + 1}`).join(' AND ')
    const sql = `SELECT COUNT(*)::int AS count FROM "${table}"${conditions ? ' WHERE ' + conditions : ''}`
    const rows = await db.query<{ count: number }>(sql, Object.values(where))
    return rows[0].count
  },

  /**
   * Find the most recently created row matching conditions.
   */
  async findLatest<T extends Record<string, unknown> = Record<string, unknown>>(
    table: string,
    where: Record<string, unknown> = {},
    orderBy = 'created_at'
  ): Promise<T> {
    const keys = Object.keys(where)
    const conditions = keys.map((k, i) => `"${k}" = $${i + 1}`).join(' AND ')
    const sql = `SELECT * FROM "${table}"${conditions ? ' WHERE ' + conditions : ''} ORDER BY "${orderBy}" DESC LIMIT 1`
    const rows = await db.query<T>(sql, Object.values(where))
    if (rows.length === 0) {
      throw new Error(`No row found in ${table} matching ${JSON.stringify(where)}`)
    }
    return rows[0]
  },

  /**
   * Find a single row by ID.
   */
  async findById<T extends Record<string, unknown> = Record<string, unknown>>(
    table: string,
    id: unknown,
    idColumn = 'id'
  ): Promise<T | null> {
    const sql = `SELECT * FROM "${table}" WHERE "${idColumn}" = $1 LIMIT 1`
    const rows = await db.query<T>(sql, [id])
    return rows[0] || null
  },

  /**
   * Find all rows matching conditions.
   */
  async findAll<T extends Record<string, unknown> = Record<string, unknown>>(
    table: string,
    where: Record<string, unknown> = {},
    orderBy = 'created_at',
    limit = 100
  ): Promise<T[]> {
    const keys = Object.keys(where)
    const conditions = keys.map((k, i) => `"${k}" = $${i + 1}`).join(' AND ')
    const params = [...Object.values(where), limit]
    const sql = `SELECT * FROM "${table}"${conditions ? ' WHERE ' + conditions : ''} ORDER BY "${orderBy}" DESC LIMIT $${params.length}`
    return db.query<T>(sql, params)
  },

  /**
   * Check if a row exists.
   */
  async exists(table: string, where: Record<string, unknown>): Promise<boolean> {
    const c = await db.count(table, where)
    return c > 0
  },

  /**
   * Delete rows matching conditions. Returns deleted count.
   */
  async deleteWhere(
    table: string,
    where: Record<string, unknown>
  ): Promise<number> {
    const keys = Object.keys(where)
    if (keys.length === 0) throw new Error('deleteWhere requires at least one condition')
    const conditions = keys.map((k, i) => `"${k}" = $${i + 1}`).join(' AND ')
    const sql = `DELETE FROM "${table}" WHERE ${conditions}`
    const result = await getPool().query(sql, Object.values(where))
    return result.rowCount ?? 0
  },

  /**
   * Close the pool. Call in global teardown.
   */
  async close(): Promise<void> {
    if (pool) {
      await pool.end()
      pool = null
    }
  },
}
