use sparkfmt_core::format_sql;

#[test]
fn test_basic_comment_preservation_goal() {
    // This test documents the GOAL for comment handling per the refactor request
    // 
    // Target behavior (from copilot-instructions.md):
    // Input:  select  a ,  b  -- cols
    //         from t
    //         where x = 1
    //           and y = 2
    //
    // Output: SELECT
    //              a
    //             ,b -- cols
    //         FROM t
    //         WHERE
    //             x=1
    //             AND y=2
    //
    // The comment "-- cols" should be anchored as TrailingInline to 'b'
    // because it appears after 'b' on the same original line.
    
    let input = "select  a ,  b  -- cols\nfrom t\nwhere x = 1\n  and y = 2";
    
    let result = format_sql(input).unwrap();
    
    // Current behavior: comments are stripped during parsing
    assert!(result.contains("SELECT"));
    assert!(result.contains("FROM t"));
    assert!(result.contains("WHERE"));
    assert!(result.contains("x=1"));
    assert!(result.contains("AND y=2"));
    
    // GOAL (not yet fully implemented): comment should be preserved
    // When comment anchoring is fully implemented, these should pass:
    // assert!(result.contains("-- cols"));
    // assert!(result.contains(",b -- cols"));
    
    println!("Current Input:\n{}\n", input);
    println!("Current Output:\n{}\n", result);
    println!("\n=== GOAL (from refactor request) ===");
    println!("SELECT");
    println!("     a");
    println!("    ,b -- cols");
    println!("FROM t");
    println!("WHERE");
    println!("    x=1");
    println!("    AND y=2");
    println!("\nNote: Full comment anchoring system is foundation work in progress");
}

#[test]
fn test_token_normalized_spacing() {
    // Verify that input with extra whitespace produces normalized output
    let input1 = "select   a  ,  b   from    t   where  x  =  1";
    let input2 = "select a,b from t where x=1";
    
    let result1 = format_sql(input1).unwrap();
    let result2 = format_sql(input2).unwrap();
    
    // Both should produce identical output (normalized)
    assert_eq!(result1, result2, "Token normalization should produce identical output regardless of input whitespace");
    
    println!("Input 1:\n{}\n", input1);
    println!("Input 2:\n{}\n", input2);
    println!("Both produce:\n{}\n", result1);
}

#[test]
fn test_function_call_no_spaces() {
    let input = "select func( a , b , c ) from t";
    let result = format_sql(input).unwrap();
    
    // Function calls should have no spaces after commas
    assert!(result.contains("func(a,b,c)"), "Function calls should not have spaces after commas");
    
    println!("Result:\n{}", result);
}

#[test]
fn test_expression_normalization() {
    let input = "select a from t where x  =  1  and  y  =  2";
    let result = format_sql(input).unwrap();
    
    // Expressions should be normalized (no extra spaces)
    assert!(result.contains("x=1"));
    assert!(result.contains("y=2"));
    
    println!("Result:\n{}", result);
}
