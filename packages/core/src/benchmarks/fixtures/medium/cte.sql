-- Common Table Expression (CTE) queries

WITH monthly_sales AS (
    SELECT
        DATE_TRUNC('month', order_date) AS month,
        SUM(total_amount) AS revenue,
        COUNT(*) AS order_count
    FROM orders
    WHERE order_date >= '2024-01-01'
    GROUP BY DATE_TRUNC('month', order_date)
),
monthly_growth AS (
    SELECT
        month,
        revenue,
        order_count,
        LAG(revenue) OVER (ORDER BY month) AS prev_revenue,
        (revenue - LAG(revenue) OVER (ORDER BY month)) / LAG(revenue) OVER (ORDER BY month) * 100 AS growth_pct
    FROM monthly_sales
)
SELECT
    month,
    revenue,
    order_count,
    prev_revenue,
    ROUND(growth_pct, 2) AS growth_percentage
FROM monthly_growth
ORDER BY month;

WITH RECURSIVE category_tree AS (
    SELECT
        category_id,
        name,
        parent_id,
        1 AS level,
        CAST(name AS VARCHAR(1000)) AS path
    FROM categories
    WHERE parent_id IS NULL
    UNION ALL
    SELECT
        c.category_id,
        c.name,
        c.parent_id,
        ct.level + 1,
        CONCAT(ct.path, ' > ', c.name)
    FROM categories c
    INNER JOIN category_tree ct ON c.parent_id = ct.category_id
    WHERE ct.level < 5
)
SELECT *
FROM category_tree
ORDER BY path;

WITH customer_segments AS (
    SELECT
        customer_id,
        SUM(total_amount) AS lifetime_value,
        COUNT(*) AS order_count,
        MAX(order_date) AS last_order
    FROM orders
    GROUP BY customer_id
),
segmented AS (
    SELECT
        cs.*,
        CASE
            WHEN lifetime_value >= 10000 AND order_count >= 10 THEN 'VIP'
            WHEN lifetime_value >= 5000 OR order_count >= 5 THEN 'Regular'
            ELSE 'New'
        END AS segment
    FROM customer_segments cs
)
SELECT
    c.name,
    c.email,
    s.segment,
    s.lifetime_value,
    s.order_count,
    s.last_order
FROM segmented s
INNER JOIN customers c ON s.customer_id = c.customer_id
ORDER BY s.lifetime_value DESC;
