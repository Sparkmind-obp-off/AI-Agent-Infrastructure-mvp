-- Execution requests retain bounded metadata, not raw CSV or provider credentials.
ALTER TABLE executions ADD COLUMN input_source TEXT;
ALTER TABLE executions ADD COLUMN input_bytes INTEGER;
ALTER TABLE executions ADD COLUMN error_class TEXT;
ALTER TABLE executions ADD COLUMN finished_at TEXT;
