use crate::error::FormatError;
use crate::ir::*;
use regex::Regex;
use lazy_static::lazy_static;

lazy_static! {
    static ref WHITESPACE: Regex = Regex::new(r"^\s+").unwrap();
    static ref IDENTIFIER: Regex = Regex::new(r"^[a-zA-Z_][a-zA-Z0-9_]*").unwrap();
    static ref NUMBER: Regex = Regex::new(r"^[0-9]+(?:\.[0-9]+)?").unwrap();
    static ref STRING_LITERAL: Regex = Regex::new(r"^'([^']|'')*'").unwrap();
}

pub fn parse(input: &str) -> Result<Statement, FormatError> {
    let mut lexer = Lexer::new(input);
    let statement = parse_statement(&mut lexer)?;
    
    // Check for unconsumed comments and emit warning
    if let Some(registry) = &lexer.registry {
        let unconsumed = registry.get_unconsumed_comments();
        if !unconsumed.is_empty() {
            #[cfg(all(target_arch = "wasm32", feature = "wasm"))]
            {
                for comment in &unconsumed {
                    // Note: web_sys logging would go here if needed
                    // For now, we silently accept unconsumed comments as they're emitted as fallback
                }
            }
            #[cfg(not(all(target_arch = "wasm32", feature = "wasm")))]
            {
                for comment in &unconsumed {
                    eprintln!("Warning: Unconsumed comment at line {}: {}", comment.line, comment.text);
                }
            }
        }
    }
    
    Ok(statement)
}

#[derive(Debug, Clone, PartialEq)]
pub enum ParserToken {
    Word(String), // Unified token for keywords and identifiers (preserves original casing)
    Symbol(String),
    Number(String),
    StringLiteral(String),
    QuotedIdentifier(String), // Backtick or double-quoted identifiers
    Eof,
}

#[derive(Debug, Clone)]
pub struct CommentInfo {
    pub text: String,
    pub line: usize,
    pub col: usize,
    pub is_line_comment: bool,
    pub is_hint: bool,
}

#[derive(Debug, Clone)]
pub struct TrackedComment {
    pub info: CommentInfo,
    pub consumed: bool,
}

#[derive(Debug, Clone)]
pub struct CommentRegistry {
    pub comments: Vec<TrackedComment>,
}

impl CommentRegistry {
    pub fn new(comments: Vec<CommentInfo>) -> Self {
        Self {
            comments: comments.into_iter().map(|info| TrackedComment {
                info,
                consumed: false,
            }).collect(),
        }
    }
    
    /// Find and consume a comment on a specific line
    pub fn consume_on_line(&mut self, line: usize, is_line_comment: bool) -> Option<Comment> {
        let idx = self.comments.iter().position(|c| {
            !c.consumed && c.info.is_line_comment == is_line_comment && c.info.line == line
        })?;
        
        self.comments[idx].consumed = true;
        Some(Comment {
            text: self.comments[idx].info.text.clone(),
            is_line_comment: self.comments[idx].info.is_line_comment,
            attachment: CommentAttachment::TrailingInline,
        })
    }
    
    /// Get all unconsumed comments (excluding hints) in a line range
    pub fn unconsumed_in_range(&self, start: usize, end: usize) -> Vec<(usize, &TrackedComment)> {
        self.comments.iter()
            .enumerate()
            .filter(|(_, c)| !c.consumed && !c.info.is_hint && c.info.line >= start && c.info.line <= end)
            .collect()
    }
    
    /// Consume all unconsumed comments in a line range
    pub fn consume_range(&mut self, start: usize, end: usize) {
        for comment in &mut self.comments {
            if !comment.consumed && !comment.info.is_hint && comment.info.line >= start && comment.info.line <= end {
                comment.consumed = true;
            }
        }
    }
    
    /// Get all unconsumed non-hint comments for fallback emission
    pub fn get_unconsumed_comments(&self) -> Vec<&CommentInfo> {
        self.comments.iter()
            .filter(|c| !c.consumed && !c.info.is_hint)
            .map(|c| &c.info)
            .collect()
    }
    
    /// Get hint comments (always consumed separately)
    pub fn get_hint_comment(&mut self) -> Option<String> {
        if let Some(idx) = self.comments.iter().position(|c| !c.consumed && c.info.is_hint) {
            self.comments[idx].consumed = true;
            Some(self.comments[idx].info.text.clone())
        } else {
            None
        }
    }
    
    /// Get leading comments (non-hint comments before parsing starts)
    pub fn consume_leading_comments(&mut self, before_line: usize) -> Vec<Comment> {
        let mut leading = Vec::new();
        for comment in &mut self.comments {
            if !comment.consumed && !comment.info.is_hint && comment.info.line < before_line {
                comment.consumed = true;
                leading.push(Comment {
                    text: comment.info.text.clone(),
                    is_line_comment: comment.info.is_line_comment,
                    attachment: CommentAttachment::Leading,
                });
            }
        }
        leading
    }
}

struct Lexer {
    input: String,
    pos: usize,
    line: usize,
    col: usize,
    peeked: Option<ParserToken>,
    comments: Vec<CommentInfo>,
    registry: Option<CommentRegistry>,
}

impl Lexer {
    fn new(input: &str) -> Self {
        Self {
            input: input.to_string(),
            pos: 0,
            line: 1,
            col: 1,
            peeked: None,
            comments: Vec::new(),
            registry: None,
        }
    }
    
    fn get_or_create_registry(&mut self) -> &mut CommentRegistry {
        if self.registry.is_none() {
            // Build registry from collected comments at first access
            self.registry = Some(CommentRegistry::new(std::mem::take(&mut self.comments)));
        } else {
            // Add any newly collected comments to the existing registry
            if !self.comments.is_empty() {
                let registry = self.registry.as_mut().unwrap();
                for comment in std::mem::take(&mut self.comments) {
                    registry.comments.push(TrackedComment {
                        info: comment,
                        consumed: false,
                    });
                }
            }
        }
        self.registry.as_mut().unwrap()
    }

    fn advance_char(&mut self) {
        if self.pos < self.input.len() {
            if self.input.as_bytes()[self.pos] == b'\n' {
                self.line += 1;
                self.col = 1;
            } else {
                self.col += 1;
            }
            self.pos += 1;
        }
    }

    fn advance_by(&mut self, n: usize) {
        for _ in 0..n {
            self.advance_char();
        }
    }

    fn skip_whitespace(&mut self) {
        while self.pos < self.input.len() {
            let remaining = &self.input[self.pos..];
            let start_line = self.line;
            let start_col = self.col;
            
            // Collect single-line comments
            if remaining.starts_with("--") {
                if let Some(newline_pos) = remaining.find('\n') {
                    let comment_text = remaining[..newline_pos].to_string();
                    self.comments.push(CommentInfo {
                        text: comment_text,
                        line: start_line,
                        col: start_col,
                        is_line_comment: true,
                        is_hint: false,
                    });
                    self.advance_by(newline_pos + 1);
                    // Continue to skip whitespace after the comment for leading comments
                    continue;
                } else {
                    let comment_text = remaining.to_string();
                    self.comments.push(CommentInfo {
                        text: comment_text,
                        line: start_line,
                        col: start_col,
                        is_line_comment: true,
                        is_hint: false,
                    });
                    self.pos = self.input.len();
                    break;
                }
            }
            
            // Collect hint comments (/*+ ... */)
            if remaining.starts_with("/*+") {
                if let Some(end_pos) = remaining.find("*/") {
                    let comment_text = remaining[..end_pos + 2].to_string();
                    self.comments.push(CommentInfo {
                        text: comment_text,
                        line: start_line,
                        col: start_col,
                        is_line_comment: false,
                        is_hint: true,
                    });
                    self.advance_by(end_pos + 2);
                } else {
                    let comment_text = remaining.to_string();
                    self.comments.push(CommentInfo {
                        text: comment_text,
                        line: start_line,
                        col: start_col,
                        is_line_comment: false,
                        is_hint: true,
                    });
                    self.pos = self.input.len();
                }
                continue;
            }
            
            // Collect multi-line comments (regular /* ... */)
            if remaining.starts_with("/*") {
                if let Some(end_pos) = remaining.find("*/") {
                    let comment_text = remaining[..end_pos + 2].to_string();
                    self.comments.push(CommentInfo {
                        text: comment_text,
                        line: start_line,
                        col: start_col,
                        is_line_comment: false,
                        is_hint: false,
                    });
                    self.advance_by(end_pos + 2);
                } else {
                    let comment_text = remaining.to_string();
                    self.comments.push(CommentInfo {
                        text: comment_text,
                        line: start_line,
                        col: start_col,
                        is_line_comment: false,
                        is_hint: false,
                    });
                    self.pos = self.input.len();
                }
                continue;
            }
            
            // Skip whitespace
            if let Some(m) = WHITESPACE.find(remaining) {
                self.advance_by(m.end());
                continue;
            }
            
            break;
        }
    }

    fn peek(&mut self) -> Result<ParserToken, FormatError> {
        if let Some(ref token) = self.peeked {
            return Ok(token.clone());
        }
        
        let token = self.next_token()?;
        self.peeked = Some(token.clone());
        Ok(token)
    }

    fn next(&mut self) -> Result<ParserToken, FormatError> {
        if let Some(token) = self.peeked.take() {
            return Ok(token);
        }
        self.next_token()
    }

    fn next_token(&mut self) -> Result<ParserToken, FormatError> {
        self.skip_whitespace();
        
        // Record token position
        let token_line = self.line;
        let token_col = self.col;
        
        if self.pos >= self.input.len() {
            return Ok(ParserToken::Eof);
        }
        
        let remaining = &self.input[self.pos..];
        
        // Try backtick-quoted identifier
        if remaining.starts_with('`') {
            self.advance_char(); // skip opening backtick
            let mut ident = String::new();
            while self.pos < self.input.len() {
                let ch = self.input.as_bytes()[self.pos] as char;
                if ch == '`' {
                    self.advance_char(); // skip closing backtick
                    return Ok(ParserToken::QuotedIdentifier(ident));
                }
                ident.push(ch);
                self.advance_char();
            }
            return Err(FormatError::new("Unterminated quoted identifier".to_string()));
        }
        
        // Try string literal
        if let Some(m) = STRING_LITERAL.find(remaining) {
            let token = ParserToken::StringLiteral(m.as_str().to_string());
            self.advance_by(m.end());
            return Ok(token);
        }
        
        // Try number
        if let Some(m) = NUMBER.find(remaining) {
            let token = ParserToken::Number(m.as_str().to_string());
            self.advance_by(m.end());
            return Ok(token);
        }
        
        // Try identifier or keyword - store with original casing
        if let Some(m) = IDENTIFIER.find(remaining) {
            let text = m.as_str().to_string();
            self.advance_by(m.end());
            return Ok(ParserToken::Word(text)); // Preserve original casing
        }
        
        // Try multi-char operators first (longest match first)
        for symbol in &["<=", ">=", "<>", "!=", "||", "::"] {
            if remaining.starts_with(symbol) {
                self.advance_by(symbol.len());
                return Ok(ParserToken::Symbol(symbol.to_string()));
            }
        }
        
        // Try single-char symbols
        for symbol in &["(", ")", ",", ".", "*", "=", "<", ">", "!", "+", "-", "/", "|", "[", "]", "~", ":"] {
            if remaining.starts_with(symbol) {
                self.advance_by(symbol.len());
                return Ok(ParserToken::Symbol(symbol.to_string()));
            }
        }
        
        Err(FormatError::new(format!("Unexpected character at position {}", self.pos)))
    }

