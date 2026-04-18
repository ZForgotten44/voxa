// src/db/index.ts
import { Pool } from 'pg';
import { config } from '../config';

export const db = new Pool({ connectionString: config.db.url, ssl: { rejectUnauthorized: false } });

export async function query<T = any>(sql: string, params?: any[]): Promise<T[]> {
  const { rows } = await db.query(sql, params);
  return rows as T[];
}

export async function queryOne<T = any>(sql: string, params?: any[]): Promise<T | null> {
  const rows = await query<T>(sql, params);
  return rows[0] ?? null;
}
