pub mod parser;
pub mod formatter;
pub mod ir;
pub mod error;
pub mod keywords;
pub mod functions;
pub mod hints;
pub mod generated;

pub use error::FormatError;

/// Format SQL according to Spark SQL formatting rules
pub fn format_sql(input: &str) -> Result<String, FormatError> {
    // Parse the input SQL
    let query = parser::parse(input)?;
    
    // Format the query
    let formatted = formatter::format(&query);
    
    Ok(formatted)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_basic_formatting() {
        let input = "select a,b from t";
        let result = format_sql(input).unwrap();
        assert!(result.contains("SELECT"));
        assert!(result.contains("FROM"));
    }
}
