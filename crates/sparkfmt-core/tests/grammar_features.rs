/// Tests for grammar-driven features
/// Verifies that all operators and literals from the grammar are correctly parsed
use sparkfmt_core::format_sql;

#[test]
fn test_null_safe_equal_operator() {
    let input = "SELECT a <=> b FROM t";
    let result = format_sql(input).unwrap();
    assert!(result.contains("<=>"));
}

#[test]
fn test_double_colon_cast_operator() {
    let input = "SELECT a::INT FROM t";
    let result = format_sql(input).unwrap();
    assert!(result.contains("::"));
}

#[test]
fn test_arrow_operator() {
    let input = "SELECT a->b FROM t";
    let result = format_sql(input).unwrap();
    assert!(result.contains("->"));
}

#[test]
fn test_fat_arrow_operator() {
    let input = "SELECT func(a => 1) FROM t";
    let result = format_sql(input).unwrap();
    assert!(result.contains("=>"));
}

#[test]
fn test_concat_pipe_operator() {
    let input = "SELECT a || b FROM t";
    let result = format_sql(input).unwrap();
    assert!(result.contains("||"));
}

#[test]
fn test_pipe_operator() {
    let input = "SELECT a |> b FROM t";
    let result = format_sql(input).unwrap();
    assert!(result.contains("|>"));
}

#[test]
fn test_shift_operators() {
    let input = "SELECT a << 1, b >> 2, c >>> 3 FROM t";
    let result = format_sql(input).unwrap();
    assert!(result.contains("<<"));
    assert!(result.contains(">>"));
    assert!(result.contains(">>>"));
}

#[test]
fn test_scientific_notation_numbers() {
    let input = "SELECT 1.5e10, 2E-5, 3.14e+2 FROM t";
    let result = format_sql(input).unwrap();
    assert!(result.contains("1.5e10"));
    assert!(result.contains("2E-5"));
    assert!(result.contains("3.14e+2"));
}

#[test]
fn test_bigint_literal() {
    let input = "SELECT 100L FROM t";
    let result = format_sql(input).unwrap();
    assert!(result.contains("100L"));
}

#[test]
fn test_smallint_literal() {
    let input = "SELECT 50S FROM t";
    let result = format_sql(input).unwrap();
    assert!(result.contains("50S"));
}

#[test]
fn test_tinyint_literal() {
    let input = "SELECT 10Y FROM t";
    let result = format_sql(input).unwrap();
    assert!(result.contains("10Y"));
}

#[test]
fn test_float_literal() {
    let input = "SELECT 3.14F FROM t";
    let result = format_sql(input).unwrap();
    assert!(result.contains("3.14F"));
}

#[test]
fn test_double_literal() {
    let input = "SELECT 2.718D FROM t";
    let result = format_sql(input).unwrap();
    assert!(result.contains("2.718D"));
}

#[test]
fn test_bigdecimal_literal() {
    let input = "SELECT 99.99BD FROM t";
    let result = format_sql(input).unwrap();
    assert!(result.contains("99.99BD"));
}

#[test]
fn test_hex_binary_literal() {
    let input = "SELECT X'1F2A' FROM t";
    let result = format_sql(input).unwrap();
    assert!(result.contains("X'1F2A'") || result.contains("x'1F2A'"));
}

#[test]
fn test_all_comparison_operators() {
    let input = "SELECT * FROM t WHERE a = 1 AND b != 2 AND c <> 3 AND d < 4 AND e <= 5 AND f > 6 AND g >= 7 AND h <=> NULL";
    let result = format_sql(input).unwrap();
    assert!(result.contains("="));
    assert!(result.contains("!="));
    assert!(result.contains("<>"));
    assert!(result.contains("<"));
    assert!(result.contains("<="));
    assert!(result.contains(">"));
    assert!(result.contains(">="));
    assert!(result.contains("<=>"));
}

#[test]
fn test_new_spark_keywords() {
    // Test that newly added grammar keywords are recognized
    let inputs = vec![
        "SELECT * FROM t CLUSTER BY a",
        "SELECT * FROM t DISTRIBUTE BY a",
        "SELECT * FROM t SORT BY a",
    ];
    
    for input in inputs {
        let result = format_sql(input);
        // Should not fail parsing
        assert!(result.is_ok(), "Failed to parse: {}", input);
    }
}

#[test]
fn test_idempotence_with_new_operators() {
    let input = "SELECT a <=> b, c::INT, d->e, func(f => 1), g || h FROM t";
    let first = format_sql(input).unwrap();
    let second = format_sql(&first).unwrap();
    assert_eq!(first, second, "Formatting is not idempotent");
}

#[test]
fn test_mixed_number_formats() {
    let input = "SELECT 100L, 50S, 10Y, 3.14F, 2.718D, 99.99BD, 1.5e10 FROM t";
    let result = format_sql(input).unwrap();
    assert!(result.contains("100L"));
    assert!(result.contains("50S"));
    assert!(result.contains("10Y"));
    assert!(result.contains("3.14F"));
    assert!(result.contains("2.718D"));
    assert!(result.contains("99.99BD"));
    assert!(result.contains("1.5e10"));
}
