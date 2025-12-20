// This module includes code generated at build-time from the Spark SQL grammar
// The actual files are generated in OUT_DIR/generated/ and included here

#[allow(dead_code)]
mod keywords {
    include!(concat!(env!("OUT_DIR"), "/generated/keywords.rs"));
}

#[allow(dead_code)]
mod operators {
    include!(concat!(env!("OUT_DIR"), "/generated/operators.rs"));
}

// Re-export the key functions and constants
pub use keywords::{is_keyword, SPARK_KEYWORDS};
pub use operators::{is_multi_char_operator, OPERATOR_SYMBOLS};
