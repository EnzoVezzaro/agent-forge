-- 001_add_index.sql — additive migration (safe)
-- reviewed: non-destructive, safe to run online
CREATE INDEX CONCURRENTLY idx_orders_created_at ON orders (created_at);
