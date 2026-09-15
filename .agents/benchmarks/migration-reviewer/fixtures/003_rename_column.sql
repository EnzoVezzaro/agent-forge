-- 003_rename_column.sql — unguarded rename (unsafe: fails if column missing)
ALTER TABLE users RENAME COLUMN name TO full_name;
