use sparkfmt_core::format_sql;

#[test]
fn test_grouping_sets() {
    let input = "select a, b, sum(x) from t group by grouping sets ((a), (b), ())";
    let expected = "SELECT\n     a\n    ,b\n    ,SUM(x)\nFROM t\nGROUP BY\n     GROUPING SETS((a),(b),())";
    assert_eq!(format_sql(input).unwrap(), expected);
}

#[test]
fn test_grouping_sets_multiple_cols() {
    let input = "select a, b, c, sum(x) from t group by grouping sets ((a,b), (b,c), ())";
    let expected = "SELECT\n     a\n    ,b\n    ,c\n    ,SUM(x)\nFROM t\nGROUP BY\n     GROUPING SETS((a,b),(b,c),())";
    assert_eq!(format_sql(input).unwrap(), expected);
}

#[test]
fn test_rollup() {
    let input = "select a, b, sum(x) from t group by rollup(a, b)";
    let expected = "SELECT\n     a\n    ,b\n    ,SUM(x)\nFROM t\nGROUP BY\n     ROLLUP(a,b)";
    assert_eq!(format_sql(input).unwrap(), expected);
}

#[test]
fn test_cube() {
    let input = "select a, b, sum(x) from t group by cube(a, b)";
    let expected = "SELECT\n     a\n    ,b\n    ,SUM(x)\nFROM t\nGROUP BY\n     CUBE(a,b)";
    assert_eq!(format_sql(input).unwrap(), expected);
}
