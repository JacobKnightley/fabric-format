-- Window functions examples

SELECT
    employee_id,
    department_id,
    salary,
    ROW_NUMBER() OVER (PARTITION BY department_id ORDER BY salary DESC) AS dept_rank,
    DENSE_RANK() OVER (ORDER BY salary DESC) AS company_rank,
    SUM(salary) OVER (PARTITION BY department_id) AS dept_total,
    AVG(salary) OVER (PARTITION BY department_id) AS dept_avg,
    salary - AVG(salary) OVER (PARTITION BY department_id) AS diff_from_avg
FROM employees
WHERE status = 'active';

SELECT
    order_date,
    product_id,
    quantity,
    SUM(quantity) OVER (PARTITION BY product_id ORDER BY order_date ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW) AS running_total,
    AVG(quantity) OVER (PARTITION BY product_id ORDER BY order_date ROWS BETWEEN 6 PRECEDING AND CURRENT ROW) AS moving_avg_7d,
    FIRST_VALUE(quantity) OVER (PARTITION BY product_id ORDER BY order_date) AS first_qty,
    LAST_VALUE(quantity) OVER (PARTITION BY product_id ORDER BY order_date ROWS BETWEEN UNBOUNDED PRECEDING AND UNBOUNDED FOLLOWING) AS last_qty,
    LAG(quantity, 1, 0) OVER (PARTITION BY product_id ORDER BY order_date) AS prev_qty,
    LEAD(quantity, 1, 0) OVER (PARTITION BY product_id ORDER BY order_date) AS next_qty
FROM order_items
WHERE order_date >= '2024-01-01';

SELECT
    category,
    product_name,
    revenue,
    NTILE(4) OVER (PARTITION BY category ORDER BY revenue DESC) AS quartile,
    PERCENT_RANK() OVER (PARTITION BY category ORDER BY revenue) AS pct_rank,
    CUME_DIST() OVER (PARTITION BY category ORDER BY revenue) AS cume_dist
FROM (
    SELECT
        p.category,
        p.name AS product_name,
        SUM(oi.quantity * oi.unit_price) AS revenue
    FROM products p
    INNER JOIN order_items oi ON p.id = oi.product_id
    GROUP BY p.category, p.name
) product_revenue;