    fn expect_keyword(&mut self, keyword: &str) -> Result<(), FormatError> {
        let token = self.next()?;
        match token {
            ParserToken::Word(w) if w.to_uppercase() == keyword.to_uppercase() => Ok(()),
            _ => Err(FormatError::new(format!("Expected keyword {}, got {:?}", keyword, token))),
        }
    }

    fn is_keyword(&mut self, keyword: &str) -> Result<bool, FormatError> {
        let token = self.peek()?;
        Ok(matches!(token, ParserToken::Word(w) if w.to_uppercase() == keyword.to_uppercase()))
    }
    
    fn is_symbol(&mut self, symbol: &str) -> Result<bool, FormatError> {
        let token = self.peek()?;
        Ok(matches!(token, ParserToken::Symbol(s) if s == symbol))
    }
    
    fn parse_identifier(&mut self) -> Result<String, FormatError> {
        let token = self.next()?;
        match token {
            ParserToken::Word(w) => Ok(w), // Return original casing
            ParserToken::QuotedIdentifier(q) => Ok(format!("`{}`", q)), // Return with backticks
            _ => Err(FormatError::new(format!("Expected identifier, got {:?}", token))),
        }
    }

    fn expect_symbol(&mut self, symbol: &str) -> Result<(), FormatError> {
        let token = self.next()?;
        match token {
            ParserToken::Symbol(s) if s == symbol => Ok(()),
            _ => Err(FormatError::new(format!("Expected symbol {}, got {:?}", symbol, token))),
        }
    }
}

fn parse_statement(lexer: &mut Lexer) -> Result<Statement, FormatError> {
    // Check what kind of statement this is
    let token = lexer.peek()?;
    
    match token {
        ParserToken::Word(w) => {
            let word_upper = w.to_uppercase();
            match word_upper.as_str() {
                "CREATE" | "DROP" | "DESCRIBE" | "DESC" | "SHOW" | "INSERT" | "DELETE" | "SET" | "USE" | 
                "UPDATE" | "MERGE" | "TRUNCATE" | "ALTER" | "EXPLAIN" | "CACHE" | "UNCACHE" | 
                "REFRESH" | "CLEAR" | "ANALYZE" | "RESET" => {
                    // For DDL/DML/session statements, collect leading comments
                    lexer.skip_whitespace();
                    let leading_comments = collect_leading_comments(lexer);
                    
                    match word_upper.as_str() {
                        "CREATE" => parse_create_statement(lexer, leading_comments),
                        "DROP" => parse_drop_statement(lexer, leading_comments),
                        "DESCRIBE" | "DESC" => parse_describe_statement(lexer, leading_comments),
                        "SHOW" => parse_show_statement(lexer, leading_comments),
                        "INSERT" => parse_insert_statement(lexer, leading_comments),
                        "DELETE" => parse_delete_statement(lexer, leading_comments),
                        "SET" => parse_set_statement(lexer, leading_comments),
                        "USE" => parse_use_statement(lexer, leading_comments),
                        "UPDATE" => parse_update_statement(lexer, leading_comments),
                        "MERGE" => parse_merge_statement(lexer, leading_comments),
                        "TRUNCATE" => parse_truncate_statement(lexer, leading_comments),
                        "ALTER" => parse_alter_statement(lexer, leading_comments),
                        "EXPLAIN" => parse_explain_statement(lexer, leading_comments),
                        "CACHE" => parse_cache_statement(lexer, leading_comments),
                        "UNCACHE" => parse_uncache_statement(lexer, leading_comments),
                        "REFRESH" => parse_refresh_statement(lexer, leading_comments),
                        "CLEAR" => parse_clear_cache_statement(lexer, leading_comments),
                        "ANALYZE" => parse_analyze_statement(lexer, leading_comments),
                        "RESET" => parse_reset_statement(lexer, leading_comments),
                        _ => unreachable!()
                    }
                },
                "WITH" => {
                    // WITH clause for SELECT - parse_select_query handles comments
                    let with_clause = Some(parse_with_clause(lexer)?);
                    let select = parse_select_query(lexer, with_clause)?;
                    check_for_union(lexer, select)
                },
                "SELECT" => {
                    // SELECT - parse_select_query handles comments
                    let select = parse_select_query(lexer, None)?;
                    check_for_union(lexer, select)
                },
                _ => Err(FormatError::new(format!("Unexpected statement starting with: {}", w)))
            }
        },
        _ => Err(FormatError::new("Expected statement keyword"))
    }
}

fn check_for_union(lexer: &mut Lexer, select: SelectQuery) -> Result<Statement, FormatError> {
    // Check for UNION
    if lexer.is_keyword("UNION")? {
        lexer.expect_keyword("UNION")?;
        let union_all = if lexer.is_keyword("ALL")? {
            lexer.expect_keyword("ALL")?;
            true
        } else {
            false
        };
        
        let right = parse_statement(lexer)?;
        
        return Ok(Statement::SetOperation(SetOperation {
            left: Box::new(select),
            op: if union_all { SetOperator::UnionAll } else { SetOperator::Union },
            right: Box::new(right),
        }));
    }
    
    Ok(Statement::Select(select))
}

fn parse_with_clause(lexer: &mut Lexer) -> Result<WithClause, FormatError> {
    lexer.expect_keyword("WITH")?;
    
    let mut ctes = Vec::new();
    
    loop {
        let name = parse_identifier(lexer)?;
        lexer.expect_keyword("AS")?;
        lexer.expect_symbol("(")?;
        let query = parse_statement(lexer)?;
        lexer.expect_symbol(")")?;
        
        ctes.push(Cte {
            name,
            query: Box::new(query),
        });
        
        // Check for comma (more CTEs)
        let token = lexer.peek()?;
        if matches!(token, ParserToken::Symbol(s) if s == ",") {
            lexer.next()?;
        } else {
            break;
        }
    }
    
    Ok(WithClause { ctes })
}

fn parse_select_query(lexer: &mut Lexer, with_clause: Option<WithClause>) -> Result<SelectQuery, FormatError> {
    let start_line = lexer.line;
    lexer.expect_keyword("SELECT")?;
    
    // Get registry and collect leading comments
    let registry = lexer.get_or_create_registry();
    let leading_comments = registry.consume_leading_comments(start_line);
    
    let distinct = if lexer.is_keyword("DISTINCT")? {
        lexer.expect_keyword("DISTINCT")?;
        true
    } else {
        false
    };
    
    // Extract hint comment if any
    let hint_comment = lexer.get_or_create_registry().get_hint_comment()
        .map(|text| format_hint_comment(&text));
    
    let select_list = parse_select_list_with_comments(lexer)?;
    
    let from = if lexer.is_keyword("FROM")? {
        Some(parse_from_clause(lexer)?)
    } else {
        None
    };
    
    let where_clause = if lexer.is_keyword("WHERE")? {
        Some(parse_where_clause(lexer)?)
    } else {
        None
    };
    
    let group_by = if lexer.is_keyword("GROUP")? {
        Some(parse_group_by_clause(lexer)?)
    } else {
        None
    };
    
    let having = if lexer.is_keyword("HAVING")? {
        Some(parse_having_clause(lexer)?)
    } else {
        None
    };
    
    let order_by = if lexer.is_keyword("ORDER")? {
        Some(parse_order_by_clause(lexer)?)
    } else {
        None
    };
    
    let limit = if lexer.is_keyword("LIMIT")? {
        Some(parse_limit_clause(lexer)?)
    } else {
        None
    };
    
    let end_line = lexer.line;
    
    // Collect any unconsumed comments in this query's range as fallback trailing comments
    let mut fallback_comments = Vec::new();
    let registry = lexer.get_or_create_registry();
    let unconsumed = registry.unconsumed_in_range(start_line, end_line);
    for (_, tracked) in unconsumed {
        fallback_comments.push(Comment {
            text: tracked.info.text.clone(),
            is_line_comment: tracked.info.is_line_comment,
            attachment: CommentAttachment::TrailingOwnLine,
        });
    }
    // Mark them as consumed
    registry.consume_range(start_line, end_line);
    
    Ok(SelectQuery {
        with_clause,
        distinct,
        select_list,
        from,
        where_clause,
        group_by,
        having,
        order_by,
        limit,
        leading_comments,
        hint_comment,
        fallback_comments,
    })
}

fn format_hint_comment(hint_text: &str) -> String {
    use crate::hints;
    
    // Extract content between /*+ and */
    let content = hint_text.trim_start_matches("/*+").trim_end_matches("*/").trim();
    
    // Split by comma to handle multiple hints
    let hints: Vec<&str> = content.split(',').collect();
    let mut formatted_hints = Vec::new();
    
    for hint in hints {
        let hint = hint.trim();
        // Extract hint name (before parenthesis or end of string)
        if let Some(paren_pos) = hint.find('(') {
            let hint_name = hint[..paren_pos].trim();
            let args = &hint[paren_pos..];
            
            // Uppercase hint name if it's a known hint
            let formatted_name = if hints::is_hint(hint_name) {
                hint_name.to_uppercase()
            } else {
                hint_name.to_string()
            };
            
            // Preserve argument casing, but remove spaces after commas
            let formatted_args = args.replace(", ", ",").replace(" ,", ",");
            formatted_hints.push(format!("{}{}", formatted_name, formatted_args));
        } else {
            // No arguments, just uppercase the hint name
            let formatted_name = if hints::is_hint(hint) {
                hint.to_uppercase()
            } else {
                hint.to_string()
            };
            formatted_hints.push(formatted_name);
        }
    }
    
    format!("/*+ {} */", formatted_hints.join(","))
}

