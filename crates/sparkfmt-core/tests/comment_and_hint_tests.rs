use sparkfmt_core::format_sql;

#[test]
fn test_trailing_inline_comment_on_select_item() {
    let input = "select a, b -- cols\nfrom t";
    let result = format_sql(input).unwrap();
    
    // Comment should be preserved as trailing inline on 'b'
    // NOTE: This is partially implemented - currently comments are collected but not
    // properly anchored to trailing positions. Leading comments work correctly.
    assert!(result.contains("-- cols"), "Comment should be preserved");
    assert!(result.contains(",b -- cols"), "Comment should be on same line as b");
    
    println!("Input:\n{}\n", input);
    println!("Output:\n{}\n", result);
}

#[test]
fn test_block_comment_before_select() {
    let input = "/* Query to get data */ select a from t";
    let result = format_sql(input).unwrap();
    
    // Block comment should be preserved as leading comment
    assert!(result.contains("/* Query to get data */"), "Block comment should be preserved");
    
    println!("Input:\n{}\n", input);
    println!("Output:\n{}\n", result);
}

#[test]
fn test_line_comment_before_select() {
    let input = "-- Get all records\nselect a from t";
    let result = format_sql(input).unwrap();
    
    // Line comment should be preserved as leading comment
    assert!(result.contains("-- Get all records"), "Line comment should be preserved");
    
    println!("Input:\n{}\n", input);
    println!("Output:\n{}\n", result);
}

#[test]
fn test_hint_comment_broadcast() {
    let input = "select /*+ broadcast(t) */ * from t";
    let result = format_sql(input).unwrap();
    
    // Hint should be formatted with uppercase hint name
    assert!(result.contains("/*+ BROADCAST(t) */"), "Hint should be formatted with uppercase hint name");
    
    println!("Input:\n{}\n", input);
    println!("Output:\n{}\n", result);
}

#[test]
fn test_hint_comment_shuffle_merge() {
    let input = "select /*+ shuffle_merge(a, b) */ * from t";
    let result = format_sql(input).unwrap();
    
    // Hint should be formatted with uppercase hint name and no spaces after commas
    assert!(result.contains("/*+ SHUFFLE_MERGE(a,b) */"), "Hint should be formatted correctly");
    
    println!("Input:\n{}\n", input);
    println!("Output:\n{}\n", result);
}

#[test]
fn test_hint_comment_repartition() {
    let input = "select /*+ repartition(10) */ * from t";
    let result = format_sql(input).unwrap();
    
    // Hint should be formatted with uppercase hint name
    assert!(result.contains("/*+ REPARTITION(10) */"), "Hint should be formatted correctly");
    
    println!("Input:\n{}\n", input);
    println!("Output:\n{}\n", result);
}

#[test]
fn test_multiple_hints() {
    let input = "select /*+ broadcast(t1), merge(t2) */ * from t";
    let result = format_sql(input).unwrap();
    
    // Multiple hints should be formatted with uppercase hint names
    assert!(result.contains("/*+ BROADCAST(t1),MERGE(t2) */"), "Multiple hints should be formatted correctly");
    
    println!("Input:\n{}\n", input);
    println!("Output:\n{}\n", result);
}

#[test]
fn test_hint_preserves_table_name_casing() {
    let input = "select /*+ broadcast(MyTable) */ * from MyTable";
    let result = format_sql(input).unwrap();
    
    // Hint name should be uppercase, but table name casing preserved
    assert!(result.contains("/*+ BROADCAST(MyTable) */"), "Hint should preserve table name casing");
    
    println!("Input:\n{}\n", input);
    println!("Output:\n{}\n", result);
}

#[test]
fn test_multiple_trailing_comments() {
    let input = "select a, b -- first cols\n, c -- another col\nfrom t";
    let result = format_sql(input).unwrap();
    
    // Both comments should be preserved
    assert!(result.contains("-- first cols"), "First comment should be preserved");
    assert!(result.contains("-- another col"), "Second comment should be preserved");
    
    println!("Input:\n{}\n", input);
    println!("Output:\n{}\n", result);
}

#[test]
fn test_comment_and_hint_together() {
    let input = "-- Main query\nselect /*+ broadcast(t) */ a, b -- columns\nfrom t";
    let result = format_sql(input).unwrap();
    
    // All comments and hints should be preserved
    assert!(result.contains("-- Main query"), "Leading comment should be preserved");
    assert!(result.contains("/*+ BROADCAST(t) */"), "Hint should be formatted");
    assert!(result.contains("-- columns"), "Trailing comment should be preserved");
    
    println!("Input:\n{}\n", input);
    println!("Output:\n{}\n", result);
}

#[test]
fn test_acceptance_example_with_comment() {
    // This is the acceptance example from copilot-instructions.md
    let input = "select  a ,  b  -- cols\nfrom t\nwhere x = 1\n  and y = 2";
    let result = format_sql(input).unwrap();
    
    // Output should match the specification
    assert!(result.contains("SELECT"));
    assert!(result.contains("     a"));
    assert!(result.contains(",b -- cols"));
    assert!(result.contains("FROM t"));
    assert!(result.contains("WHERE"));
    assert!(result.contains("    x=1"));
    assert!(result.contains("    AND y=2"));
    
    println!("=== Acceptance Example with Comment ===");
    println!("Input:\n{}\n", input);
    println!("Output:\n{}\n", result);
    println!("\nExpected (from copilot-instructions.md):");
    println!("SELECT");
    println!("     a");
    println!("    ,b -- cols");
    println!("FROM t");
    println!("WHERE");
    println!("    x=1");
    println!("    AND y=2");
}

#[test]
fn test_idempotence_with_comments() {
    let input = "select a, b -- comment\nfrom t";
    let result1 = format_sql(input).unwrap();
    let result2 = format_sql(&result1).unwrap();
    
    // Formatting should be idempotent
    assert_eq!(result1, result2, "Formatting with comments should be idempotent");
    
    println!("Input:\n{}\n", input);
    println!("First format:\n{}\n", result1);
    println!("Second format:\n{}\n", result2);
}

#[test]
fn test_idempotence_with_hints() {
    let input = "select /*+ broadcast(t) */ * from t";
    let result1 = format_sql(input).unwrap();
    let result2 = format_sql(&result1).unwrap();
    
    // Formatting should be idempotent
    assert_eq!(result1, result2, "Formatting with hints should be idempotent");
    
    println!("Input:\n{}\n", input);
    println!("First format:\n{}\n", result1);
    println!("Second format:\n{}\n", result2);
}
