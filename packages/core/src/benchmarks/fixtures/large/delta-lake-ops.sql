-- Delta Lake operations and maintenance

-- OPTIMIZE with Z-ORDER
OPTIMIZE delta.`/mnt/data/warehouse/fact_sales`
ZORDER BY (date_key, customer_key);

-- VACUUM to clean up old files
VACUUM delta.`/mnt/data/warehouse/fact_sales` RETAIN 168 HOURS;

-- DESCRIBE HISTORY
DESCRIBE HISTORY delta.`/mnt/data/warehouse/fact_sales` LIMIT 100;

-- Time travel query
SELECT
    sale_date,
    product_category,
    SUM(net_amount) AS total_sales,
    COUNT(*) AS transaction_count
FROM delta.`/mnt/data/warehouse/fact_sales` VERSION AS OF 150
WHERE sale_date >= '2024-01-01'
GROUP BY sale_date, product_category
ORDER BY sale_date, total_sales DESC;

-- Compare current vs historical snapshot
SELECT
    'current' AS snapshot_type,
    COUNT(*) AS row_count,
    SUM(net_amount) AS total_sales
FROM delta.`/mnt/data/warehouse/fact_sales`
WHERE date_key >= 20240101
UNION ALL
SELECT
    'historical' AS snapshot_type,
    COUNT(*) AS row_count,
    SUM(net_amount) AS total_sales
FROM delta.`/mnt/data/warehouse/fact_sales` TIMESTAMP AS OF '2024-06-01'
WHERE date_key >= 20240101;

-- Create table with generated columns
CREATE TABLE IF NOT EXISTS events_processed (
    event_id STRING,
    event_timestamp TIMESTAMP,
    event_date DATE GENERATED ALWAYS AS (CAST(event_timestamp AS DATE)),
    event_hour INT GENERATED ALWAYS AS (HOUR(event_timestamp)),
    event_type STRING,
    user_id STRING,
    session_id STRING,
    page_url STRING,
    referrer_url STRING,
    user_agent STRING,
    ip_address STRING,
    country STRING,
    city STRING,
    device_type STRING,
    browser STRING,
    os STRING,
    properties MAP<STRING, STRING>,
    metrics MAP<STRING, DOUBLE>,
    _rescued_data STRING
)
USING DELTA
PARTITIONED BY (event_date)
TBLPROPERTIES (
    'delta.autoOptimize.optimizeWrite' = 'true',
    'delta.autoOptimize.autoCompact' = 'true',
    'delta.minReaderVersion' = '2',
    'delta.minWriterVersion' = '5',
    'delta.columnMapping.mode' = 'name'
);

-- MERGE with complex matching and multiple actions
MERGE INTO events_processed AS target
USING (
    SELECT
        event_id,
        event_timestamp,
        event_type,
        user_id,
        session_id,
        page_url,
        referrer_url,
        user_agent,
        ip_address,
        geo.country AS country,
        geo.city AS city,
        CASE
            WHEN LOWER(user_agent) LIKE '%mobile%' THEN 'mobile'
            WHEN LOWER(user_agent) LIKE '%tablet%' THEN 'tablet'
            ELSE 'desktop'
        END AS device_type,
        CASE
            WHEN LOWER(user_agent) LIKE '%chrome%' THEN 'Chrome'
            WHEN LOWER(user_agent) LIKE '%firefox%' THEN 'Firefox'
            WHEN LOWER(user_agent) LIKE '%safari%' THEN 'Safari'
            WHEN LOWER(user_agent) LIKE '%edge%' THEN 'Edge'
            ELSE 'Other'
        END AS browser,
        CASE
            WHEN LOWER(user_agent) LIKE '%windows%' THEN 'Windows'
            WHEN LOWER(user_agent) LIKE '%mac%' THEN 'MacOS'
            WHEN LOWER(user_agent) LIKE '%linux%' THEN 'Linux'
            WHEN LOWER(user_agent) LIKE '%android%' THEN 'Android'
            WHEN LOWER(user_agent) LIKE '%ios%' THEN 'iOS'
            ELSE 'Other'
        END AS os,
        properties,
        metrics,
        _rescued_data
    FROM staging_events s
    LEFT JOIN ip_geolocation geo ON s.ip_address = geo.ip_range_start
    WHERE s.event_timestamp >= CURRENT_TIMESTAMP() - INTERVAL 1 HOUR
) AS source
ON target.event_id = source.event_id
WHEN MATCHED AND target.event_timestamp < source.event_timestamp THEN
    UPDATE SET
        target.event_timestamp = source.event_timestamp,
        target.event_type = source.event_type,
        target.properties = source.properties,
        target.metrics = source.metrics
WHEN NOT MATCHED THEN
    INSERT *
WHEN NOT MATCHED BY SOURCE AND target.event_date < CURRENT_DATE() - INTERVAL 90 DAYS THEN
    DELETE;

-- Schema evolution - add column
ALTER TABLE events_processed ADD COLUMN conversion_value DOUBLE AFTER metrics;

-- Change Data Feed query
SELECT
    _change_type,
    _commit_version,
    _commit_timestamp,
    event_id,
    event_type,
    user_id
FROM table_changes('events_processed', 100, 150)
WHERE _change_type IN ('insert', 'update_postimage')
ORDER BY _commit_timestamp;