fn parse_select_list_with_comments(lexer: &mut Lexer) -> Result<Vec<SelectItem>, FormatError> {
    let mut items = Vec::new();
    
    loop {
        // Save line BEFORE parsing expression (this is where the expression starts)
        let start_line = lexer.line;
        
        let expr = parse_expression(lexer)?;
        
        // Check for AS alias
        let alias = if lexer.is_keyword("AS")? {
            lexer.expect_keyword("AS")?;
            Some(lexer.parse_identifier()?)
        } else {
            // Check for implicit alias (identifier after expression)
            let token = lexer.peek()?;
            match token {
                ParserToken::Word(_) => {
                    // Only if it's not a keyword or comma
                    if !lexer.is_keyword("FROM")? && !lexer.is_keyword("WHERE")? && 
                       !lexer.is_keyword("GROUP")? && !lexer.is_keyword("ORDER")? && 
                       !lexer.is_keyword("LIMIT")? && !lexer.is_keyword("HAVING")? &&
                       !lexer.is_keyword("UNION")? {
                        Some(lexer.parse_identifier()?)
                    } else {
                        None
                    }
                }
                _ => None
            }
        };
        
        // Use the start_line as the anchor for trailing comments
        let anchor_line = start_line;
        
        // Check for comma - this will trigger skip_whitespace which collects trailing comments
        let token = lexer.peek()?;
        let has_comma = matches!(token, ParserToken::Symbol(s) if s == ",");
        
        // Now check for trailing inline comment using the start line
        let trailing_comment = extract_trailing_comment_for_line(lexer, anchor_line);
        
        items.push(SelectItem { 
            expr, 
            alias,
            trailing_comment,
        });
        
        if has_comma {
            lexer.next()?; // consume the comma
        } else {
            break;
        }
    }
    
    Ok(items)
}

fn extract_trailing_comment_for_line(lexer: &mut Lexer, line: usize) -> Option<Comment> {
    // Use registry to find and consume comment
    lexer.get_or_create_registry().consume_on_line(line, true)
}

fn parse_expression(lexer: &mut Lexer) -> Result<Expression, FormatError> {
    parse_or_expression(lexer)
}

fn parse_or_expression(lexer: &mut Lexer) -> Result<Expression, FormatError> {
    let mut left = parse_and_expression(lexer)?;
    
    while lexer.is_keyword("OR")? {
        lexer.expect_keyword("OR")?;
        let right = parse_and_expression(lexer)?;
        left = Expression::BinaryOp {
            left: Box::new(left),
            op: "OR".to_string(),
            right: Box::new(right),
        };
    }
    
    Ok(left)
}

fn parse_and_expression(lexer: &mut Lexer) -> Result<Expression, FormatError> {
    let mut left = parse_comparison_expression(lexer)?;
    
    while lexer.is_keyword("AND")? {
        lexer.expect_keyword("AND")?;
        let right = parse_comparison_expression(lexer)?;
        left = Expression::BinaryOp {
            left: Box::new(left),
            op: "AND".to_string(),
            right: Box::new(right),
        };
    }
    
    Ok(left)
}

fn parse_comparison_expression(lexer: &mut Lexer) -> Result<Expression, FormatError> {
    let mut left = parse_additive_expression(lexer)?;
    
    // Check for NOT (for NOT BETWEEN, NOT IN, NOT LIKE)
    let negated = if lexer.is_keyword("NOT")? {
        lexer.expect_keyword("NOT")?;
        true
    } else {
        false
    };
    
    // Check for special operators
    if lexer.is_keyword("IS")? {
        lexer.expect_keyword("IS")?;
        let not_distinct = if lexer.is_keyword("NOT")? {
            lexer.expect_keyword("NOT")?;
            true
        } else {
            false
        };
        
        // Check for DISTINCT FROM
        if lexer.is_keyword("DISTINCT")? {
            lexer.expect_keyword("DISTINCT")?;
            lexer.expect_keyword("FROM")?;
            let right = parse_additive_expression(lexer)?;
            return Ok(Expression::BinaryOp {
                left: Box::new(left),
                op: if not_distinct { "IS NOT DISTINCT FROM".to_string() } else { "IS DISTINCT FROM".to_string() },
                right: Box::new(right),
            });
        }
        
        // Otherwise it must be NULL
        lexer.expect_keyword("NULL")?;
        return Ok(Expression::IsNull { expr: Box::new(left), negated: not_distinct });
    }
    
    if lexer.is_keyword("BETWEEN")? {
        lexer.expect_keyword("BETWEEN")?;
        let low = parse_additive_expression(lexer)?;
        lexer.expect_keyword("AND")?;
        let high = parse_additive_expression(lexer)?;
        return Ok(Expression::Between {
            expr: Box::new(left),
            low: Box::new(low),
            high: Box::new(high),
            negated,
        });
    }
    
    if lexer.is_keyword("IN")? {
        lexer.expect_keyword("IN")?;
        lexer.expect_symbol("(")?;
        
        // Check if subquery
        if lexer.is_keyword("SELECT")? || lexer.is_keyword("WITH")? {
            let subquery = parse_statement(lexer)?;
            lexer.expect_symbol(")")?;
            return Ok(Expression::InSubquery {
                expr: Box::new(left),
                subquery: Box::new(subquery),
                negated,
            });
        }
        
        // Parse list
        let mut list = Vec::new();
        loop {
            list.push(parse_expression(lexer)?);
            let token = lexer.peek()?;
            if matches!(token, ParserToken::Symbol(s) if s == ",") {
                lexer.next()?;
            } else {
                break;
            }
        }
        lexer.expect_symbol(")")?;
        return Ok(Expression::InList {
            expr: Box::new(left),
            list,
            negated,
        });
    }
    
    if lexer.is_keyword("LIKE")? || lexer.is_keyword("RLIKE")? {
        let regex = lexer.is_keyword("RLIKE")?;
        lexer.next()?;  // consume LIKE or RLIKE
        let pattern = parse_additive_expression(lexer)?;
        
        let escape = if lexer.is_keyword("ESCAPE")? {
            lexer.expect_keyword("ESCAPE")?;
            Some(Box::new(parse_additive_expression(lexer)?))
        } else {
            None
        };
        
        return Ok(Expression::Like {
            expr: Box::new(left),
            pattern: Box::new(pattern),
            escape,
            negated,
            regex,
        });
    }
    
    // Standard comparison operators
    let token = lexer.peek()?;
    if matches!(token, ParserToken::Symbol(s) if matches!(s.as_str(), "=" | "<" | ">" | "<=" | ">=" | "<>" | "!=")) {
        let op = match lexer.next()? {
            ParserToken::Symbol(s) => s,
            _ => unreachable!(),
        };
        let right = parse_additive_expression(lexer)?;
        left = Expression::BinaryOp {
            left: Box::new(left),
            op,
            right: Box::new(right),
        };
    } else if negated {
        // If we had NOT but none of the special operators matched, this is a NOT unary op
        // which should have been caught earlier. This is an error case.
        return Err(FormatError::new("NOT must be followed by BETWEEN, IN, LIKE, or IS".to_string()));
    }
    
    Ok(left)
}

fn parse_additive_expression(lexer: &mut Lexer) -> Result<Expression, FormatError> {
    let mut left = parse_multiplicative_expression(lexer)?;
    
    loop {
        let token = lexer.peek()?;
        if matches!(token, ParserToken::Symbol(s) if s == "+" || s == "-") {
            let op = match lexer.next()? {
                ParserToken::Symbol(s) => s,
                _ => unreachable!(),
            };
            let right = parse_multiplicative_expression(lexer)?;
            left = Expression::BinaryOp {
                left: Box::new(left),
                op,
                right: Box::new(right),
            };
        } else {
            break;
        }
    }
    
    Ok(left)
}

fn parse_multiplicative_expression(lexer: &mut Lexer) -> Result<Expression, FormatError> {
    let mut left = parse_unary_expression(lexer)?;
    
    loop {
        let token = lexer.peek()?;
        if matches!(token, ParserToken::Symbol(s) if s == "*" || s == "/") {
            let op = match lexer.next()? {
                ParserToken::Symbol(s) => s,
                _ => unreachable!(),
            };
            let right = parse_unary_expression(lexer)?;
            left = Expression::BinaryOp {
                left: Box::new(left),
                op,
                right: Box::new(right),
            };
        } else {
            break;
        }
    }
    
    Ok(left)
}

fn parse_unary_expression(lexer: &mut Lexer) -> Result<Expression, FormatError> {
    let token = lexer.peek()?;
    
    match token {
        ParserToken::Symbol(s) if s == "-" || s == "+" || s == "~" => {
            let op = match lexer.next()? {
                ParserToken::Symbol(s) => s,
                _ => unreachable!(),
            };
            let expr = parse_unary_expression(lexer)?;
            Ok(Expression::UnaryOp { op, expr: Box::new(expr) })
        }
        ParserToken::Word(w) if w.eq_ignore_ascii_case("NOT") => {
            lexer.next()?;
            let expr = parse_unary_expression(lexer)?;
            Ok(Expression::UnaryOp { op: "NOT".to_string(), expr: Box::new(expr) })
        }
        _ => parse_postfix_expression(lexer)
    }
}

fn parse_postfix_expression(lexer: &mut Lexer) -> Result<Expression, FormatError> {
    let mut expr = parse_primary_expression(lexer)?;
    
    loop {
        let token = lexer.peek()?;
        match token {
            ParserToken::Symbol(s) if s == "[" => {
                lexer.next()?;
                let index = parse_expression(lexer)?;
                lexer.expect_symbol("]")?;
                expr = Expression::ArrayAccess {
                    array: Box::new(expr),
                    index: Box::new(index),
                };
            }
            ParserToken::Symbol(s) if s == "::" => {
                // PostgreSQL-style cast: expr::type
                lexer.next()?;
                let data_type = parse_identifier(lexer)?;
                expr = Expression::Cast {
                    expr: Box::new(expr),
                    data_type,
                    pg_style: true,
                };
            }
            ParserToken::Word(w) if w.eq_ignore_ascii_case("OVER") => {
                lexer.expect_keyword("OVER")?;
                lexer.expect_symbol("(")?;
                
                let partition_by = if lexer.is_keyword("PARTITION")? {
                    lexer.expect_keyword("PARTITION")?;
                    lexer.expect_keyword("BY")?;
                    parse_expression_list(lexer)?
                } else {
                    Vec::new()
                };
                
                let order_by = if lexer.is_keyword("ORDER")? {
                    lexer.expect_keyword("ORDER")?;
                    lexer.expect_keyword("BY")?;
                    parse_order_by_items(lexer)?
                } else {
                    Vec::new()
                };
                
                let frame = parse_window_frame_opt(lexer)?;
                lexer.expect_symbol(")")?;
                
                expr = Expression::WindowFunction {
                    function: Box::new(expr),
                    partition_by,
                    order_by,
                    frame,
                };
            }
            _ => break,
        }
    }
    
    Ok(expr)
}

