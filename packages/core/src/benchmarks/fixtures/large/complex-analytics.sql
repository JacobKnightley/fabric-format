-- Complex analytics query with multiple CTEs, joins, window functions

WITH date_spine AS (
    -- Generate date range for analysis
    SELECT EXPLODE(SEQUENCE(DATE '2023-01-01', DATE '2024-12-31', INTERVAL 1 DAY)) AS date_day
),
daily_orders AS (
    -- Aggregate daily order metrics
    SELECT
        DATE(o.order_date) AS order_day,
        o.store_id,
        s.region,
        s.store_name,
        COUNT(DISTINCT o.order_id) AS order_count,
        COUNT(DISTINCT o.customer_id) AS unique_customers,
        SUM(oi.quantity) AS total_items,
        SUM(oi.quantity * oi.unit_price) AS gross_revenue,
        SUM(oi.discount_amount) AS total_discounts,
        SUM(oi.quantity * oi.unit_price - oi.discount_amount) AS net_revenue
    FROM orders o
    INNER JOIN order_items oi ON o.order_id = oi.order_id
    INNER JOIN stores s ON o.store_id = s.store_id
    WHERE o.order_date >= '2023-01-01'
        AND o.order_date < '2025-01-01'
        AND o.status IN ('completed', 'shipped', 'delivered')
    GROUP BY DATE(o.order_date), o.store_id, s.region, s.store_name
),
filled_daily AS (
    -- Fill in missing days with zeros
    SELECT
        ds.date_day AS order_day,
        st.store_id,
        st.region,
        st.store_name,
        COALESCE(do.order_count, 0) AS order_count,
        COALESCE(do.unique_customers, 0) AS unique_customers,
        COALESCE(do.total_items, 0) AS total_items,
        COALESCE(do.gross_revenue, 0) AS gross_revenue,
        COALESCE(do.total_discounts, 0) AS total_discounts,
        COALESCE(do.net_revenue, 0) AS net_revenue
    FROM date_spine ds
    CROSS JOIN (SELECT DISTINCT store_id, region, store_name FROM daily_orders) st
    LEFT JOIN daily_orders do ON ds.date_day = do.order_day AND st.store_id = do.store_id
),
weekly_metrics AS (
    -- Aggregate to weekly level with running metrics
    SELECT
        DATE_TRUNC('week', order_day) AS week_start,
        store_id,
        region,
        store_name,
        SUM(order_count) AS weekly_orders,
        SUM(unique_customers) AS weekly_customers,
        SUM(total_items) AS weekly_items,
        SUM(net_revenue) AS weekly_revenue,
        AVG(net_revenue) OVER (
            PARTITION BY store_id
            ORDER BY DATE_TRUNC('week', order_day)
            ROWS BETWEEN 3 PRECEDING AND CURRENT ROW
        ) AS rolling_4wk_avg,
        SUM(net_revenue) OVER (
            PARTITION BY store_id
            ORDER BY DATE_TRUNC('week', order_day)
            ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
        ) AS ytd_revenue,
        ROW_NUMBER() OVER (
            PARTITION BY region
            ORDER BY SUM(net_revenue) DESC
        ) AS region_rank
    FROM filled_daily
    GROUP BY DATE_TRUNC('week', order_day), store_id, region, store_name
),
store_segments AS (
    -- Segment stores based on performance
    SELECT
        store_id,
        store_name,
        region,
        SUM(weekly_revenue) AS total_revenue,
        AVG(weekly_revenue) AS avg_weekly_revenue,
        STDDEV(weekly_revenue) AS revenue_stddev,
        MIN(weekly_revenue) AS min_weekly_revenue,
        MAX(weekly_revenue) AS max_weekly_revenue,
        PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY weekly_revenue) AS median_revenue,
        CASE
            WHEN AVG(weekly_revenue) >= (
                SELECT PERCENTILE_CONT(0.9) WITHIN GROUP (ORDER BY avg_rev)
                FROM (SELECT AVG(weekly_revenue) AS avg_rev FROM weekly_metrics GROUP BY store_id)
            ) THEN 'Top Performer'
            WHEN AVG(weekly_revenue) >= (
                SELECT PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY avg_rev)
                FROM (SELECT AVG(weekly_revenue) AS avg_rev FROM weekly_metrics GROUP BY store_id)
            ) THEN 'Above Average'
            WHEN AVG(weekly_revenue) >= (
                SELECT PERCENTILE_CONT(0.25) WITHIN GROUP (ORDER BY avg_rev)
                FROM (SELECT AVG(weekly_revenue) AS avg_rev FROM weekly_metrics GROUP BY store_id)
            ) THEN 'Below Average'
            ELSE 'Underperformer'
        END AS performance_segment
    FROM weekly_metrics
    GROUP BY store_id, store_name, region
),
yoy_comparison AS (
    -- Year over year comparison
    SELECT
        YEAR(wm.week_start) AS year,
        WEEKOFYEAR(wm.week_start) AS week_num,
        wm.region,
        SUM(wm.weekly_revenue) AS revenue,
        LAG(SUM(wm.weekly_revenue)) OVER (
            PARTITION BY wm.region, WEEKOFYEAR(wm.week_start)
            ORDER BY YEAR(wm.week_start)
        ) AS prev_year_revenue
    FROM weekly_metrics wm
    GROUP BY YEAR(wm.week_start), WEEKOFYEAR(wm.week_start), wm.region
)
SELECT
    wm.week_start,
    wm.store_id,
    wm.store_name,
    wm.region,
    wm.weekly_orders,
    wm.weekly_customers,
    wm.weekly_items,
    wm.weekly_revenue,
    wm.rolling_4wk_avg,
    wm.ytd_revenue,
    wm.region_rank,
    ss.performance_segment,
    ss.avg_weekly_revenue AS segment_avg,
    ss.revenue_stddev AS segment_stddev,
    wm.weekly_revenue / NULLIF(ss.avg_weekly_revenue, 0) AS performance_index,
    yoy.prev_year_revenue,
    (wm.weekly_revenue - COALESCE(yoy.prev_year_revenue, 0)) / NULLIF(yoy.prev_year_revenue, 0) * 100 AS yoy_growth_pct
FROM weekly_metrics wm
INNER JOIN store_segments ss ON wm.store_id = ss.store_id
LEFT JOIN yoy_comparison yoy ON YEAR(wm.week_start) = yoy.year
    AND WEEKOFYEAR(wm.week_start) = yoy.week_num
    AND wm.region = yoy.region
WHERE wm.week_start >= '2024-01-01'
ORDER BY wm.region, wm.weekly_revenue DESC, wm.week_start;
