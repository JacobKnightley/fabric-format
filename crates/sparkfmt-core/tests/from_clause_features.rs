use sparkfmt_core::format_sql;

#[test]
fn test_lateral_view() {
    let input = "select x, elem from t lateral view explode(arr) exploded as elem";
    let expected = "SELECT\n     x\n    ,elem\nFROM t\nLATERAL VIEW EXPLODE(arr) exploded AS elem";
    assert_eq!(format_sql(input).unwrap(), expected);
}

#[test]
fn test_lateral_view_outer() {
    let input = "select x, elem from t lateral view outer explode(arr) exploded as elem";
    let expected = "SELECT\n     x\n    ,elem\nFROM t\nLATERAL VIEW OUTER EXPLODE(arr) exploded AS elem";
    assert_eq!(format_sql(input).unwrap(), expected);
}

#[test]
fn test_pivot() {
    let input = "select * from t pivot (sum(val) for category in ('a','b'))";
    let expected = "SELECT\n     *\nFROM t\nPIVOT (SUM(val) FOR category IN ('a','b'))";
    assert_eq!(format_sql(input).unwrap(), expected);
}

#[test]
fn test_tablesample_percent() {
    let input = "select * from t tablesample (10 percent)";
    let expected = "SELECT\n     *\nFROM t TABLESAMPLE (10 PERCENT)";
    assert_eq!(format_sql(input).unwrap(), expected);
}

#[test]
fn test_tablesample_rows() {
    let input = "select * from t tablesample (100 rows)";
    let expected = "SELECT\n     *\nFROM t TABLESAMPLE (100 ROWS)";
    assert_eq!(format_sql(input).unwrap(), expected);
}

#[test]
fn test_from_subquery() {
    let input = "select x from (select y as x from s) sub";
    // Subquery content should be indented 4 spaces from the opening paren
    let expected = "SELECT\n     x\nFROM (\n    SELECT\n         y AS x\n    FROM s\n) sub";
    assert_eq!(format_sql(input).unwrap(), expected);
}

#[test]
fn test_multiple_lateral_views() {
    let input = "select x, e1, e2 from t lateral view explode(arr1) t1 as e1 lateral view explode(arr2) t2 as e2";
    let expected = "SELECT\n     x\n    ,e1\n    ,e2\nFROM t\nLATERAL VIEW EXPLODE(arr1) t1 AS e1\nLATERAL VIEW EXPLODE(arr2) t2 AS e2";
    assert_eq!(format_sql(input).unwrap(), expected);
}