fn parse_primary_expression(lexer: &mut Lexer) -> Result<Expression, FormatError> {
    let token = lexer.peek()?;
    
    match token {
        ParserToken::Symbol(s) if s == "(" => {
            lexer.next()?;
            
            // Check if it's a subquery
            if lexer.is_keyword("SELECT")? || lexer.is_keyword("WITH")? {
                let subquery = parse_statement(lexer)?;
                lexer.expect_symbol(")")?;
                return Ok(Expression::Subquery(Box::new(subquery)));
            }
            
            // Otherwise parenthesized expression
            let expr = parse_expression(lexer)?;
            lexer.expect_symbol(")")?;
            Ok(Expression::Parenthesized(Box::new(expr)))
        }
        ParserToken::StringLiteral(_) | ParserToken::Number(_) => {
            let lit = match lexer.next()? {
                ParserToken::StringLiteral(s) => s,
                ParserToken::Number(n) => n,
                _ => unreachable!(),
            };
            Ok(Expression::Literal(lit))
        }
        ParserToken::Symbol(s) if s == "*" => {
            lexer.next()?;
            Ok(Expression::Star)
        }
        ParserToken::QuotedIdentifier(_) => {
            let name = match lexer.next()? {
                ParserToken::QuotedIdentifier(n) => n,
                _ => unreachable!(),
            };
            
            // Check for qualified identifier with quoted identifier
            let token = lexer.peek()?;
            if matches!(token, ParserToken::Symbol(s) if s == ".") {
                lexer.next()?;
                let field_token = lexer.peek()?;
                if matches!(field_token, ParserToken::Symbol(s) if s == "*") {
                    lexer.next()?;
                    Ok(Expression::QualifiedStar(format!("`{}`", name)))
                } else {
                    // It's a qualified identifier (e.g., `table`.`col`)
                    let field = match lexer.next()? {
                        ParserToken::QuotedIdentifier(f) => format!("`{}`", f),
                        ParserToken::Word(f) => f,
                        _ => return Err(FormatError::new("Expected field name after dot".to_string())),
                    };
                    Ok(Expression::Identifier(format!("`{}`.{}", name, field)))
                }
            } else {
                Ok(Expression::QuotedIdentifier(name))
            }
        }
        ParserToken::Word(_) => {
            // Check for special keywords first
            if lexer.is_keyword("CASE")? {
                return parse_case_expression(lexer);
            }
            if lexer.is_keyword("CAST")? {
                return parse_cast_expression(lexer);
            }
            if lexer.is_keyword("EXISTS")? {
                lexer.expect_keyword("EXISTS")?;
                lexer.expect_symbol("(")?;
                let subquery = parse_statement(lexer)?;
                lexer.expect_symbol(")")?;
                return Ok(Expression::Exists { subquery: Box::new(subquery), negated: false });
            }
            
            // Check for typed literals (DATE, TIMESTAMP, INTERVAL)
            if lexer.is_keyword("DATE")? {
                let type_name = lexer.parse_identifier()?;
                let token = lexer.peek()?;
                if matches!(token, ParserToken::StringLiteral(_)) {
                    let value = match lexer.next()? {
                        ParserToken::StringLiteral(s) => s,
                        _ => unreachable!(),
                    };
                    return Ok(Expression::TypedLiteral { type_name, value });
                }
                // If not followed by string literal, treat as identifier
                return Ok(Expression::Identifier(type_name));
            }
            
            if lexer.is_keyword("TIMESTAMP")? {
                let type_name = lexer.parse_identifier()?;
                let token = lexer.peek()?;
                if matches!(token, ParserToken::StringLiteral(_)) {
                    let value = match lexer.next()? {
                        ParserToken::StringLiteral(s) => s,
                        _ => unreachable!(),
                    };
                    return Ok(Expression::TypedLiteral { type_name, value });
                }
                // If not followed by string literal, treat as identifier
                return Ok(Expression::Identifier(type_name));
            }
            
            if lexer.is_keyword("INTERVAL")? {
                let type_name = lexer.parse_identifier()?;
                // INTERVAL has a different format: INTERVAL 1 DAY
                // Parse the numeric value
                let token = lexer.peek()?;
                let value = match token {
                    ParserToken::Number(ref n) => {
                        let num = n.clone();
                        lexer.next()?;
                        // Parse the unit (DAY, MONTH, YEAR, etc.)
                        let unit = lexer.parse_identifier()?;
                        format!("{} {}", num, unit)
                    }
                    ParserToken::StringLiteral(ref s) => {
                        let str_val = s.clone();
                        lexer.next()?;
                        str_val
                    }
                    _ => {
                        // Invalid INTERVAL syntax, treat as identifier
                        return Ok(Expression::Identifier(type_name));
                    }
                };
                return Ok(Expression::TypedLiteral { type_name, value });
            }
            
            let name = lexer.parse_identifier()?;
            
            // Check for function call or qualified identifier
            let token = lexer.peek()?;
            let is_open_paren = matches!(&token, ParserToken::Symbol(s) if s == "(");
            let is_dot = matches!(&token, ParserToken::Symbol(s) if s == ".");
            
            if is_open_paren {
                lexer.next()?;
                let mut args = Vec::new();
                
                // Check for empty args
                let token = lexer.peek()?;
                if !matches!(token, ParserToken::Symbol(s) if s == ")") {
                    loop {
                        args.push(parse_expression(lexer)?);
                        
                        let token = lexer.peek()?;
                        if matches!(token, ParserToken::Symbol(s) if s == ",") {
                            lexer.next()?;
                        } else {
                            break;
                        }
                    }
                }
                
                lexer.expect_symbol(")")?;
                Ok(Expression::FunctionCall { name, args })
            } else if is_dot {
                // Qualified star (e.g., t.*)
                lexer.next()?;
                let token = lexer.peek()?;
                if matches!(token, ParserToken::Symbol(s) if s == "*") {
                    lexer.next()?;
                    Ok(Expression::QualifiedStar(name))
                } else {
                    // It's a qualified identifier (e.g., t.col)
                    let field = parse_identifier(lexer)?;
                    Ok(Expression::Identifier(format!("{}.{}", name, field)))
                }
            } else {
                Ok(Expression::Identifier(name))
            }
        }
        _ => Err(FormatError::new(format!("Unexpected token in expression: {:?}", token))),
    }
}

fn parse_identifier(lexer: &mut Lexer) -> Result<String, FormatError> {
    lexer.parse_identifier()
}

fn parse_case_expression(lexer: &mut Lexer) -> Result<Expression, FormatError> {
    lexer.expect_keyword("CASE")?;
    
    // Check for simple CASE (CASE x WHEN 1 THEN ...)
    let operand = if !lexer.is_keyword("WHEN")? {
        Some(Box::new(parse_expression(lexer)?))
    } else {
        None
    };
    
    let mut when_clauses = Vec::new();
    while lexer.is_keyword("WHEN")? {
        lexer.expect_keyword("WHEN")?;
        let condition = parse_expression(lexer)?;
        lexer.expect_keyword("THEN")?;
        let result = parse_expression(lexer)?;
        when_clauses.push(WhenClause { condition, result });
    }
    
    let else_clause = if lexer.is_keyword("ELSE")? {
        lexer.expect_keyword("ELSE")?;
        Some(Box::new(parse_expression(lexer)?))
    } else {
        None
    };
    
    lexer.expect_keyword("END")?;
    
    Ok(Expression::Case { operand, when_clauses, else_clause })
}

fn parse_cast_expression(lexer: &mut Lexer) -> Result<Expression, FormatError> {
    lexer.expect_keyword("CAST")?;
    lexer.expect_symbol("(")?;
    let expr = parse_expression(lexer)?;
    lexer.expect_keyword("AS")?;
    let data_type = parse_data_type(lexer)?;
    lexer.expect_symbol(")")?;
    
    Ok(Expression::Cast { expr: Box::new(expr), data_type, pg_style: false })
}

fn parse_data_type(lexer: &mut Lexer) -> Result<String, FormatError> {
    let mut type_str = String::new();
    let base = lexer.parse_identifier()?;
    type_str.push_str(&base.to_uppercase());
    
    // Handle DECIMAL(10,2), ARRAY<STRING>, MAP<K,V>
    let token = lexer.peek()?;
    match token {
        ParserToken::Symbol(s) if s == "(" => {
            type_str.push_str(&collect_balanced(lexer, "(", ")")?);
        }
        ParserToken::Symbol(s) if s == "<" => {
            type_str.push_str(&collect_balanced(lexer, "<", ">")?);
        }
        _ => {}
    }
    Ok(type_str)
}

fn collect_balanced(lexer: &mut Lexer, open: &str, close: &str) -> Result<String, FormatError> {
    let mut result = String::new();
    lexer.expect_symbol(open)?;
    result.push_str(open);
    
    let mut depth = 1;
    while depth > 0 {
        let token = lexer.next()?;
        match token {
            ParserToken::Symbol(s) if s == open => {
                depth += 1;
                result.push_str(&s);
            }
            ParserToken::Symbol(s) if s == close => {
                depth -= 1;
                result.push_str(&s);
            }
            ParserToken::Word(w) => {
                result.push_str(&w.to_uppercase());
            }
            ParserToken::Number(n) => {
                result.push_str(&n);
            }
            ParserToken::Symbol(s) => {
                result.push_str(&s);
            }
            ParserToken::Eof => {
                return Err(FormatError::new(format!("Unexpected EOF while parsing balanced {}{}", open, close)));
            }
            _ => {}
        }
    }
    Ok(result)
}

fn parse_from_clause(lexer: &mut Lexer) -> Result<FromClause, FormatError> {
    lexer.expect_keyword("FROM")?;
    
    let table = parse_table_ref(lexer)?;
    
    let mut joins = Vec::new();
    
    while is_join_keyword(lexer)? {
        joins.push(parse_join(lexer)?);
    }
    
    Ok(FromClause { table, joins })
}

fn is_join_keyword(lexer: &mut Lexer) -> Result<bool, FormatError> {
    let token = lexer.peek()?;
    Ok(matches!(token, ParserToken::Word(w) if matches!(w.to_uppercase().as_str(), "NATURAL" | "INNER" | "LEFT" | "RIGHT" | "FULL" | "CROSS" | "JOIN")))
}

