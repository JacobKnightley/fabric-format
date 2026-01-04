-- Simple UPDATE and DELETE statements

UPDATE users SET last_login = CURRENT_TIMESTAMP WHERE id = 123;

UPDATE products SET price = price * 1.1 WHERE category = 'electronics';

DELETE FROM sessions WHERE expires_at < CURRENT_TIMESTAMP;

DELETE FROM temp_data WHERE created_at < DATE_SUB(CURRENT_DATE, 7);
