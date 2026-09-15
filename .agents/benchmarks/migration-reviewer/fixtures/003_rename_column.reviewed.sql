-- 003_rename_column.sql — guarded rename (safe: conditional on column existing)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'users' AND column_name = 'name'
  ) THEN
    ALTER TABLE users RENAME COLUMN name TO full_name;
  END IF;
END
$$;