fn parse_join(lexer: &mut Lexer) -> Result<Join, FormatError> {
    // Check for NATURAL modifier first
    let natural = if lexer.is_keyword("NATURAL")? {
        lexer.expect_keyword("NATURAL")?;
        true
    } else {
        false
    };
    
    let join_type = if lexer.is_keyword("INNER")? {
        lexer.expect_keyword("INNER")?;
        lexer.expect_keyword("JOIN")?;
        JoinType::Inner
    } else if lexer.is_keyword("LEFT")? {
        lexer.expect_keyword("LEFT")?;
        if lexer.is_keyword("SEMI")? {
            lexer.expect_keyword("SEMI")?;
            lexer.expect_keyword("JOIN")?;
            JoinType::LeftSemi
        } else if lexer.is_keyword("ANTI")? {
            lexer.expect_keyword("ANTI")?;
            lexer.expect_keyword("JOIN")?;
            JoinType::LeftAnti
        } else {
            if lexer.is_keyword("OUTER")? {
                lexer.expect_keyword("OUTER")?;
            }
            lexer.expect_keyword("JOIN")?;
            JoinType::Left
        }
    } else if lexer.is_keyword("RIGHT")? {
        lexer.expect_keyword("RIGHT")?;
        if lexer.is_keyword("SEMI")? {
            lexer.expect_keyword("SEMI")?;
            lexer.expect_keyword("JOIN")?;
            JoinType::RightSemi
        } else if lexer.is_keyword("ANTI")? {
            lexer.expect_keyword("ANTI")?;
            lexer.expect_keyword("JOIN")?;
            JoinType::RightAnti
        } else {
            if lexer.is_keyword("OUTER")? {
                lexer.expect_keyword("OUTER")?;
            }
            lexer.expect_keyword("JOIN")?;
            JoinType::Right
        }
    } else if lexer.is_keyword("FULL")? {
        lexer.expect_keyword("FULL")?;
        if lexer.is_keyword("OUTER")? {
            lexer.expect_keyword("OUTER")?;
        }
        lexer.expect_keyword("JOIN")?;
        JoinType::Full
    } else if lexer.is_keyword("CROSS")? {
        lexer.expect_keyword("CROSS")?;
        lexer.expect_keyword("JOIN")?;
        JoinType::Cross
    } else {
        lexer.expect_keyword("JOIN")?;
        JoinType::Inner
    };
    
    let table = parse_table_ref(lexer)?;
    
    let mut on_conditions = Vec::new();
    let mut using_columns = Vec::new();
    
    if lexer.is_keyword("ON")? {
        lexer.expect_keyword("ON")?;
        on_conditions = parse_conditions(lexer)?;
    } else if lexer.is_keyword("USING")? {
        lexer.expect_keyword("USING")?;
        lexer.expect_symbol("(")?;
        
        // Parse column list
        loop {
            using_columns.push(parse_identifier(lexer)?);
            
            if lexer.is_symbol(",")? {
                lexer.expect_symbol(",")?;
            } else {
                break;
            }
        }
        
        lexer.expect_symbol(")")?;
    }
    
    Ok(Join {
        join_type,
        natural,
        table,
        on_conditions,
        using_columns,
    })
}

fn parse_table_ref(lexer: &mut Lexer) -> Result<TableRef, FormatError> {
    // Check if it's a subquery
    let source = if lexer.is_symbol("(")? {
        lexer.expect_symbol("(")?;
        let subquery = parse_statement(lexer)?;
        lexer.expect_symbol(")")?;
        TableSource::Subquery(Box::new(subquery))
    } else {
        let name = parse_identifier(lexer)?;
        TableSource::Table(name)
    };
    
    let alias = if lexer.is_keyword("AS")? {
        lexer.expect_keyword("AS")?;
        Some(lexer.parse_identifier()?)
    } else {
        // Check for implicit alias
        let token = lexer.peek()?;
        match token {
            ParserToken::Word(_) => {
                // Make sure it's not a keyword
                if !is_join_keyword(lexer)? && !lexer.is_keyword("ON")? && 
                   !lexer.is_keyword("USING")? &&
                   !lexer.is_keyword("LATERAL")? &&
                   !lexer.is_keyword("PIVOT")? &&
                   !lexer.is_keyword("UNPIVOT")? &&
                   !lexer.is_keyword("TABLESAMPLE")? &&
                   !lexer.is_keyword("WHERE")? && 
                   !lexer.is_keyword("GROUP")? && !lexer.is_keyword("HAVING")? &&
                   !lexer.is_keyword("ORDER")? && !lexer.is_keyword("LIMIT")? &&
                   !lexer.is_keyword("UNION")? {
                    Some(lexer.parse_identifier()?)
                } else {
                    None
                }
            }
            _ => None
        }
    };
    
    // Parse LATERAL VIEWs
    let mut lateral_views = Vec::new();
    while lexer.is_keyword("LATERAL")? {
        lateral_views.push(parse_lateral_view(lexer)?);
    }
    
    // Parse PIVOT/UNPIVOT
    let pivot = if lexer.is_keyword("PIVOT")? {
        Some(parse_pivot(lexer)?)
    } else {
        None
    };
    
    let unpivot = if lexer.is_keyword("UNPIVOT")? {
        Some(parse_unpivot(lexer)?)
    } else {
        None
    };
    
    // Parse TABLESAMPLE
    let tablesample = if lexer.is_keyword("TABLESAMPLE")? {
        Some(parse_tablesample(lexer)?)
    } else {
        None
    };
    
    Ok(TableRef { 
        source,
        alias,
        lateral_views,
        pivot,
        unpivot,
        tablesample,
    })
}

fn parse_lateral_view(lexer: &mut Lexer) -> Result<LateralView, FormatError> {
    lexer.expect_keyword("LATERAL")?;
    lexer.expect_keyword("VIEW")?;
    
    let outer = if lexer.is_keyword("OUTER")? {
        lexer.expect_keyword("OUTER")?;
        true
    } else {
        false
    };
    
    // Parse the function call (e.g., EXPLODE(arr))
    let function = parse_expression(lexer)?;
    
    // Parse table alias
    let table_alias = parse_identifier(lexer)?;
    
    // Parse column aliases (optional AS keyword)
    if lexer.is_keyword("AS")? {
        lexer.expect_keyword("AS")?;
    }
    
    let mut column_aliases = Vec::new();
    // First column alias
    column_aliases.push(parse_identifier(lexer)?);
    
    // Additional column aliases (comma-separated)
    while lexer.is_symbol(",")? {
        lexer.expect_symbol(",")?;
        column_aliases.push(parse_identifier(lexer)?);
    }
    
    Ok(LateralView {
        outer,
        function,
        table_alias,
        column_aliases,
    })
}

fn parse_pivot(lexer: &mut Lexer) -> Result<PivotClause, FormatError> {
    lexer.expect_keyword("PIVOT")?;
    lexer.expect_symbol("(")?;
    
    // Parse aggregate expression (e.g., SUM(val))
    let aggregate = parse_expression(lexer)?;
    
    lexer.expect_keyword("FOR")?;
    
    // Parse pivot column
    let pivot_column = parse_identifier(lexer)?;
    
    lexer.expect_keyword("IN")?;
    lexer.expect_symbol("(")?;
    
    // Parse pivot values
    let mut pivot_values = Vec::new();
    loop {
        pivot_values.push(parse_expression(lexer)?);
        
        if lexer.is_symbol(",")? {
            lexer.expect_symbol(",")?;
        } else {
            break;
        }
    }
    
    lexer.expect_symbol(")")?;
    lexer.expect_symbol(")")?;
    
    Ok(PivotClause {
        aggregate,
        pivot_column,
        pivot_values,
    })
}

fn parse_unpivot(lexer: &mut Lexer) -> Result<UnpivotClause, FormatError> {
    lexer.expect_keyword("UNPIVOT")?;
    lexer.expect_symbol("(")?;
    
    // Parse value column
    let value_column = parse_identifier(lexer)?;
    
    lexer.expect_keyword("FOR")?;
    
    // Parse name column
    let name_column = parse_identifier(lexer)?;
    
    lexer.expect_keyword("IN")?;
    lexer.expect_symbol("(")?;
    
    // Parse unpivot columns
    let mut unpivot_columns = Vec::new();
    loop {
        unpivot_columns.push(parse_identifier(lexer)?);
        
        if lexer.is_symbol(",")? {
            lexer.expect_symbol(",")?;
        } else {
            break;
        }
    }
    
    lexer.expect_symbol(")")?;
    lexer.expect_symbol(")")?;
    
    Ok(UnpivotClause {
        value_column,
        name_column,
        unpivot_columns,
    })
}

fn parse_tablesample(lexer: &mut Lexer) -> Result<TableSample, FormatError> {
    lexer.expect_keyword("TABLESAMPLE")?;
    lexer.expect_symbol("(")?;
    
    // Parse the sample specification
    // This could be "10 PERCENT", "100 ROWS", or "BUCKET 3 OUT OF 10"
    let token = lexer.peek()?;
    
    let method = if lexer.is_keyword("BUCKET")? {
        lexer.expect_keyword("BUCKET")?;
        let bucket_num = parse_identifier(lexer)?;
        lexer.expect_keyword("OUT")?;
        lexer.expect_keyword("OF")?;
        let total_buckets = parse_identifier(lexer)?;
        TableSampleMethod::Bucket(bucket_num, total_buckets)
    } else {
        // Parse number
        let num = match lexer.next()? {
            ParserToken::Number(n) => n,
            ParserToken::Word(w) => w,
            other => return Err(FormatError::new(format!("Expected number in TABLESAMPLE, got {:?}", other))),
        };
        
        // Check for PERCENT or ROWS
        if lexer.is_keyword("PERCENT")? {
            lexer.expect_keyword("PERCENT")?;
            TableSampleMethod::Percent(num)
        } else if lexer.is_keyword("ROWS")? {
            lexer.expect_keyword("ROWS")?;
            TableSampleMethod::Rows(num)
        } else {
            // Default to ROWS if not specified
            TableSampleMethod::Rows(num)
        }
    };
    
    lexer.expect_symbol(")")?;
    
    Ok(TableSample { method })
}

fn parse_where_clause(lexer: &mut Lexer) -> Result<WhereClause, FormatError> {
    lexer.expect_keyword("WHERE")?;
    let conditions = parse_conditions(lexer)?;
    Ok(WhereClause { conditions })
}

