use std::env;
use std::fs;
use std::io::{self, BufRead, Write};
use std::path::Path;

fn main() {
    println!("cargo:rerun-if-changed=../../grammar/SqlBaseLexer.g4");
    println!("cargo:rerun-if-changed=../../grammar/SqlBaseParser.g4");

    let out_dir = env::var("OUT_DIR").unwrap();
    let generated_dir = Path::new(&out_dir).join("generated");
    fs::create_dir_all(&generated_dir).unwrap();

    // Parse SqlBaseLexer.g4
    let lexer_path = "../../grammar/SqlBaseLexer.g4";
    let keywords = extract_keywords(lexer_path).expect("Failed to extract keywords");
    let operators = extract_operators(lexer_path).expect("Failed to extract operators");

    // Generate keywords.rs
    generate_keywords_file(&generated_dir, &keywords);
    
    // Generate operators.rs
    generate_operators_file(&generated_dir, &operators);
    
    println!("cargo:warning=Generated code from grammar: {} keywords, {} operators", 
             keywords.len(), operators.len());
}

fn extract_keywords(path: &str) -> io::Result<Vec<String>> {
    let file = fs::File::open(path)?;
    let reader = io::BufReader::new(file);
    let mut keywords = Vec::new();
    let mut in_keyword_section = false;

    for line in reader.lines() {
        let line = line?;
        let trimmed = line.trim();

        if trimmed == "//--SPARK-KEYWORD-LIST-START" {
            in_keyword_section = true;
            continue;
        }

        if trimmed == "//--SPARK-KEYWORD-LIST-END" {
            break;
        }

        if in_keyword_section {
            // Parse lines like: ADD: 'ADD';
            // or: ARRAY: 'ARRAY' {incComplexTypeLevelCounter();};
            if let Some(colon_pos) = trimmed.find(':') {
                let keyword = trimmed[..colon_pos].trim();
                // Skip empty lines and comments
                if !keyword.is_empty() && !keyword.starts_with("//") {
                    keywords.push(keyword.to_string());
                }
            }
        }
    }

    // Sort keywords alphabetically for binary search
    keywords.sort();
    
    Ok(keywords)
}

#[derive(Debug)]
struct Operator {
    name: String,
    symbols: Vec<String>,
}

fn extract_operators(path: &str) -> io::Result<Vec<Operator>> {
    let file = fs::File::open(path)?;
    let reader = io::BufReader::new(file);
    let mut operators = Vec::new();
    let mut after_keywords = false;

    for line in reader.lines() {
        let line = line?;
        let trimmed = line.trim();

        if trimmed == "//--SPARK-KEYWORD-LIST-END" {
            after_keywords = true;
            continue;
        }

        if !after_keywords {
            continue;
        }

        // Parse operator definitions like: EQ  : '=' | '==';
        // Also handles multi-line definitions
        if let Some(colon_pos) = trimmed.find(':') {
            let name = trimmed[..colon_pos].trim();
            
            // Skip non-operator tokens
            if name.is_empty() 
                || name.starts_with("//")
                || name.ends_with("_LITERAL")
                || name.ends_with("_STRING")
                || name.ends_with("_IDENTIFIER")
                || name.ends_with("_VALUE")
                || name.ends_with("_COMMENT")
                || name == "WS"
                || name == "UNRECOGNIZED"
                || name.starts_with("BEGIN_")
                || name.starts_with("END_")
                || name.contains("DOLLAR")
                || name.starts_with("HENT_") {
                continue;
            }

            // Extract the rest after colon
            if trimmed.ends_with(';') {
                let rest = &trimmed[colon_pos + 1..trimmed.len() - 1];
                let mut symbols = Vec::new();
                
                // Extract all quoted strings without splitting by '|'
                // We cannot use split('|') because '|' might be the operator itself inside quotes.
                // For example: PIPE: '|'; would incorrectly split into '' and '' if we used split.
                // Instead, we manually walk through the string, tracking quote boundaries.
                let mut chars = rest.chars().peekable();
                let mut in_quote = false;
                let mut current_symbol = String::new();
                
                while let Some(ch) = chars.next() {
                    if ch == '\'' {
                        if in_quote {
                            // End of quoted string
                            symbols.push(current_symbol.clone());
                            current_symbol.clear();
                            in_quote = false;
                        } else {
                            // Start of quoted string
                            in_quote = true;
                        }
                    } else if in_quote {
                        current_symbol.push(ch);
                    }
                }

                if !symbols.is_empty() {
                    operators.push(Operator {
                        name: name.to_string(),
                        symbols,
                    });
                }
            }
        }

        // Stop at certain markers to avoid parsing other sections
        if trimmed.starts_with("STRING_LITERAL") {
            break;
        }
    }

    Ok(operators)
}

