-- Data warehouse ETL transformation

-- Create dimension table
CREATE TABLE IF NOT EXISTS dim_customer (
    customer_key BIGINT GENERATED ALWAYS AS IDENTITY,
    customer_id STRING NOT NULL,
    customer_name STRING,
    email STRING,
    phone STRING,
    address_line1 STRING,
    address_line2 STRING,
    city STRING,
    state STRING,
    postal_code STRING,
    country STRING,
    customer_type STRING,
    created_date DATE,
    modified_date TIMESTAMP,
    is_active BOOLEAN DEFAULT TRUE,
    valid_from TIMESTAMP,
    valid_to TIMESTAMP,
    is_current BOOLEAN
)
USING DELTA
PARTITIONED BY (country)
TBLPROPERTIES (
    'delta.autoOptimize.optimizeWrite' = 'true',
    'delta.autoOptimize.autoCompact' = 'true'
);

-- Create fact table
CREATE TABLE IF NOT EXISTS fact_sales (
    sale_key BIGINT GENERATED ALWAYS AS IDENTITY,
    sale_id STRING NOT NULL,
    customer_key BIGINT NOT NULL,
    product_key BIGINT NOT NULL,
    store_key BIGINT NOT NULL,
    date_key INT NOT NULL,
    time_key INT,
    quantity INT,
    unit_price DECIMAL(18, 4),
    discount_percent DECIMAL(5, 2),
    discount_amount DECIMAL(18, 4),
    tax_amount DECIMAL(18, 4),
    gross_amount DECIMAL(18, 4),
    net_amount DECIMAL(18, 4),
    cost_amount DECIMAL(18, 4),
    profit_amount DECIMAL(18, 4),
    currency_code STRING,
    exchange_rate DECIMAL(18, 6),
    etl_batch_id STRING,
    etl_load_timestamp TIMESTAMP
)
USING DELTA
PARTITIONED BY (date_key)
TBLPROPERTIES (
    'delta.autoOptimize.optimizeWrite' = 'true',
    'delta.autoOptimize.autoCompact' = 'true'
);

-- Merge new/updated customers (SCD Type 2)
MERGE INTO dim_customer AS target
USING (
    SELECT
        s.customer_id,
        s.customer_name,
        s.email,
        s.phone,
        s.address_line1,
        s.address_line2,
        s.city,
        s.state,
        s.postal_code,
        s.country,
        s.customer_type,
        s.created_date,
        s.modified_date,
        s.is_active,
        CURRENT_TIMESTAMP() AS valid_from,
        CAST('9999-12-31 23:59:59' AS TIMESTAMP) AS valid_to,
        TRUE AS is_current,
        MD5(CONCAT_WS('|',
            COALESCE(s.customer_name, ''),
            COALESCE(s.email, ''),
            COALESCE(s.phone, ''),
            COALESCE(s.address_line1, ''),
            COALESCE(s.city, ''),
            COALESCE(s.state, ''),
            COALESCE(s.postal_code, ''),
            COALESCE(s.country, ''),
            COALESCE(s.customer_type, '')
        )) AS row_hash
    FROM staging_customers s
    WHERE s.modified_date >= (SELECT COALESCE(MAX(modified_date), '1900-01-01') FROM dim_customer)
) AS source
ON target.customer_id = source.customer_id AND target.is_current = TRUE
WHEN MATCHED AND MD5(CONCAT_WS('|',
    COALESCE(target.customer_name, ''),
    COALESCE(target.email, ''),
    COALESCE(target.phone, ''),
    COALESCE(target.address_line1, ''),
    COALESCE(target.city, ''),
    COALESCE(target.state, ''),
    COALESCE(target.postal_code, ''),
    COALESCE(target.country, ''),
    COALESCE(target.customer_type, '')
)) <> source.row_hash THEN
    UPDATE SET
        target.valid_to = CURRENT_TIMESTAMP(),
        target.is_current = FALSE
WHEN NOT MATCHED THEN
    INSERT (
        customer_id,
        customer_name,
        email,
        phone,
        address_line1,
        address_line2,
        city,
        state,
        postal_code,
        country,
        customer_type,
        created_date,
        modified_date,
        is_active,
        valid_from,
        valid_to,
        is_current
    )
    VALUES (
        source.customer_id,
        source.customer_name,
        source.email,
        source.phone,
        source.address_line1,
        source.address_line2,
        source.city,
        source.state,
        source.postal_code,
        source.country,
        source.customer_type,
        source.created_date,
        source.modified_date,
        source.is_active,
        source.valid_from,
        source.valid_to,
        source.is_current
    );

-- Insert new versions for updated records
INSERT INTO dim_customer (
    customer_id,
    customer_name,
    email,
    phone,
    address_line1,
    address_line2,
    city,
    state,
    postal_code,
    country,
    customer_type,
    created_date,
    modified_date,
    is_active,
    valid_from,
    valid_to,
    is_current
)
SELECT
    s.customer_id,
    s.customer_name,
    s.email,
    s.phone,
    s.address_line1,
    s.address_line2,
    s.city,
    s.state,
    s.postal_code,
    s.country,
    s.customer_type,
    t.created_date,
    s.modified_date,
    s.is_active,
    CURRENT_TIMESTAMP(),
    CAST('9999-12-31 23:59:59' AS TIMESTAMP),
    TRUE
FROM staging_customers s
INNER JOIN dim_customer t ON s.customer_id = t.customer_id
WHERE t.is_current = FALSE
    AND t.valid_to >= DATE_SUB(CURRENT_TIMESTAMP(), 1);