fn parse_having_clause(lexer: &mut Lexer) -> Result<HavingClause, FormatError> {
    lexer.expect_keyword("HAVING")?;
    let conditions = parse_conditions(lexer)?;
    Ok(HavingClause { conditions })
}

fn parse_conditions(lexer: &mut Lexer) -> Result<Vec<Condition>, FormatError> {
    let mut conditions = Vec::new();
    
    // Parse first condition (no leading AND/OR)
    // Peek to trigger skip_whitespace so we're at the right line
    let _ = lexer.peek()?;
    let start_line = lexer.line;
    let expr = parse_comparison_expression(lexer)?;
    
    // Check for trailing comment after first condition
    let _token = lexer.peek()?;
    let trailing_comment = extract_trailing_comment_for_line(lexer, start_line);
    
    conditions.push(Condition {
        expr,
        logical_op: None,
        trailing_comment,
    });
    
    // Parse remaining conditions with AND/OR
    loop {
        let _token = lexer.peek()?;
        let logical_op = if lexer.is_keyword("AND")? {
            lexer.expect_keyword("AND")?;
            Some(LogicalOp::And)
        } else if lexer.is_keyword("OR")? {
            lexer.expect_keyword("OR")?;
            Some(LogicalOp::Or)
        } else {
            break;
        };
        
        // Peek to trigger skip_whitespace so we're at the right line
        let _ = lexer.peek()?;
        let start_line = lexer.line;
        let expr = parse_comparison_expression(lexer)?;
        
        // Check for trailing comment after this condition
        let _token = lexer.peek()?;
        let trailing_comment = extract_trailing_comment_for_line(lexer, start_line);
        
        conditions.push(Condition {
            expr,
            logical_op,
            trailing_comment,
        });
    }
    
    Ok(conditions)
}

fn parse_group_by_clause(lexer: &mut Lexer) -> Result<GroupByClause, FormatError> {
    lexer.expect_keyword("GROUP")?;
    lexer.expect_keyword("BY")?;
    
    let mut items = Vec::new();
    
    loop {
        // Check for GROUPING SETS
        if lexer.is_keyword("GROUPING")? {
            let saved_pos = lexer.pos;
            lexer.expect_keyword("GROUPING")?;
            if lexer.is_keyword("SETS")? {
                lexer.expect_keyword("SETS")?;
                // Parse the grouping sets as a single expression
                // GROUPING SETS ((a), (b), ())
                // We'll create a function call expression with "GROUPING SETS" as the name
                lexer.expect_symbol("(")?;
                
                // Parse the list of grouping sets
                let mut args = Vec::new();
                loop {
                    // Each grouping set is either empty () or a parenthesized list
                    lexer.expect_symbol("(")?;
                    
                    // Check for empty grouping set
                    if lexer.is_symbol(")")? {
                        lexer.expect_symbol(")")?;
                        // Use empty literal as placeholder for empty grouping set
                        args.push(Expression::Parenthesized(Box::new(Expression::Literal("".to_string()))));
                    } else {
                        // Parse expressions in the grouping set
                        let mut set_items = Vec::new();
                        loop {
                            set_items.push(parse_expression(lexer)?);
                            if lexer.is_symbol(",")? {
                                lexer.expect_symbol(",")?;
                            } else {
                                break;
                            }
                        }
                        lexer.expect_symbol(")")?;
                        
                        // Create a representation for the grouping set
                        if set_items.len() == 1 {
                            args.push(Expression::Parenthesized(Box::new(set_items.into_iter().next().unwrap())));
                        } else {
                            // Multiple items - create a FunctionCall with empty name to represent the tuple
                            // This is a bit of a hack but works for formatting purposes
                            let tuple_expr = Expression::FunctionCall {
                                name: "".to_string(), // Empty name means it's just a comma-separated list
                                args: set_items,
                            };
                            args.push(Expression::Parenthesized(Box::new(tuple_expr)));
                        }
                    }
                    
                    if lexer.is_symbol(",")? {
                        lexer.expect_symbol(",")?;
                    } else {
                        break;
                    }
                }
                
                lexer.expect_symbol(")")?;
                
                // Create a function call expression for GROUPING SETS
                items.push(Expression::FunctionCall {
                    name: "GROUPING SETS".to_string(),
                    args,
                });
            } else {
                // Not GROUPING SETS, rewind and parse as normal expression
                lexer.pos = saved_pos;
                items.push(parse_expression(lexer)?);
            }
        } else {
            items.push(parse_expression(lexer)?);
        }
        
        let token = lexer.peek()?;
        if matches!(token, ParserToken::Symbol(s) if s == ",") {
            lexer.next()?;
        } else {
            break;
        }
    }
    
    Ok(GroupByClause { items })
}

fn parse_order_by_clause(lexer: &mut Lexer) -> Result<OrderByClause, FormatError> {
    lexer.expect_keyword("ORDER")?;
    lexer.expect_keyword("BY")?;
    
    let mut items = Vec::new();
    
    loop {
        let expr = parse_expression(lexer)?;
        
        let direction = if lexer.is_keyword("ASC")? {
            lexer.expect_keyword("ASC")?;
            Some(OrderDirection::Asc)
        } else if lexer.is_keyword("DESC")? {
            lexer.expect_keyword("DESC")?;
            Some(OrderDirection::Desc)
        } else {
            None
        };
        
        items.push(OrderByItem { expr, direction });
        
        let token = lexer.peek()?;
        if matches!(token, ParserToken::Symbol(s) if s == ",") {
            lexer.next()?;
        } else {
            break;
        }
    }
    
    Ok(OrderByClause { items })
}

fn parse_limit_clause(lexer: &mut Lexer) -> Result<LimitClause, FormatError> {
    lexer.expect_keyword("LIMIT")?;
    let token = lexer.next()?;
    let count = match token {
        ParserToken::Number(n) => n,
        _ => return Err(FormatError::new("Expected number after LIMIT")),
    };
    Ok(LimitClause { count })
}

fn parse_expression_list(lexer: &mut Lexer) -> Result<Vec<Expression>, FormatError> {
    let mut items = Vec::new();
    
    loop {
        items.push(parse_expression(lexer)?);
        
        let token = lexer.peek()?;
        if matches!(token, ParserToken::Symbol(s) if s == ",") {
            lexer.next()?;
        } else {
            break;
        }
    }
    
    Ok(items)
}

fn parse_order_by_items(lexer: &mut Lexer) -> Result<Vec<OrderByItem>, FormatError> {
    let mut items = Vec::new();
    
    loop {
        let expr = parse_expression(lexer)?;
        
        let direction = if lexer.is_keyword("ASC")? {
            lexer.expect_keyword("ASC")?;
            Some(OrderDirection::Asc)
        } else if lexer.is_keyword("DESC")? {
            lexer.expect_keyword("DESC")?;
            Some(OrderDirection::Desc)
        } else {
            None
        };
        
        items.push(OrderByItem { expr, direction });
        
        let token = lexer.peek()?;
        if matches!(token, ParserToken::Symbol(s) if s == ",") {
            lexer.next()?;
        } else {
            break;
        }
    }
    
    Ok(items)
}

fn parse_window_frame_opt(lexer: &mut Lexer) -> Result<Option<WindowFrame>, FormatError> {
    // Check for ROWS or RANGE
    if !lexer.is_keyword("ROWS")? && !lexer.is_keyword("RANGE")? {
        return Ok(None);
    }
    
    let unit = if lexer.is_keyword("ROWS")? {
        lexer.expect_keyword("ROWS")?;
        "ROWS".to_string()
    } else {
        lexer.expect_keyword("RANGE")?;
        "RANGE".to_string()
    };
    
    // Check for optional BETWEEN keyword
    let _has_between = if lexer.is_keyword("BETWEEN")? {
        lexer.expect_keyword("BETWEEN")?;
        true
    } else {
        false
    };
    
    // Parse frame start
    let start = parse_frame_bound(lexer)?;
    
    // Check for AND (frame end)
    let end = if lexer.is_keyword("AND")? {
        lexer.expect_keyword("AND")?;
        Some(parse_frame_bound(lexer)?)
    } else {
        None
    };
    
    Ok(Some(WindowFrame { unit, start, end }))
}

fn parse_frame_bound(lexer: &mut Lexer) -> Result<String, FormatError> {
    if lexer.is_keyword("UNBOUNDED")? {
        lexer.expect_keyword("UNBOUNDED")?;
        if lexer.is_keyword("PRECEDING")? {
            lexer.expect_keyword("PRECEDING")?;
            Ok("UNBOUNDED PRECEDING".to_string())
        } else {
            lexer.expect_keyword("FOLLOWING")?;
            Ok("UNBOUNDED FOLLOWING".to_string())
        }
    } else if lexer.is_keyword("CURRENT")? {
        lexer.expect_keyword("CURRENT")?;
        lexer.expect_keyword("ROW")?;
        Ok("CURRENT ROW".to_string())
    } else {
        // N PRECEDING or N FOLLOWING
        let token = lexer.next()?;
        let n = match token {
            ParserToken::Number(num) => num,
            _ => return Err(FormatError::new("Expected number in frame bound")),
        };
        
        if lexer.is_keyword("PRECEDING")? {
            lexer.expect_keyword("PRECEDING")?;
            Ok(format!("{} PRECEDING", n))
        } else {
            lexer.expect_keyword("FOLLOWING")?;
            Ok(format!("{} FOLLOWING", n))
        }
    }
}

// Helper function to collect leading comments
fn collect_leading_comments(lexer: &mut Lexer) -> Vec<Comment> {
    let current_line = lexer.line;
    let registry = lexer.get_or_create_registry();
    registry.consume_leading_comments(current_line)
}

// DDL Statement Parsers

fn parse_create_statement(lexer: &mut Lexer, leading_comments: Vec<Comment>) -> Result<Statement, FormatError> {
    lexer.expect_keyword("CREATE")?;
    
    // Check for OR REPLACE
    let or_replace = if lexer.is_keyword("OR")? {
        lexer.expect_keyword("OR")?;
        lexer.expect_keyword("REPLACE")?;
        true
    } else {
        false
    };
    
    // Check for TEMPORARY / GLOBAL TEMPORARY
    let temporary = if lexer.is_keyword("TEMPORARY")? {
        lexer.expect_keyword("TEMPORARY")?;
        true
    } else if lexer.is_keyword("GLOBAL")? {
        lexer.expect_keyword("GLOBAL")?;
        lexer.expect_keyword("TEMPORARY")?;
        true
    } else {
        false
    };
    
    // Dispatch based on TABLE vs VIEW
    if lexer.is_keyword("TABLE")? {
        if or_replace || temporary {
            return Err(FormatError::new("OR REPLACE and TEMPORARY not supported for CREATE TABLE"));
        }
        parse_create_table(lexer, leading_comments)
    } else if lexer.is_keyword("VIEW")? {
        lexer.expect_keyword("VIEW")?;
        let view_name = parse_identifier(lexer)?;
        lexer.expect_keyword("AS")?;
        let query = parse_statement(lexer)?;
        
        Ok(Statement::CreateView(CreateViewStmt {
            or_replace,
            temporary,
            view_name,
            query: Box::new(query),
            leading_comments,
        }))
    } else {
        Err(FormatError::new("Expected TABLE or VIEW after CREATE"))
    }
}

