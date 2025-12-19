use sparkfmt_core::format_sql;

#[test]
fn test_left_semi_join() {
    let input = "select * from t1 left semi join t2 on t1.id = t2.id";
    let expected = "SELECT\n     *\nFROM t1\nLEFT SEMI JOIN t2\n    ON t1.id=t2.id";
    assert_eq!(format_sql(input).unwrap(), expected);
}

#[test]
fn test_left_anti_join() {
    let input = "select * from t1 left anti join t2 on t1.id = t2.id";
    let expected = "SELECT\n     *\nFROM t1\nLEFT ANTI JOIN t2\n    ON t1.id=t2.id";
    assert_eq!(format_sql(input).unwrap(), expected);
}

#[test]
fn test_natural_join() {
    let input = "select * from t1 natural join t2";
    let expected = "SELECT\n     *\nFROM t1\nNATURAL JOIN t2";
    assert_eq!(format_sql(input).unwrap(), expected);
}

#[test]
fn test_join_using() {
    let input = "select * from t1 join t2 using (id)";
    let expected = "SELECT\n     *\nFROM t1\nINNER JOIN t2\n    USING (id)";
    assert_eq!(format_sql(input).unwrap(), expected);
}

#[test]
fn test_join_using_multiple_columns() {
    let input = "select * from t1 join t2 using (id, name)";
    let expected = "SELECT\n     *\nFROM t1\nINNER JOIN t2\n    USING (id,name)";
    assert_eq!(format_sql(input).unwrap(), expected);
}

#[test]
fn test_right_semi_join() {
    let input = "select * from t1 right semi join t2 on t1.id = t2.id";
    let expected = "SELECT\n     *\nFROM t1\nRIGHT SEMI JOIN t2\n    ON t1.id=t2.id";
    assert_eq!(format_sql(input).unwrap(), expected);
}

#[test]
fn test_right_anti_join() {
    let input = "select * from t1 right anti join t2 on t1.id = t2.id";
    let expected = "SELECT\n     *\nFROM t1\nRIGHT ANTI JOIN t2\n    ON t1.id=t2.id";
    assert_eq!(format_sql(input).unwrap(), expected);
}

#[test]
fn test_natural_left_join() {
    let input = "select * from t1 natural left join t2";
    let expected = "SELECT\n     *\nFROM t1\nNATURAL LEFT JOIN t2";
    assert_eq!(format_sql(input).unwrap(), expected);
}
