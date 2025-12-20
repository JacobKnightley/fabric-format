/// Comprehensive list of Spark SQL keywords
/// Auto-generated from SqlBaseLexer.g4 SPARK-KEYWORD-LIST at build time
///
/// This module provides case-insensitive keyword checking for Spark SQL.
/// The keyword list is derived directly from the Apache Spark grammar files.

// Use the generated keyword functions
pub use crate::generated::{is_keyword, SPARK_KEYWORDS};

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_basic_keywords() {
        assert!(is_keyword("SELECT"));
        assert!(is_keyword("select"));
        assert!(is_keyword("Select"));
        assert!(is_keyword("FROM"));
        assert!(is_keyword("WHERE"));
        assert!(is_keyword("GROUP"));
        assert!(is_keyword("ORDER"));
        assert!(is_keyword("LIMIT"));
    }

    #[test]
    fn test_join_keywords() {
        assert!(is_keyword("JOIN"));
        assert!(is_keyword("INNER"));
        assert!(is_keyword("LEFT"));
        assert!(is_keyword("RIGHT"));
        assert!(is_keyword("FULL"));
        assert!(is_keyword("CROSS"));
    }

    #[test]
    fn test_ddl_keywords() {
        assert!(is_keyword("CREATE"));
        assert!(is_keyword("DROP"));
        assert!(is_keyword("ALTER"));
        assert!(is_keyword("TABLE"));
        assert!(is_keyword("VIEW"));
        assert!(is_keyword("DATABASE"));
    }

    #[test]
    fn test_not_keywords() {
        assert!(!is_keyword("my_table"));
        assert!(!is_keyword("column1"));
        assert!(!is_keyword("custom_func"));
    }
    
    #[test]
    fn test_spark_specific_keywords() {
        // These are Spark-specific keywords that should be in the grammar
        assert!(is_keyword("CLUSTER"));
        assert!(is_keyword("DISTRIBUTE"));
        assert!(is_keyword("SORT"));
        assert!(is_keyword("ANTI"));
        assert!(is_keyword("SEMI"));
    }
    
    #[test]
    fn test_keyword_count() {
        // Verify we have significantly more keywords than the old hand-coded list
        assert!(SPARK_KEYWORDS.len() >= 399, "Should have at least 399 keywords from grammar");
    }
}