fn parse_create_table(lexer: &mut Lexer, leading_comments: Vec<Comment>) -> Result<Statement, FormatError> {
    lexer.expect_keyword("TABLE")?;
    let table_name = parse_identifier(lexer)?;
    
    lexer.expect_symbol("(")?;
    let mut columns = Vec::new();
    
    loop {
        let col_name = parse_identifier(lexer)?;
        let data_type = parse_identifier(lexer)?; // Simple type parsing
        
        columns.push(ColumnDef {
            name: col_name,
            data_type,
        });
        
        let token = lexer.peek()?;
        if matches!(token, ParserToken::Symbol(s) if s == ",") {
            lexer.next()?;
        } else {
            break;
        }
    }
    
    lexer.expect_symbol(")")?;
    
    Ok(Statement::CreateTable(CreateTableStmt {
        table_name,
        columns,
        leading_comments,
    }))
}

fn parse_drop_statement(lexer: &mut Lexer, leading_comments: Vec<Comment>) -> Result<Statement, FormatError> {
    lexer.expect_keyword("DROP")?;
    
    if lexer.is_keyword("TABLE")? {
        lexer.expect_keyword("TABLE")?;
        let if_exists = if lexer.is_keyword("IF")? {
            lexer.expect_keyword("IF")?;
            lexer.expect_keyword("EXISTS")?;
            true
        } else {
            false
        };
        let table_name = parse_identifier(lexer)?;
        Ok(Statement::DropTable(DropTableStmt {
            table_name,
            if_exists,
            leading_comments,
        }))
    } else if lexer.is_keyword("VIEW")? {
        lexer.expect_keyword("VIEW")?;
        let if_exists = if lexer.is_keyword("IF")? {
            lexer.expect_keyword("IF")?;
            lexer.expect_keyword("EXISTS")?;
            true
        } else {
            false
        };
        let view_name = parse_identifier(lexer)?;
        Ok(Statement::DropView(DropViewStmt {
            view_name,
            if_exists,
            leading_comments,
        }))
    } else {
        Err(FormatError::new("Expected TABLE or VIEW after DROP"))
    }
}

fn parse_describe_statement(lexer: &mut Lexer, leading_comments: Vec<Comment>) -> Result<Statement, FormatError> {
    // DESCRIBE or DESC
    if lexer.is_keyword("DESCRIBE")? {
        lexer.expect_keyword("DESCRIBE")?;
    } else {
        lexer.expect_keyword("DESC")?;
    }
    
    let extended = if lexer.is_keyword("EXTENDED")? {
        lexer.expect_keyword("EXTENDED")?;
        true
    } else {
        false
    };
    
    // Optional TABLE keyword
    let _ = lexer.is_keyword("TABLE")?;
    if lexer.is_keyword("TABLE")? {
        lexer.expect_keyword("TABLE")?;
    }
    
    let table_name = parse_identifier(lexer)?;
    
    Ok(Statement::Describe(DescribeStmt {
        extended,
        table_name,
        leading_comments,
    }))
}

fn parse_show_statement(lexer: &mut Lexer, leading_comments: Vec<Comment>) -> Result<Statement, FormatError> {
    lexer.expect_keyword("SHOW")?;
    
    if lexer.is_keyword("TABLES")? {
        lexer.expect_keyword("TABLES")?;
        let in_database = if lexer.is_keyword("IN")? || lexer.is_keyword("FROM")? {
            lexer.next()?; // consume IN or FROM
            Some(parse_identifier(lexer)?)
        } else {
            None
        };
        Ok(Statement::ShowTables(ShowTablesStmt { in_database, leading_comments }))
    } else if lexer.is_keyword("DATABASES")? || lexer.is_keyword("SCHEMAS")? {
        lexer.next()?; // consume DATABASES or SCHEMAS
        Ok(Statement::ShowDatabases(ShowDatabasesStmt { leading_comments }))
    } else if lexer.is_keyword("VIEWS")? {
        lexer.expect_keyword("VIEWS")?;
        let in_database = if lexer.is_keyword("IN")? || lexer.is_keyword("FROM")? {
            lexer.next()?;
            Some(parse_identifier(lexer)?)
        } else {
            None
        };
        Ok(Statement::ShowViews(ShowViewsStmt { in_database, leading_comments }))
    } else if lexer.is_keyword("COLUMNS")? {
        lexer.expect_keyword("COLUMNS")?;
        lexer.expect_keyword("FROM")?;
        let table_name = parse_identifier(lexer)?;
        Ok(Statement::ShowColumns(ShowColumnsStmt { table_name, leading_comments }))
    } else {
        Err(FormatError::new("Expected TABLES, DATABASES, VIEWS, or COLUMNS after SHOW"))
    }
}

// DML Statement Parsers

fn parse_insert_statement(lexer: &mut Lexer, leading_comments: Vec<Comment>) -> Result<Statement, FormatError> {
    lexer.expect_keyword("INSERT")?;
    
    // Check for OVERWRITE vs INTO
    let is_overwrite = if lexer.is_keyword("OVERWRITE")? {
        lexer.expect_keyword("OVERWRITE")?;
        true
    } else {
        lexer.expect_keyword("INTO")?;
        false
    };
    
    let table_name = parse_identifier(lexer)?;
    
    // Check for VALUES vs SELECT
    if lexer.is_keyword("VALUES")? {
        lexer.expect_keyword("VALUES")?;
        let values = parse_values_list(lexer)?;
        Ok(Statement::InsertValues(InsertValuesStmt {
            table_name,
            values,
            leading_comments,
        }))
    } else {
        // It's a SELECT (or WITH SELECT)
        let query = parse_statement(lexer)?;
        if is_overwrite {
            Ok(Statement::InsertOverwrite(InsertOverwriteStmt {
                table_name,
                query: Box::new(query),
                leading_comments,
            }))
        } else {
            Ok(Statement::InsertInto(InsertIntoStmt {
                table_name,
                query: Box::new(query),
                leading_comments,
            }))
        }
    }
}

fn parse_delete_statement(lexer: &mut Lexer, leading_comments: Vec<Comment>) -> Result<Statement, FormatError> {
    lexer.expect_keyword("DELETE")?;
    lexer.expect_keyword("FROM")?;
    
    let table_name = parse_identifier(lexer)?;
    
    let where_clause = if lexer.is_keyword("WHERE")? {
        Some(parse_where_clause(lexer)?)
    } else {
        None
    };
    
    Ok(Statement::DeleteFrom(DeleteFromStmt {
        table_name,
        where_clause,
        leading_comments,
    }))
}

// Session Statement Parsers

fn parse_set_statement(lexer: &mut Lexer, leading_comments: Vec<Comment>) -> Result<Statement, FormatError> {
    lexer.expect_keyword("SET")?;
    
    // Parse key which might be dotted (e.g., spark.sql.shuffle.partitions)
    let mut key = parse_identifier(lexer)?;
    
    // Handle dotted identifiers
    while lexer.peek()? == ParserToken::Symbol(".".to_string()) {
        lexer.expect_symbol(".")?;
        key.push('.');
        key.push_str(&parse_identifier(lexer)?);
    }
    
    lexer.expect_symbol("=")?;
    
    // Value can be number or identifier
    let token = lexer.next()?;
    let value = match token {
        ParserToken::Word(w) => w,
        ParserToken::Number(n) => n,
        ParserToken::StringLiteral(s) => s,
        _ => return Err(FormatError::new("Expected value after =")),
    };
    
    Ok(Statement::SetConfig(SetConfigStmt {
        key,
        value,
        leading_comments,
    }))
}

fn parse_use_statement(lexer: &mut Lexer, leading_comments: Vec<Comment>) -> Result<Statement, FormatError> {
    lexer.expect_keyword("USE")?;
    
    // Optional DATABASE keyword
    if lexer.is_keyword("DATABASE")? {
        lexer.expect_keyword("DATABASE")?;
    }
    
    let database_name = parse_identifier(lexer)?;
    
    Ok(Statement::UseDatabase(UseDatabaseStmt {
        database_name,
        leading_comments,
    }))
}

// Helper Functions

fn parse_values_list(lexer: &mut Lexer) -> Result<Vec<Vec<String>>, FormatError> {
    let mut rows = Vec::new();
    
    loop {
        lexer.expect_symbol("(")?;
        let mut row = Vec::new();
        
        loop {
            // Collect value as string (simplified - just collect tokens until , or ))
            let token = lexer.next()?;
            match token {
                ParserToken::Number(n) => row.push(n),
                ParserToken::StringLiteral(s) => row.push(s),  // Already includes quotes
                ParserToken::Word(w) => row.push(w),
                _ => return Err(FormatError::new("Unexpected token in VALUES")),
            }
            
            let next = lexer.peek()?;
            if matches!(next, ParserToken::Symbol(s) if s == ",") {
                lexer.next()?; // consume comma
            } else {
                break;
            }
        }
        
        lexer.expect_symbol(")")?;
        rows.push(row);
        
        // Check for more rows
        let next = lexer.peek()?;
        if matches!(next, ParserToken::Symbol(s) if s == ",") {
            lexer.next()?; // consume comma
        } else {
            break;
        }
    }
    
    Ok(rows)
}

fn parse_expression_as_string(lexer: &mut Lexer) -> Result<String, FormatError> {
    let mut parts = Vec::new();
    let mut paren_depth = 0;
    
    loop {
        let token = lexer.peek()?;
        
        // Stop at comma (same level), WHERE, or EOF
        match &token {
            ParserToken::Symbol(s) if s == "," && paren_depth == 0 => break,
            ParserToken::Symbol(s) if s == "(" => paren_depth += 1,
            ParserToken::Symbol(s) if s == ")" => {
                if paren_depth == 0 {
                    break;
                }
                paren_depth -= 1;
            },
            ParserToken::Word(w) if paren_depth == 0 && is_clause_keyword(&w.to_uppercase()) => break,
            ParserToken::Eof => break,
            _ => {}
        }
        
        match lexer.next()? {
            ParserToken::Word(w) => parts.push(w),
            ParserToken::Symbol(s) => parts.push(s),
            ParserToken::Number(n) => parts.push(n),
            ParserToken::StringLiteral(s) => parts.push(s),  // Already includes quotes
            _ => {}
        }
    }
    
    // Join without spaces to match existing expression formatting (e.g., "x=1" not "x = 1")
    Ok(parts.join(""))
}

