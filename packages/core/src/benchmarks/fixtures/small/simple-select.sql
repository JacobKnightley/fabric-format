-- Simple SELECT queries (typical quick operations)

SELECT id, name, email FROM users WHERE active = true;

SELECT * FROM products ORDER BY created_at DESC LIMIT 10;

SELECT COUNT(*) AS total FROM orders WHERE status = 'completed';

SELECT DISTINCT category FROM products;

SELECT id, UPPER(name) as upper_name FROM customers WHERE id > 100;