fn generate_keywords_file(dir: &Path, keywords: &[String]) {
    let path = dir.join("keywords.rs");
    let mut file = fs::File::create(&path).unwrap();

    writeln!(file, "// AUTO-GENERATED from SqlBaseLexer.g4 - DO NOT EDIT").unwrap();
    writeln!(file, "// This file is generated at build time from the Spark SQL grammar.").unwrap();
    writeln!(file, "//").unwrap();
    writeln!(file, "// To update: modify grammar/SqlBaseLexer.g4 and rebuild.").unwrap();
    writeln!(file, "").unwrap();

    writeln!(file, "/// All Spark SQL keywords extracted from the grammar").unwrap();
    writeln!(file, "/// Source: grammar/SqlBaseLexer.g4 SPARK-KEYWORD-LIST").unwrap();
    writeln!(file, "pub const SPARK_KEYWORDS: &[&str] = &[").unwrap();
    
    for keyword in keywords {
        writeln!(file, "    \"{}\",", keyword).unwrap();
    }
    
    writeln!(file, "];").unwrap();
    writeln!(file, "").unwrap();

    writeln!(file, "/// Check if a string is a Spark SQL keyword (case-insensitive)").unwrap();
    writeln!(file, "pub fn is_keyword(s: &str) -> bool {{").unwrap();
    writeln!(file, "    let upper = s.to_uppercase();").unwrap();
    writeln!(file, "    SPARK_KEYWORDS.binary_search(&upper.as_str()).is_ok()").unwrap();
    writeln!(file, "}}").unwrap();
    writeln!(file, "").unwrap();
    
    writeln!(file, "#[cfg(test)]").unwrap();
    writeln!(file, "mod tests {{").unwrap();
    writeln!(file, "    use super::*;").unwrap();
    writeln!(file, "").unwrap();
    writeln!(file, "    #[test]").unwrap();
    writeln!(file, "    fn test_keyword_count() {{").unwrap();
    writeln!(file, "        assert_eq!(SPARK_KEYWORDS.len(), {});", keywords.len()).unwrap();
    writeln!(file, "    }}").unwrap();
    writeln!(file, "").unwrap();
    writeln!(file, "    #[test]").unwrap();
    writeln!(file, "    fn test_keyword_sorted() {{").unwrap();
    writeln!(file, "        let mut sorted = SPARK_KEYWORDS.to_vec();").unwrap();
    writeln!(file, "        sorted.sort();").unwrap();
    writeln!(file, "        assert_eq!(SPARK_KEYWORDS, sorted.as_slice());").unwrap();
    writeln!(file, "    }}").unwrap();
    writeln!(file, "").unwrap();
    writeln!(file, "    #[test]").unwrap();
    writeln!(file, "    fn test_basic_keywords() {{").unwrap();
    writeln!(file, "        assert!(is_keyword(\"SELECT\"));").unwrap();
    writeln!(file, "        assert!(is_keyword(\"select\"));").unwrap();
    writeln!(file, "        assert!(is_keyword(\"FROM\"));").unwrap();
    writeln!(file, "        assert!(is_keyword(\"WHERE\"));").unwrap();
    writeln!(file, "        assert!(!is_keyword(\"not_a_keyword\"));").unwrap();
    writeln!(file, "    }}").unwrap();
    writeln!(file, "}}").unwrap();
}

fn generate_operators_file(dir: &Path, operators: &[Operator]) {
    let path = dir.join("operators.rs");
    let mut file = fs::File::create(&path).unwrap();

    writeln!(file, "// AUTO-GENERATED from SqlBaseLexer.g4 - DO NOT EDIT").unwrap();
    writeln!(file, "// This file is generated at build time from the Spark SQL grammar.").unwrap();
    writeln!(file, "").unwrap();

    writeln!(file, "/// Operator symbols from Spark SQL grammar").unwrap();
    writeln!(file, "/// Ordered by length (longest first) for proper lexer matching").unwrap();
    writeln!(file, "pub const OPERATOR_SYMBOLS: &[&str] = &[").unwrap();
    
    // Collect all unique symbols and sort by length (descending) for proper lexing
    let mut all_symbols: Vec<String> = operators
        .iter()
        .flat_map(|op| op.symbols.iter().cloned())
        .collect();
    
    // Remove duplicates and sort by length (longest first)
    all_symbols.sort_by(|a, b| b.len().cmp(&a.len()).then(a.cmp(b)));
    all_symbols.dedup();
    
    for symbol in &all_symbols {
        writeln!(file, "    \"{}\",", symbol.escape_default()).unwrap();
    }
    
    writeln!(file, "];").unwrap();
    writeln!(file, "").unwrap();

    writeln!(file, "/// Check if a string is a multi-character operator").unwrap();
    writeln!(file, "pub fn is_multi_char_operator(s: &str) -> bool {{").unwrap();
    
    let multi_char: Vec<_> = all_symbols.iter().filter(|s| s.len() > 1).collect();
    if !multi_char.is_empty() {
        writeln!(file, "    matches!(s,").unwrap();
        for (i, symbol) in multi_char.iter().enumerate() {
            if i == multi_char.len() - 1 {
                writeln!(file, "        \"{}\"", symbol.escape_default()).unwrap();
            } else {
                writeln!(file, "        \"{}\" |", symbol.escape_default()).unwrap();
            }
        }
        writeln!(file, "    )").unwrap();
    } else {
        writeln!(file, "    false").unwrap();
    }
    writeln!(file, "}}").unwrap();
    writeln!(file, "").unwrap();

    writeln!(file, "#[cfg(test)]").unwrap();
    writeln!(file, "mod tests {{").unwrap();
    writeln!(file, "    use super::*;").unwrap();
    writeln!(file, "").unwrap();
    writeln!(file, "    #[test]").unwrap();
    writeln!(file, "    fn test_multi_char_operators() {{").unwrap();
    writeln!(file, "        assert!(is_multi_char_operator(\"<=\"));").unwrap();
    writeln!(file, "        assert!(is_multi_char_operator(\"<=>\"));").unwrap();
    writeln!(file, "        assert!(is_multi_char_operator(\"::\"));").unwrap();
    writeln!(file, "        assert!(is_multi_char_operator(\"->\"));").unwrap();
    writeln!(file, "        assert!(!is_multi_char_operator(\"=\"));").unwrap();
    writeln!(file, "    }}").unwrap();
    writeln!(file, "}}").unwrap();
}
