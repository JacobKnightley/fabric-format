use sparkfmt_core::format_sql;

// Note: These tests document the DESIRED behavior for query hints and context-sensitive identifiers.
// Some tests are marked as #[ignore] because the features are not yet fully implemented.

// ============================================================================
// HINT TESTS (Aspirational - hints not yet parsed/formatted)
// ============================================================================

#[test]
#[ignore] // TODO: Hint parsing not yet implemented
fn test_simple_broadcast_hint() {
    let input = "select /*+ broadcast(t) */ * from t";
    let result = format_sql(input).unwrap();
    
    println!("Result:\n{}", result);
    
    // Hint name should be uppercase, table name preserved
    assert!(result.contains("/*+ BROADCAST(t) */"));
}

#[test]
#[ignore] // TODO: Hint parsing not yet implemented
fn test_shuffle_merge_hint() {
    let input = "select /*+ shuffle_merge(a, b) */ * from a join b on a.id = b.id";
    let result = format_sql(input).unwrap();
    
    println!("Result:\n{}", result);
    
    // Hint name uppercase, table names preserved, no spaces after commas
    assert!(result.contains("/*+ SHUFFLE_MERGE(a,b) */"));
}

#[test]
#[ignore] // TODO: Hint parsing not yet implemented
fn test_repartition_by_range_hint() {
    let input = "select /*+ repartition_by_range(10, col1) */ * from t";
    let result = format_sql(input).unwrap();
    
    println!("Result:\n{}", result);
    
    assert!(result.contains("/*+ REPARTITION_BY_RANGE(10,col1) */"));
}

#[test]
#[ignore] // TODO: Hint parsing not yet implemented
fn test_multiple_hints() {
    let input = "select /*+ broadcast(t1), merge(t2) */ * from t1, t2";
    let result = format_sql(input).unwrap();
    
    println!("Result:\n{}", result);
    
    assert!(result.contains("/*+ BROADCAST(t1),MERGE(t2) */"));
}

// ============================================================================
// CONTEXT-SENSITIVE IDENTIFIER TESTS (Aspirational - not yet implemented)
// ============================================================================

#[test]
#[ignore] // TODO: Context-sensitive casing not yet implemented
fn test_column_names_with_keyword_names() {
    // Columns named 'order', 'key', 'select' should preserve casing
    let input = "select order, key, select from value where group = 1";
    let result = format_sql(input).unwrap();
    
    println!("Result:\n{}", result);
    
    // Keywords in keyword positions should be uppercase
    assert!(result.contains("SELECT"));
    assert!(result.contains("FROM"));
    assert!(result.contains("WHERE"));
    
    // But identifiers with same names should preserve casing
    assert!(result.contains("order")); // column name
    assert!(result.contains("key")); // column name
    assert!(result.contains("select")); // column name  
    assert!(result.contains("value")); // table name
    assert!(result.contains("group")); // column name in WHERE
}

#[test]
#[ignore] // TODO: Context-sensitive casing not yet implemented
fn test_order_by_keyword_vs_column() {
    let input = "select * from t order by key";
    let result = format_sql(input).unwrap();
    
    println!("Result:\n{}", result);
    
    // ORDER BY are keywords and should be uppercase
    assert!(result.contains("ORDER BY"));
    
    // But 'key' is a column name and should preserve casing
    assert!(result.contains("key")); // column in ORDER BY
}

#[test]
#[ignore] // TODO: Context-sensitive casing not yet implemented
fn test_qualified_identifiers_preserve_casing() {
    let input = "select a.order, b.select, c.from from tables";
    let result = format_sql(input).unwrap();
    
    println!("Result:\n{}", result);
    
    // Qualified identifiers after dots should preserve casing
    assert!(result.contains("a.order"));
    assert!(result.contains("b.select"));
    assert!(result.contains("c.from"));
}

#[test]
#[ignore] // TODO: Context-sensitive casing not yet implemented
fn test_and_or_in_keyword_vs_column_context() {
    let input = "select and, or, not from t where x = 1 and y = 2";
    let result = format_sql(input).unwrap();
    
    println!("Result:\n{}", result);
    
    // 'and', 'or', 'not' as column names should preserve casing
    assert!(result.contains("and,"));
    assert!(result.contains("or,"));
    assert!(result.contains("not"));
    
    // But AND in WHERE clause should be uppercase
    assert!(result.contains("AND y"));
}

// ============================================================================
// CURRENT BEHAVIOR TESTS (What actually works now)
// ============================================================================

#[test]
fn test_current_keyword_uppercase_behavior() {
    // Test current behavior: keywords are always uppercased during lexing
    let input = "select a from t where x = 1 and y = 2";
    let result = format_sql(input).unwrap();
    
    println!("Result:\n{}", result);
    
    assert!(result.contains("SELECT"));
    assert!(result.contains("FROM"));
    assert!(result.contains("WHERE"));
    assert!(result.contains("AND"));
}

#[test]
fn test_current_function_uppercase_behavior() {
    // Test current behavior: built-in functions are uppercased
    let input = "select count(*), sum(x) from t";
    let result = format_sql(input).unwrap();
    
    println!("Result:\n{}", result);
    
    assert!(result.contains("COUNT(*)"));
    assert!(result.contains("SUM(x)"));
}

#[test]
fn test_current_identifier_preservation() {
    // Test current behavior: regular identifiers preserve casing
    let input = "select MyColumn, another_col from MyTable";
    let result = format_sql(input).unwrap();
    
    println!("Result:\n{}", result);
    
    assert!(result.contains("MyColumn"));
    assert!(result.contains("another_col"));
    assert!(result.contains("MyTable"));
}
