-- 001_add_index.sql — additive migration (safe)
CREATE INDEX CONCURRENTLY idx_orders_created_at ON orders (created_at);
