-- Multi-table JOIN queries

SELECT
    o.id AS order_id,
    o.order_date,
    c.name AS customer_name,
    c.email,
    p.name AS product_name,
    oi.quantity,
    oi.unit_price,
    oi.quantity * oi.unit_price AS line_total
FROM orders o
INNER JOIN customers c ON o.customer_id = c.id
INNER JOIN order_items oi ON o.id = oi.order_id
INNER JOIN products p ON oi.product_id = p.id
WHERE o.order_date >= '2024-01-01'
    AND o.status = 'completed'
    AND c.country = 'US'
ORDER BY o.order_date DESC, c.name ASC;

SELECT
    d.department_name,
    e.employee_name,
    e.hire_date,
    m.employee_name AS manager_name,
    l.city AS location
FROM employees e
LEFT JOIN employees m ON e.manager_id = m.employee_id
INNER JOIN departments d ON e.department_id = d.department_id
LEFT JOIN locations l ON d.location_id = l.location_id
WHERE e.status = 'active'
    AND d.department_name IN ('Engineering', 'Sales', 'Marketing')
ORDER BY d.department_name, e.employee_name;
