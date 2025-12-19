use sparkfmt_core::format_sql;

// Phase 1: Foundation tests

#[test]
fn test_unary_minus() {
    let input = "SELECT -x FROM t";
    let result = format_sql(input).unwrap();
    assert!(result.contains("-x"));
    println!("Result:\n{}", result);
}

#[test]
fn test_unary_plus() {
    let input = "SELECT +x FROM t";
    let result = format_sql(input).unwrap();
    assert!(result.contains("+x"));
    println!("Result:\n{}", result);
}

#[test]
fn test_unary_not() {
    let input = "SELECT NOT x FROM t";
    let result = format_sql(input).unwrap();
    assert!(result.contains("NOT x"));
    println!("Result:\n{}", result);
}

#[test]
fn test_unary_bitwise_not() {
    let input = "SELECT ~x FROM t";
    let result = format_sql(input).unwrap();
    assert!(result.contains("~x"));
    println!("Result:\n{}", result);
}

#[test]
fn test_unary_negative_literal() {
    let input = "SELECT -1 FROM t";
    let result = format_sql(input).unwrap();
    assert!(result.contains("-1"));
    println!("Result:\n{}", result);
}

#[test]
fn test_unary_in_binary_op() {
    let input = "SELECT a + -b FROM t";
    let result = format_sql(input).unwrap();
    assert!(result.contains("a+-b"));
    println!("Result:\n{}", result);
}

#[test]
fn test_quoted_identifier() {
    let input = "SELECT `my column` FROM t";
    let result = format_sql(input).unwrap();
    assert!(result.contains("`my column`"));
    println!("Result:\n{}", result);
}

#[test]
fn test_quoted_identifiers_multiple() {
    let input = "SELECT `select`, `from` FROM t";
    let result = format_sql(input).unwrap();
    assert!(result.contains("`select`"));
    assert!(result.contains("`from`"));
    println!("Result:\n{}", result);
}

#[test]
fn test_quoted_identifier_qualified() {
    let input = "SELECT t.`odd column` FROM t";
    let result = format_sql(input).unwrap();
    assert!(result.contains("t.`odd column`"));
    println!("Result:\n{}", result);
}

#[test]
fn test_array_access() {
    let input = "SELECT arr[0] FROM t";
    let result = format_sql(input).unwrap();
    assert!(result.contains("arr[0]"));
    println!("Result:\n{}", result);
}

#[test]
fn test_array_access_with_expression() {
    let input = "SELECT arr[i + 1] FROM t";
    let result = format_sql(input).unwrap();
    assert!(result.contains("arr[i+1]"));
    println!("Result:\n{}", result);
}

#[test]
fn test_array_access_with_string_key() {
    let input = "SELECT map_col['key'] FROM t";
    let result = format_sql(input).unwrap();
    assert!(result.contains("map_col['key']"));
    println!("Result:\n{}", result);
}

#[test]
fn test_array_access_nested() {
    let input = "SELECT arr[0][1] FROM t";
    let result = format_sql(input).unwrap();
    assert!(result.contains("arr[0][1]"));
    println!("Result:\n{}", result);
}

// Phase 2: Special Syntax Expression tests

#[test]
fn test_case_when_simple() {
    let input = "SELECT CASE WHEN x = 1 THEN 'a' ELSE 'b' END FROM t";
    let result = format_sql(input).unwrap();
    assert!(result.contains("CASE WHEN x=1 THEN 'a' ELSE 'b' END"));
    println!("Result:\n{}", result);
}

#[test]
fn test_case_when_multiple() {
    let input = "SELECT CASE WHEN x = 1 THEN 'a' WHEN x = 2 THEN 'b' ELSE 'c' END FROM t";
    let result = format_sql(input).unwrap();
    assert!(result.contains("CASE WHEN"));
    assert!(result.contains("THEN 'a'"));
    assert!(result.contains("THEN 'b'"));
    assert!(result.contains("ELSE 'c'"));
    println!("Result:\n{}", result);
}

#[test]
fn test_case_simple_form() {
    let input = "SELECT CASE x WHEN 1 THEN 'a' WHEN 2 THEN 'b' END FROM t";
    let result = format_sql(input).unwrap();
    assert!(result.contains("CASE x WHEN"));
    println!("Result:\n{}", result);
}

#[test]
fn test_case_with_alias() {
    let input = "SELECT CASE WHEN x = 1 THEN 'a' ELSE 'b' END AS result FROM t";
    let result = format_sql(input).unwrap();
    assert!(result.contains("AS result"));
    println!("Result:\n{}", result);
}

