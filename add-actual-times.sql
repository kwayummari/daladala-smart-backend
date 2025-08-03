-- Add actual_start_time and actual_end_time columns to trips table
ALTER TABLE trips 
ADD COLUMN actual_start_time DATETIME NULL AFTER start_time,
ADD COLUMN actual_end_time DATETIME NULL AFTER end_time; 