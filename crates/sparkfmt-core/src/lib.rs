pub mod parser;
pub mod formatter;
pub mod ir;
pub mod error;
pub mod keywords;
pub mod functions;
pub mod hints;

// Build-time generated code (keywords, operators from grammar)
pub mod build_generated;

// ANTLR-generated parser code
pub mod generated;

// ANTLR parser wrapper and AST converter (for future ANTLR integration)
pub mod antlr_parser;
pub mod ast_converter;

// ANTLR predicate implementations
pub mod antlr_predicates;
pub mod antlr4rust_workarounds;

// Re-export predicate types for convenience
pub use antlr_predicates::{LexerPredicates, ParserPredicates, ParserConfig};

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