#[test]
fn test_cast_simple() {
    let input = "SELECT CAST(x AS STRING) FROM t";
    let result = format_sql(input).unwrap();
    assert!(result.contains("CAST(x AS STRING)"));
    println!("Result:\n{}", result);
}

#[test]
fn test_cast_decimal() {
    let input = "SELECT CAST(x AS DECIMAL(10,2)) FROM t";
    let result = format_sql(input).unwrap();
    assert!(result.contains("CAST(x AS DECIMAL(10,2))"));
    println!("Result:\n{}", result);
}

#[test]
fn test_cast_array() {
    let input = "SELECT CAST(x AS ARRAY<STRING>) FROM t";
    let result = format_sql(input).unwrap();
    assert!(result.contains("CAST(x AS ARRAY<STRING>)"));
    println!("Result:\n{}", result);
}

#[test]
fn test_cast_map() {
    let input = "SELECT CAST(x AS MAP<STRING,INT>) FROM t";
    let result = format_sql(input).unwrap();
    assert!(result.contains("CAST(x AS MAP<STRING,INT>)"));
    println!("Result:\n{}", result);
}

#[test]
fn test_is_null() {
    let input = "SELECT x FROM t WHERE x IS NULL";
    let result = format_sql(input).unwrap();
    assert!(result.contains("x IS NULL"));
    println!("Result:\n{}", result);
}

#[test]
fn test_is_not_null() {
    let input = "SELECT x FROM t WHERE x IS NOT NULL";
    let result = format_sql(input).unwrap();
    assert!(result.contains("x IS NOT NULL"));
    println!("Result:\n{}", result);
}

#[test]
fn test_between() {
    let input = "SELECT x FROM t WHERE x BETWEEN 1 AND 10";
    let result = format_sql(input).unwrap();
    assert!(result.contains("x BETWEEN 1 AND 10"));
    println!("Result:\n{}", result);
}

#[test]
fn test_not_between() {
    let input = "SELECT x FROM t WHERE x NOT BETWEEN 1 AND 10";
    let result = format_sql(input).unwrap();
    assert!(result.contains("x NOT BETWEEN 1 AND 10"));
    println!("Result:\n{}", result);
}

#[test]
fn test_between_dates() {
    let input = "SELECT x FROM t WHERE d BETWEEN '2024-01-01' AND '2024-12-31'";
    let result = format_sql(input).unwrap();
    assert!(result.contains("BETWEEN '2024-01-01' AND '2024-12-31'"));
    println!("Result:\n{}", result);
}

#[test]
fn test_in_list() {
    let input = "SELECT x FROM t WHERE x IN (1, 2, 3)";
    let result = format_sql(input).unwrap();
    assert!(result.contains("x IN (1,2,3)"));
    println!("Result:\n{}", result);
}

#[test]
fn test_not_in_list() {
    let input = "SELECT x FROM t WHERE x NOT IN (1, 2, 3)";
    let result = format_sql(input).unwrap();
    assert!(result.contains("x NOT IN (1,2,3)"));
    println!("Result:\n{}", result);
}

#[test]
fn test_in_subquery() {
    let input = "SELECT x FROM t WHERE x IN (SELECT y FROM s)";
    let result = format_sql(input).unwrap();
    assert!(result.contains("x IN (SELECT"));
    println!("Result:\n{}", result);
}

#[test]
fn test_like() {
    let input = "SELECT x FROM t WHERE x LIKE '%pattern%'";
    let result = format_sql(input).unwrap();
    assert!(result.contains("x LIKE '%pattern%'"));
    println!("Result:\n{}", result);
}

#[test]
fn test_not_like() {
    let input = "SELECT x FROM t WHERE x NOT LIKE '%pattern%'";
    let result = format_sql(input).unwrap();
    assert!(result.contains("x NOT LIKE '%pattern%'"));
    println!("Result:\n{}", result);
}

#[test]
fn test_like_escape() {
    let input = "SELECT x FROM t WHERE x LIKE '%10\\%%' ESCAPE '\\'";
    let result = format_sql(input).unwrap();
    assert!(result.contains("x LIKE"));
    assert!(result.contains("ESCAPE"));
    println!("Result:\n{}", result);
}

#[test]
fn test_rlike() {
    let input = "SELECT x FROM t WHERE x RLIKE '.*pattern.*'";
    let result = format_sql(input).unwrap();
    assert!(result.contains("x RLIKE '.*pattern.*'"));
    println!("Result:\n{}", result);
}

// Phase 3: Complex Features tests

#[test]
fn test_window_function_row_number() {
    let input = "SELECT ROW_NUMBER() OVER (PARTITION BY x ORDER BY y) FROM t";
    let result = format_sql(input).unwrap();
    assert!(result.contains("ROW_NUMBER() OVER (PARTITION BY x ORDER BY y)"));
    println!("Result:\n{}", result);
}

