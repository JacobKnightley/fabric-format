-- Simple INSERT statements

INSERT INTO users (name, email) VALUES ('John Doe', 'john@example.com');

INSERT INTO logs (level, message, timestamp) VALUES ('INFO', 'Application started', CURRENT_TIMESTAMP);

INSERT INTO metrics (name, value) SELECT name, count(*) FROM events GROUP BY name;