fn is_clause_keyword(word: &str) -> bool {
    matches!(word, "WHERE" | "SET" | "FROM" | "GROUP" | "ORDER" | "HAVING" | "LIMIT" | "UNION")
}

// New Statement Parsers

fn parse_update_statement(lexer: &mut Lexer, leading_comments: Vec<Comment>) -> Result<Statement, FormatError> {
    lexer.expect_keyword("UPDATE")?;
    let table_name = parse_identifier(lexer)?;
    lexer.expect_keyword("SET")?;
    
    let mut assignments = Vec::new();
    loop {
        let col = parse_identifier(lexer)?;
        lexer.expect_symbol("=")?;
        // Simplified: collect expression as string until , or WHERE or EOF
        let val = parse_expression_as_string(lexer)?;
        assignments.push((col, val));
        
        let next = lexer.peek()?;
        if matches!(next, ParserToken::Symbol(s) if s == ",") {
            lexer.next()?;
        } else {
            break;
        }
    }
    
    let where_clause = if lexer.is_keyword("WHERE")? {
        Some(parse_where_clause(lexer)?)
    } else {
        None
    };
    
    Ok(Statement::Update(UpdateStmt {
        table_name,
        assignments,
        where_clause,
        leading_comments,
    }))
}

fn parse_truncate_statement(lexer: &mut Lexer, leading_comments: Vec<Comment>) -> Result<Statement, FormatError> {
    lexer.expect_keyword("TRUNCATE")?;
    lexer.expect_keyword("TABLE")?;
    let table_name = parse_identifier(lexer)?;
    
    Ok(Statement::TruncateTable(TruncateTableStmt {
        table_name,
        leading_comments,
    }))
}

fn parse_alter_statement(lexer: &mut Lexer, leading_comments: Vec<Comment>) -> Result<Statement, FormatError> {
    lexer.expect_keyword("ALTER")?;
    lexer.expect_keyword("TABLE")?;
    let table_name = parse_identifier(lexer)?;
    
    // Collect rest of statement as string (ADD COLUMN, DROP COLUMN, RENAME, etc.)
    let mut action_parts = Vec::new();
    loop {
        match lexer.peek()? {
            ParserToken::Eof => break,
            ParserToken::Word(w) => {
                let word = w.clone();
                lexer.next()?;
                // Only uppercase if it's a keyword, preserve identifier casing
                if crate::keywords::is_keyword(&word) {
                    action_parts.push(word.to_uppercase());
                } else {
                    action_parts.push(word);
                }
            },
            ParserToken::Symbol(s) => {
                let sym = s.clone();
                lexer.next()?;
                action_parts.push(sym);
            },
            _ => {
                lexer.next()?;
            }
        }
    }
    
    Ok(Statement::AlterTable(AlterTableStmt {
        table_name,
        action: action_parts.join(" "),
        leading_comments,
    }))
}

fn parse_explain_statement(lexer: &mut Lexer, leading_comments: Vec<Comment>) -> Result<Statement, FormatError> {
    lexer.expect_keyword("EXPLAIN")?;
    
    // Check for mode: EXTENDED, CODEGEN, COST, FORMATTED
    let mode = if lexer.is_keyword("EXTENDED")? {
        lexer.next()?;
        Some("EXTENDED".to_string())
    } else if lexer.is_keyword("CODEGEN")? {
        lexer.next()?;
        Some("CODEGEN".to_string())
    } else if lexer.is_keyword("COST")? {
        lexer.next()?;
        Some("COST".to_string())
    } else if lexer.is_keyword("FORMATTED")? {
        lexer.next()?;
        Some("FORMATTED".to_string())
    } else {
        None
    };
    
    let query = parse_statement(lexer)?;
    
    Ok(Statement::Explain(ExplainStmt {
        mode,
        query: Box::new(query),
        leading_comments,
    }))
}

fn parse_cache_statement(lexer: &mut Lexer, leading_comments: Vec<Comment>) -> Result<Statement, FormatError> {
    lexer.expect_keyword("CACHE")?;
    
    let lazy = if lexer.is_keyword("LAZY")? {
        lexer.expect_keyword("LAZY")?;
        true
    } else {
        false
    };
    
    lexer.expect_keyword("TABLE")?;
    let table_name = parse_identifier(lexer)?;
    
    // Optional AS SELECT
    let query = if lexer.is_keyword("AS")? {
        lexer.expect_keyword("AS")?;
        Some(Box::new(parse_statement(lexer)?))
    } else {
        None
    };
    
    Ok(Statement::CacheTable(CacheTableStmt {
        lazy,
        table_name,
        query,
        leading_comments,
    }))
}

fn parse_uncache_statement(lexer: &mut Lexer, leading_comments: Vec<Comment>) -> Result<Statement, FormatError> {
    lexer.expect_keyword("UNCACHE")?;
    lexer.expect_keyword("TABLE")?;
    let table_name = parse_identifier(lexer)?;
    
    Ok(Statement::UncacheTable(UncacheTableStmt {
        table_name,
        leading_comments,
    }))
}

fn parse_refresh_statement(lexer: &mut Lexer, leading_comments: Vec<Comment>) -> Result<Statement, FormatError> {
    lexer.expect_keyword("REFRESH")?;
    lexer.expect_keyword("TABLE")?;
    let table_name = parse_identifier(lexer)?;
    
    Ok(Statement::Refresh(RefreshStmt {
        table_name,
        leading_comments,
    }))
}

fn parse_clear_cache_statement(lexer: &mut Lexer, leading_comments: Vec<Comment>) -> Result<Statement, FormatError> {
    lexer.expect_keyword("CLEAR")?;
    lexer.expect_keyword("CACHE")?;
    
    Ok(Statement::ClearCache(ClearCacheStmt { leading_comments }))
}

fn parse_analyze_statement(lexer: &mut Lexer, leading_comments: Vec<Comment>) -> Result<Statement, FormatError> {
    lexer.expect_keyword("ANALYZE")?;
    lexer.expect_keyword("TABLE")?;
    let table_name = parse_identifier(lexer)?;
    // Skip rest (COMPUTE STATISTICS, etc.)
    
    Ok(Statement::AnalyzeTable(AnalyzeTableStmt {
        table_name,
        leading_comments,
    }))
}

fn parse_reset_statement(lexer: &mut Lexer, leading_comments: Vec<Comment>) -> Result<Statement, FormatError> {
    lexer.expect_keyword("RESET")?;
    
    Ok(Statement::Reset(ResetStmt { leading_comments }))
}

fn parse_merge_statement(lexer: &mut Lexer, leading_comments: Vec<Comment>) -> Result<Statement, FormatError> {
    lexer.expect_keyword("MERGE")?;
    lexer.expect_keyword("INTO")?;
    let target_table = parse_identifier(lexer)?;
    
    // Optional alias
    let target_alias = if !lexer.is_keyword("USING")? {
        Some(parse_identifier(lexer)?)
    } else {
        None
    };
    
    lexer.expect_keyword("USING")?;
    let source_table = parse_identifier(lexer)?;
    
    // Optional alias
    let source_alias = if !lexer.is_keyword("ON")? {
        Some(parse_identifier(lexer)?)
    } else {
        None
    };
    
    lexer.expect_keyword("ON")?;
    
    // Collect ON condition as string until WHEN
    // Use smarter joining to avoid spaces around dots and operators
    let mut on_parts = Vec::new();
    loop {
        if lexer.is_keyword("WHEN")? {
            break;
        }
        match lexer.next()? {
            ParserToken::Word(w) => on_parts.push(w),
            ParserToken::Symbol(s) => on_parts.push(s),
            ParserToken::Number(n) => on_parts.push(n),
            ParserToken::StringLiteral(s) => on_parts.push(s),  // Already includes quotes
            ParserToken::QuotedIdentifier(s) => {
                on_parts.push(format!("`{}`", s));
            }
            ParserToken::Eof => break,
        }
    }
    // Join without spaces - formatter will handle spacing
    let on_condition = on_parts.join("");
    
    // Parse WHEN clauses (simplified - collect as strings)
    let mut when_matched = None;
    let mut when_not_matched = None;
    
    while lexer.is_keyword("WHEN")? {
        lexer.expect_keyword("WHEN")?;
        
        let is_not = if lexer.is_keyword("NOT")? {
            lexer.expect_keyword("NOT")?;
            true
        } else {
            false
        };
        
        lexer.expect_keyword("MATCHED")?;
        
        // Collect rest until next WHEN or EOF
        let mut clause_parts = vec![if is_not { "WHEN NOT MATCHED" } else { "WHEN MATCHED" }.to_string()];
        let mut prev_was_keyword = true;  // Track if previous token was a keyword
        
        loop {
            if lexer.is_keyword("WHEN")? || matches!(lexer.peek()?, ParserToken::Eof) {
                break;
            }
            match lexer.next()? {
                ParserToken::Word(w) => {
                    let is_kw = crate::keywords::is_keyword(&w);
                    let word_str = if is_kw {
                        w.to_uppercase()
                    } else {
                        w
                    };
                    
                    // Add space before if previous was keyword or current is keyword
                    if prev_was_keyword || is_kw {
                        clause_parts.push(" ".to_string());
                    }
                    clause_parts.push(word_str);
                    prev_was_keyword = is_kw;
                },
                ParserToken::Symbol(s) => {
                    clause_parts.push(s);
                    prev_was_keyword = false;
                },
                ParserToken::Number(n) => {
                    clause_parts.push(n);
                    prev_was_keyword = false;
                },
                ParserToken::StringLiteral(s) => {
                    clause_parts.push(s);
                    prev_was_keyword = false;
                },
                _ => {}
            }
        }
        
        // Join directly as spacing is already added
        if is_not {
            when_not_matched = Some(clause_parts.join(""));
        } else {
            when_matched = Some(clause_parts.join(""));
        }
    }
    
    Ok(Statement::Merge(MergeStmt {
        target_table,
        target_alias,
        source_table,
        source_alias,
        on_condition,
        when_matched,
        when_not_matched,
        leading_comments,
    }))
}
