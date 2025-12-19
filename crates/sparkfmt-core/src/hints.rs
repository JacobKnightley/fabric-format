/// Spark SQL query hints
/// Sourced from ResolveHints.scala
///
/// This module provides hint name recognition for Spark SQL optimizer hints.

use std::collections::HashSet;
use lazy_static::lazy_static;

lazy_static! {
    static ref HINT_NAMES: HashSet<&'static str> = {
        let mut set = HashSet::new();
        
        // Join hints
        set.insert("BROADCAST");
        set.insert("BROADCASTJOIN");
        set.insert("MAPJOIN");
        set.insert("MERGE");
        set.insert("SHUFFLE_MERGE");
        set.insert("MERGEJOIN");
        set.insert("SHUFFLE_HASH");
        set.insert("SHUFFLE_REPLICATE_NL");
        
        // Partition hints
        set.insert("COALESCE");
        set.insert("REPARTITION");
        set.insert("REPARTITION_BY_RANGE");
        set.insert("REBALANCE");
        
        set
    };
}

/// Check if a given string is a valid Spark SQL hint name (case-insensitive)
pub fn is_hint(name: &str) -> bool {
    HINT_NAMES.contains(name.to_uppercase().as_str())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_join_hints() {
        assert!(is_hint("BROADCAST"));
        assert!(is_hint("broadcast"));
        assert!(is_hint("BROADCASTJOIN"));
        assert!(is_hint("MAPJOIN"));
        assert!(is_hint("MERGE"));
        assert!(is_hint("SHUFFLE_MERGE"));
        assert!(is_hint("MERGEJOIN"));
        assert!(is_hint("SHUFFLE_HASH"));
        assert!(is_hint("SHUFFLE_REPLICATE_NL"));
    }

    #[test]
    fn test_partition_hints() {
        assert!(is_hint("COALESCE"));
        assert!(is_hint("coalesce"));
        assert!(is_hint("REPARTITION"));
        assert!(is_hint("REPARTITION_BY_RANGE"));
        assert!(is_hint("REBALANCE"));
    }

    #[test]
    fn test_not_hints() {
        assert!(!is_hint("SELECT"));
        assert!(!is_hint("FROM"));
        assert!(!is_hint("unknown_hint"));
    }

    #[test]
    fn test_case_insensitive() {
        assert!(is_hint("broadcast"));
        assert!(is_hint("BROADCAST"));
        assert!(is_hint("BroadCast"));
        assert!(is_hint("BrOaDcAsT"));
    }
}