#[test]
fn test_window_function_rank() {
    let input = "SELECT RANK() OVER (ORDER BY x DESC) FROM t";
    let result = format_sql(input).unwrap();
    assert!(result.contains("RANK() OVER (ORDER BY x DESC)"));
    println!("Result:\n{}", result);
}

#[test]
fn test_window_function_with_frame() {
    let input = "SELECT SUM(x) OVER (PARTITION BY y ORDER BY z ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW) FROM t";
    let result = format_sql(input).unwrap();
    assert!(result.contains("SUM(x) OVER (PARTITION BY y ORDER BY z ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW)"));
    println!("Result:\n{}", result);
}

#[test]
fn test_window_function_lead() {
    let input = "SELECT LEAD(x, 1) OVER (ORDER BY y) FROM t";
    let result = format_sql(input).unwrap();
    assert!(result.contains("LEAD(x,1) OVER (ORDER BY y)"));
    println!("Result:\n{}", result);
}

#[test]
fn test_subquery_scalar() {
    let input = "SELECT (SELECT MAX(y) FROM s) FROM t";
    let result = format_sql(input).unwrap();
    assert!(result.contains("(SELECT"));
    assert!(result.contains("MAX(y)"));
    println!("Result:\n{}", result);
}

#[test]
fn test_subquery_with_alias() {
    let input = "SELECT (SELECT MAX(y) FROM s) AS max_val FROM t";
    let result = format_sql(input).unwrap();
    assert!(result.contains("(SELECT"));
    assert!(result.contains("AS max_val"));
    println!("Result:\n{}", result);
}

#[test]
fn test_exists() {
    let input = "SELECT x FROM t WHERE EXISTS (SELECT 1 FROM s WHERE s.id = t.id)";
    let result = format_sql(input).unwrap();
    assert!(result.contains("EXISTS (SELECT"));
    println!("Result:\n{}", result);
}

#[test]
fn test_not_exists() {
    let input = "SELECT x FROM t WHERE NOT EXISTS (SELECT 1 FROM s WHERE s.id = t.id)";
    let result = format_sql(input).unwrap();
    assert!(result.contains("NOT EXISTS (SELECT"));
    println!("Result:\n{}", result);
}

// Integration tests - Complex expressions

#[test]
fn test_complex_expression_mix() {
    let input = "SELECT CASE WHEN -x > 0 THEN CAST(arr[0] AS STRING) ELSE 'default' END FROM t";
    let result = format_sql(input).unwrap();
    assert!(result.contains("CASE WHEN"));
    assert!(result.contains("-x>0"));
    assert!(result.contains("CAST(arr[0] AS STRING)"));
    println!("Result:\n{}", result);
}

#[test]
fn test_function_scalability() {
    // Test that new/uncommon Spark functions work without code changes
    let input = "SELECT COALESCE(a, b), NVL(c, d), IFNULL(e, f) FROM t";
    let result = format_sql(input).unwrap();
    assert!(result.contains("COALESCE(a,b)"));
    assert!(result.contains("NVL(c,d)"));
    assert!(result.contains("IFNULL(e,f)"));
    println!("Result:\n{}", result);
}

#[test]
fn test_aggregate_functions() {
    let input = "SELECT SUM(x), AVG(y), MIN(z), MAX(w), COUNT(*) FROM t";
    let result = format_sql(input).unwrap();
    assert!(result.contains("SUM(x)"));
    assert!(result.contains("AVG(y)"));
    assert!(result.contains("MIN(z)"));
    assert!(result.contains("MAX(w)"));
    assert!(result.contains("COUNT(*)"));
    println!("Result:\n{}", result);
}

#[test]
fn test_string_functions() {
    let input = "SELECT CONCAT(a, b, c), SUBSTRING(s, 1, 5), UPPER(t) FROM x";
    let result = format_sql(input).unwrap();
    assert!(result.contains("CONCAT(a,b,c)"));
    assert!(result.contains("SUBSTRING(s,1,5)"));
    assert!(result.contains("UPPER(t)"));
    println!("Result:\n{}", result);
}

#[test]
fn test_date_functions() {
    let input = "SELECT DATE_ADD(d, 1), DATEDIFF(a, b), CURRENT_DATE(), YEAR(x) FROM t";
    let result = format_sql(input).unwrap();
    assert!(result.contains("DATE_ADD(d,1)"));
    assert!(result.contains("DATEDIFF(a,b)"));
    assert!(result.contains("CURRENT_DATE()"));
    assert!(result.contains("YEAR(x)"));
    println!("Result:\n{}", result);
}
