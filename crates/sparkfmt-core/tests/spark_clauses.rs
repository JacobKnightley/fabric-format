/// Tests for Spark-specific query organization clauses
/// CLUSTER BY, DISTRIBUTE BY, SORT BY are Spark-specific
use sparkfmt_core::format_sql;

#[test]
fn test_cluster_by_single() {
    let input = "SELECT * FROM t CLUSTER BY a";
    let result = format_sql(input);
    assert!(result.is_ok(), "Failed to parse CLUSTER BY: {:?}", result.err());
    let formatted = result.unwrap();
    assert!(formatted.contains("CLUSTER BY"));
}

#[test]
fn test_cluster_by_multiple() {
    let input = "SELECT * FROM t CLUSTER BY a, b, c";
    let result = format_sql(input);
    assert!(result.is_ok(), "Failed to parse CLUSTER BY with multiple columns: {:?}", result.err());
}

#[test]
fn test_distribute_by_single() {
    let input = "SELECT * FROM t DISTRIBUTE BY a";
    let result = format_sql(input);
    assert!(result.is_ok(), "Failed to parse DISTRIBUTE BY: {:?}", result.err());
    let formatted = result.unwrap();
    assert!(formatted.contains("DISTRIBUTE BY"));
}

#[test]
fn test_distribute_by_multiple() {
    let input = "SELECT * FROM t DISTRIBUTE BY a, b";
    let result = format_sql(input);
    assert!(result.is_ok(), "Failed to parse DISTRIBUTE BY with multiple columns: {:?}", result.err());
}

#[test]
fn test_sort_by_single() {
    let input = "SELECT * FROM t SORT BY a";
    let result = format_sql(input);
    assert!(result.is_ok(), "Failed to parse SORT BY: {:?}", result.err());
    let formatted = result.unwrap();
    assert!(formatted.contains("SORT BY"));
}

#[test]
fn test_sort_by_multiple_with_directions() {
    let input = "SELECT * FROM t SORT BY a ASC, b DESC";
    let result = format_sql(input);
    assert!(result.is_ok(), "Failed to parse SORT BY with directions: {:?}", result.err());
}

#[test]
fn test_distribute_and_sort_by() {
    let input = "SELECT * FROM t DISTRIBUTE BY a SORT BY b";
    let result = format_sql(input);
    assert!(result.is_ok(), "Failed to parse DISTRIBUTE BY + SORT BY: {:?}", result.err());
}

#[test]
fn test_cluster_by_with_limit() {
    let input = "SELECT * FROM t CLUSTER BY a LIMIT 10";
    let result = format_sql(input);
    assert!(result.is_ok(), "Failed to parse CLUSTER BY with LIMIT: {:?}", result.err());
}

#[test]
fn test_order_by_vs_sort_by() {
    // ORDER BY and SORT BY should both work
    let input1 = "SELECT * FROM t ORDER BY a";
    let input2 = "SELECT * FROM t SORT BY a";
    assert!(format_sql(input1).is_ok());
    assert!(format_sql(input2).is_ok());
}

#[test]
fn test_except_set_operation() {
    let input = "SELECT a FROM t1 EXCEPT SELECT a FROM t2";
    let result = format_sql(input);
    assert!(result.is_ok(), "Failed to parse EXCEPT: {:?}", result.err());
    let formatted = result.unwrap();
    assert!(formatted.contains("EXCEPT"));
}

#[test]
fn test_intersect_set_operation() {
    let input = "SELECT a FROM t1 INTERSECT SELECT a FROM t2";
    let result = format_sql(input);
    assert!(result.is_ok(), "Failed to parse INTERSECT: {:?}", result.err());
    let formatted = result.unwrap();
    assert!(formatted.contains("INTERSECT"));
}

#[test]
fn test_minus_set_operation() {
    let input = "SELECT a FROM t1 MINUS SELECT a FROM t2";
    let result = format_sql(input);
    assert!(result.is_ok(), "Failed to parse MINUS: {:?}", result.err());
    let formatted = result.unwrap();
    // MINUS might be formatted as EXCEPT in some cases, but should parse
    assert!(formatted.contains("MINUS") || formatted.contains("EXCEPT"));
}

#[test]
fn test_set_operations_with_all() {
    let inputs = vec![
        "SELECT a FROM t1 EXCEPT ALL SELECT a FROM t2",
        "SELECT a FROM t1 INTERSECT ALL SELECT a FROM t2",
    ];
    
    for input in inputs {
        let result = format_sql(input);
        assert!(result.is_ok(), "Failed to parse {}: {:?}", input, result.err());
    }
}

#[test]
fn test_multiple_set_operations() {
    let input = "SELECT a FROM t1 UNION SELECT a FROM t2 INTERSECT SELECT a FROM t3";
    let result = format_sql(input);
    assert!(result.is_ok(), "Failed to parse multiple set operations: {:?}", result.err());
}
