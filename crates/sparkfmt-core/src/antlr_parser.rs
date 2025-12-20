//! ANTLR Parser Wrapper
//!
//! This module wraps the generated ANTLR parser to provide a clean API.
//! It is intended to become the ONLY entry point for parsing SQL strings
//! once the full ANTLR integration is complete.
//!
//! Currently, this module provides the foundation for ANTLR-based parsing,
//! but the actual parsing is still done by the hand-coded parser in parser.rs.

use crate::error::FormatError;
use crate::antlr_predicates::reset_lexer_state;

/// Comment with position and attachment info.
/// Extracted from the ANTLR token stream.
#[derive(Debug, Clone)]
pub struct Comment {
    pub text: String,
    pub line: usize,
    pub column: usize,
    pub is_block: bool,  // true for /* */, false for --
    pub is_hint: bool,   // true for /*+ */
}

/// Parse SQL string into ANTLR parse tree.
///
/// MUST handle all valid Spark SQL syntax.
/// MUST return error for invalid syntax (never panic).
/// MUST reset lexer state before parsing.
///
/// NOTE: Currently returns an error indicating that ANTLR parsing
/// is not yet integrated. Use the hand-coded parser in parser.rs instead.
pub fn parse(_input: &str) -> Result<(), FormatError> {
    // Reset thread-local state
    reset_lexer_state();
    
    // NOTE: Full ANTLR integration is not yet complete.
    // The generated lexer and parser code exists in src/generated/
    // but requires a full AST converter to be implemented in ast_converter.rs
    // before it can replace the hand-coded parser.
    //
    // The implementation would look like:
    // 
    // use antlr4rust::input_stream::InputStream;
    // use antlr4rust::common_token_stream::CommonTokenStream;
    // use crate::generated::sqlbaselexer::SqlBaseLexer;
    // use crate::generated::sqlbaseparser::SqlBaseParser;
    //
    // let input_stream = InputStream::new(input);
    // let lexer = SqlBaseLexer::new(input_stream);
    // let token_stream = CommonTokenStream::new(lexer);
    // let mut parser = SqlBaseParser::new(token_stream);
    // let tree = parser.singleStatement()
    //     .map_err(|e| FormatError::new(format!("Parse error: {:?}", e)))?;
    
    Err(FormatError::new(
        "ANTLR parser integration not yet complete. Use parser::parse() instead.".to_string()
    ))
}

/// Extract comments from token stream.
///
/// ANTLR puts comments in channel 2 (HIDDEN).
/// MUST collect all comments with their positions.
///
/// NOTE: Not yet implemented - requires full ANTLR integration.
pub fn extract_comments(_token_stream: &()) -> Vec<Comment> {
    // TODO: Implement comment extraction from ANTLR token stream
    // The token stream has methods to access hidden channel tokens
    // which is where comments are placed.
    Vec::new()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_antlr_parser_not_integrated() {
        // The ANTLR parser should return an error indicating it's not yet integrated
        let result = parse("SELECT 1");
        assert!(result.is_err());
    }

    #[test]
    fn test_comment_extraction_empty() {
        // Comment extraction returns empty for now
        let comments = extract_comments(&());
        assert!(comments.is_empty());
    }
}
