//! AST Converter
//!
//! Converts ANTLR parse tree (Concrete Syntax Tree) to our formatting IR.
//! MUST handle ALL grammar rules - no silent drops.
//!
//! This module is part of the grammar-driven parser refactor. Once complete,
//! it will be the authoritative converter from ANTLR CST to our IR types.
//!
//! # Status
//!
//! This module contains stub implementations that are ready for the full
//! ANTLR integration. The `AstBuilder` struct provides the foundation for
//! walking the ANTLR parse tree and building IR nodes.
//!
//! # Future Implementation
//!
//! The full implementation will require:
//! 1. Implementing `SqlBaseParserListener` trait for `AstBuilder`
//! 2. Adding enter/exit handlers for all ~200+ grammar rules
//! 3. Using stack-based building for nested structures
//! 4. NEVER using catch-all patterns that could drop tokens

use crate::error::FormatError;
use crate::ir::*;

/// Convert ANTLR parse tree to IR Query.
///
/// MUST handle every node type from the grammar.
/// MUST return error for unhandled nodes (NEVER silent drop).
///
/// NOTE: Not yet implemented. This is a placeholder for the full
/// ANTLR integration.
pub fn convert(_tree: &()) -> Result<Statement, FormatError> {
    Err(FormatError::new(
        "AST converter not yet implemented. Use parser::parse() directly.".to_string()
    ))
}

/// AST builder for constructing IR from ANTLR parse tree.
///
/// Uses a stack-based approach to build nested structures as we
/// walk the parse tree.
#[allow(dead_code)]
struct AstBuilder {
    /// Stack of statements being built
    statement_stack: Vec<Statement>,
    
    /// Stack of expressions being built
    expression_stack: Vec<Expression>,
    
    /// Current error, if any
    error: Option<FormatError>,
}

impl AstBuilder {
    /// Create a new AST builder.
    #[allow(dead_code)]
    fn new() -> Self {
        Self {
            statement_stack: Vec::new(),
            expression_stack: Vec::new(),
            error: None,
        }
    }
    
    /// Record an error during AST building.
    #[allow(dead_code)]
    fn set_error(&mut self, error: FormatError) {
        if self.error.is_none() {
            self.error = Some(error);
        }
    }
    
    /// Get the final result, consuming the builder.
    #[allow(dead_code)]
    fn finish(mut self) -> Result<Statement, FormatError> {
        if let Some(error) = self.error {
            return Err(error);
        }
        
        self.statement_stack.pop()
            .ok_or_else(|| FormatError::new("No statement produced".to_string()))
    }
}

// NOTE: The full implementation would implement the ANTLR listener interface
// to handle all the grammar rule contexts. The listener methods would be:
//
// - enter_selectClause / exit_selectClause
// - enter_fromClause / exit_fromClause  
// - enter_whereClause / exit_whereClause
// - enter_queryOrganization / exit_queryOrganization
// - enter_queryTerm / exit_queryTerm
// - enter_joinRelation / exit_joinRelation
// - enter_primaryExpression / exit_primaryExpression
// - ... etc for all ~200+ grammar rules
//
// Each handler would:
// 1. Extract token values from the context
// 2. Build the corresponding IR node
// 3. Push/pop from stacks as needed for nested structures
// 4. NEVER use `_ => {}` catch-all that would drop tokens

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_ast_converter_not_implemented() {
        let result = convert(&());
        assert!(result.is_err());
    }

    #[test]
    fn test_ast_builder_empty() {
        let builder = AstBuilder::new();
        let result = builder.finish();
        assert!(result.is_err());
    }
}
