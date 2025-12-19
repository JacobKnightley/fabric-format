use sparkfmt_core::format_sql;

// Tests demonstrating context-sensitive identifier handling
// With the new architecture using Token::Word, identifiers preserve original casing
// and keywords are uppercase only in keyword positions

#[test]
fn test_column_names_preserve_casing() {
    let input = "select MyColumn, another_col from MyTable";
    let result = format_sql(input).unwrap();
    
    println!("Result:\n{}", result);
    
    // Column names preserve their original casing
    assert!(result.contains("MyColumn"));
    assert!(result.contains("another_col"));
    assert!(result.contains("MyTable"));
    
    // Keywords are uppercase
    assert!(result.contains("SELECT"));
    assert!(result.contains("FROM"));
}

#[test]
fn test_column_named_with_keyword_name() {
    // Columns that happen to have names matching keywords should preserve casing
    let input = "select order, key, value from items";
    let result = format_sql(input).unwrap();
    
    println!("Result:\n{}", result);
    
    // These are column names, not keywords, so they should preserve casing
    assert!(result.contains("order"));
    assert!(result.contains("key"));
    assert!(result.contains("value"));
    
    // Keywords in keyword positions are uppercase
    assert!(result.contains("SELECT"));
    assert!(result.contains("FROM"));
}

#[test]
fn test_qualified_identifiers() {
    let input = "select a.order, b.select, c.from from tables";
    let result = format_sql(input).unwrap();
    
    println!("Result:\n{}", result);
    
    // Qualified identifiers preserve casing
    assert!(result.contains("a.order"));
    assert!(result.contains("b.select"));
    assert!(result.contains("c.from"));
}

#[test]
fn test_order_by_with_column_named_key() {
    let input = "select * from t order by key";
    let result = format_sql(input).unwrap();
    
    println!("Result:\n{}", result);
    
    // ORDER BY are keywords - uppercase
    assert!(result.contains("ORDER BY"));
    
    // 'key' is a column name - preserve casing
    assert!(result.contains("key"));
}

#[test]
fn test_where_and_is_keyword_column_names_preserved() {
    // 'and', 'or' as column names vs AND/OR as operators
    let input = "select x, y from t where x = 1 and y = 2";
    let result = format_sql(input).unwrap();
    
    println!("Result:\n{}", result);
    
    // Column names preserve casing
    assert!(result.contains("x"));
    assert!(result.contains("y"));
    
    // AND in WHERE clause is a keyword - uppercase
    assert!(result.contains("AND"));
}

#[test]
fn test_built_in_functions_uppercase() {
    let input = "select count(*), sum(amount), avg(price) from orders";
    let result = format_sql(input).unwrap();
    
    println!("Result:\n{}", result);
    
    // Built-in functions are uppercase
    assert!(result.contains("COUNT(*)"));
    assert!(result.contains("SUM(amount)"));
    assert!(result.contains("AVG(price)"));
}

#[test]
fn test_user_defined_functions_preserve_casing() {
    let input = "select MyCustomFunc(x), my_udf(a,b) from t";
    let result = format_sql(input).unwrap();
    
    println!("Result:\n{}", result);
    
    // UDFs preserve original casing
    assert!(result.contains("MyCustomFunc(x)"));
    assert!(result.contains("my_udf(a,b)"));
}

#[test]
fn test_mixed_built_in_and_udf() {
    let input = "select COUNT(*), SUM(amount), MyCustomFunc(x) from orders";
    let result = format_sql(input).unwrap();
    
    println!("Result:\n{}", result);
    
    // Built-in functions uppercase
    assert!(result.contains("COUNT(*)"));
    assert!(result.contains("SUM(amount)"));
    
    // UDF preserves casing
    assert!(result.contains("MyCustomFunc(x)"));
}

#[test]
#[ignore] // DDL statements not yet supported
fn test_create_or_replace_temporary_view() {
    // Test complex DDL keyword sequence
    let input = "create or replace temporary view myView as select * from t";
    let result = format_sql(input).unwrap();
    
    println!("Result:\n{}", result);
    
    // Keywords uppercase
    assert!(result.contains("SELECT"));
    assert!(result.contains("FROM"));
    
    // View name preserves casing
    assert!(result.contains("myView"));
}

#[test]
fn test_table_and_column_aliases() {
    let input = "select t.MyColumn as MyAlias from MyTable t";
    let result = format_sql(input).unwrap();
    
    println!("Result:\n{}", result);
    
    // Aliases preserve casing
    assert!(result.contains("MyColumn"));
    assert!(result.contains("MyAlias"));
    assert!(result.contains("MyTable"));
    
    // AS keyword for column alias is uppercase
    assert!(result.contains("AS"));
}

#[test]
fn test_complex_query_with_mixed_casing() {
    let input = "select a.Id, b.Name, COUNT(*) as total from Users a join Orders b on a.Id=b.UserId where a.Status='active' group by a.Id, b.Name";
    let result = format_sql(input).unwrap();
    
    println!("Result:\n{}", result);
    
    // Identifiers preserve casing
    assert!(result.contains("Id"));
    assert!(result.contains("Name"));
    assert!(result.contains("Users"));
    assert!(result.contains("Orders"));
    assert!(result.contains("UserId"));
    assert!(result.contains("Status"));
    assert!(result.contains("total"));
    
    // Keywords uppercase
    assert!(result.contains("SELECT"));
    assert!(result.contains("FROM"));
    assert!(result.contains("JOIN"));
    assert!(result.contains("ON"));
    assert!(result.contains("WHERE"));
    assert!(result.contains("GROUP BY"));
    assert!(result.contains("AS"));
    
    // Built-in function uppercase
    assert!(result.contains("COUNT(*)"));
}
