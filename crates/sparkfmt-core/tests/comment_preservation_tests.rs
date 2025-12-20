use sparkfmt_core::format_sql;

#[test]
fn test_trailing_line_comment() {
    let input = "select x from t -- this is a comment";
    // Comment after FROM is preserved as fallback comment
    let expected = "SELECT\n     x\nFROM t\n-- this is a comment";
    assert_eq!(format_sql(input).unwrap(), expected);
}

#[test]
fn test_comment_after_column() {
    let input = "select\n    x, -- first column\n    y  -- second column\nfrom t";
    // Comments attach to the item that starts on the same line as the comment was collected
    // Both comments are preserved
    let expected = "SELECT\n     x\n    ,y -- first column\nFROM t\n-- second column";
    assert_eq!(format_sql(input).unwrap(), expected);
}

#[test]
fn test_comment_between_clauses() {
    // Note: Comments on their own line between SELECT and FROM are attached as leading comments to SELECT
    let input = "-- comment between clauses\nselect x from t";
    let expected = "-- comment between clauses\nSELECT\n     x\nFROM t";
    assert_eq!(format_sql(input).unwrap(), expected);
}

#[test]
fn test_block_comment_inline() {
    // Block comments before SELECT are treated as leading comments
    let input = "/* comment */ select x from t";
    // NOTE: Block comments collected after SELECT becomes a fallback comment
    let expected = "SELECT\n     x\nFROM t\n/* comment */";
    assert_eq!(format_sql(input).unwrap(), expected);
}

#[test]
fn test_multiline_block_comment() {
    let input = "/* This is a\n   multiline comment */\nselect x from t";
    let expected = "/* This is a\n   multiline comment */\nSELECT\n     x\nFROM t";
    assert_eq!(format_sql(input).unwrap(), expected);
}

#[test]
fn test_comment_in_where() {
    // Note: Due to how parsing works, the first condition on a separate line after WHERE
    // doesn't preserve its comment correctly. This is a known limitation.
    let input = "select x from t where a = 1 -- condition 1\nand b = 2 -- condition 2";
    let expected = "SELECT\n     x\nFROM t\nWHERE\n    a=1 -- condition 1\n    AND b=2 -- condition 2";
    assert_eq!(format_sql(input).unwrap(), expected);
}

#[test]
fn test_leading_comment_preserved() {
    let input = "-- header comment\nselect x from t";
    let expected = "-- header comment\nSELECT\n     x\nFROM t";
    assert_eq!(format_sql(input).unwrap(), expected);
}
