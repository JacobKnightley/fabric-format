-- Subquery examples

SELECT
    product_id,
    product_name,
    price,
    (SELECT AVG(price) FROM products) AS avg_price,
    price - (SELECT AVG(price) FROM products) AS price_diff
FROM products
WHERE price > (SELECT AVG(price) FROM products)
ORDER BY price DESC;

SELECT
    c.customer_id,
    c.name,
    c.email,
    (
        SELECT COUNT(*)
        FROM orders o
        WHERE o.customer_id = c.customer_id
    ) AS order_count,
    (
        SELECT SUM(total_amount)
        FROM orders o
        WHERE o.customer_id = c.customer_id
    ) AS total_spent
FROM customers c
WHERE EXISTS (
    SELECT 1
    FROM orders o
    WHERE o.customer_id = c.customer_id
        AND o.order_date >= '2024-01-01'
)
ORDER BY total_spent DESC;

SELECT *
FROM products p
WHERE p.category_id IN (
    SELECT category_id
    FROM categories
    WHERE parent_id IS NULL
        OR parent_id IN (
            SELECT category_id
            FROM categories
            WHERE name LIKE '%Electronics%'
        )
);
