-- Custom SQL migration file, put your code below! --

-- Vector similarity index, created after the initial data load (HNSW
-- doesn't need pre-existing data the way IVFFlat benefits from it, but
-- indexing after a bulk load avoids per-row index-maintenance overhead
-- during ingestion). cosine ops to match the `1 - (a <=> b)` similarity
-- calculation in src/semantic-search.ts.
CREATE INDEX IF NOT EXISTS verses_embedding_hnsw_idx
  ON verses USING hnsw (embedding vector_cosine_ops);
