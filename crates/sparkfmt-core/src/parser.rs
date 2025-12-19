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
    Ok(statement)
}

#[derive(Debug, Clone, PartialEq)]
enum Token {
    Word(String), // Unified token for keywords and identifiers (preserves original casing)
    Symbol(String),
    Number(String),
    StringLiteral(String),
    Eof,
}

#[derive(Debug, Clone)]
struct CommentInfo {
    text: String,
    line: usize,
    col: usize,
    is_line_comment: bool,
    is_hint: bool,
}

#[derive(Debug, Clone)]
struct TokenInfo {
    line: usize,
    col: usize,
}

struct Lexer {
    input: String,
    pos: usize,
    line: usize,
    col: usize,
    peeked: Option<Token>,
    comments: Vec<CommentInfo>,
    last_token_info: Option<TokenInfo>,
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
            last_token_info: None,
        }
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
            
            // Collect single-line comments BUT DON'T CONTINUE - let them be trailing
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
                    // STOP here - don't continue skipping on the next line
                    break;
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

    fn peek(&mut self) -> Result<Token, FormatError> {
        if let Some(ref token) = self.peeked {
            return Ok(token.clone());
        }
        
        let token = self.next_token()?;
        self.peeked = Some(token.clone());
        Ok(token)
    }

    fn next(&mut self) -> Result<Token, FormatError> {
        if let Some(token) = self.peeked.take() {
            return Ok(token);
        }
        self.next_token()
    }

    fn next_token(&mut self) -> Result<Token, FormatError> {
        self.skip_whitespace();
        
        // Record token position
        let token_line = self.line;
        let token_col = self.col;
        
        if self.pos >= self.input.len() {
            return Ok(Token::Eof);
        }
        
        let remaining = &self.input[self.pos..];
        
        // Try string literal
        if let Some(m) = STRING_LITERAL.find(remaining) {
            let token = Token::StringLiteral(m.as_str().to_string());
            self.advance_by(m.end());
            self.last_token_info = Some(TokenInfo { line: token_line, col: token_col });
            return Ok(token);
        }
        
        // Try number
        if let Some(m) = NUMBER.find(remaining) {
            let token = Token::Number(m.as_str().to_string());
            self.advance_by(m.end());
            self.last_token_info = Some(TokenInfo { line: token_line, col: token_col });
            return Ok(token);
        }
        
        // Try identifier or keyword - store with original casing
        if let Some(m) = IDENTIFIER.find(remaining) {
            let text = m.as_str().to_string();
            self.advance_by(m.end());
            self.last_token_info = Some(TokenInfo { line: token_line, col: token_col });
            return Ok(Token::Word(text)); // Preserve original casing
        }
        
        // Try multi-char operators first (longest match first)
        for symbol in &["<=", ">=", "<>", "!=", "||"] {
            if remaining.starts_with(symbol) {
                self.advance_by(symbol.len());
                self.last_token_info = Some(TokenInfo { line: token_line, col: token_col });
                return Ok(Token::Symbol(symbol.to_string()));
            }
        }
        
        // Try single-char symbols
        for symbol in &["(", ")", ",", ".", "*", "=", "<", ">", "!", "+", "-", "/", "|"] {
            if remaining.starts_with(symbol) {
                self.advance_by(symbol.len());
                self.last_token_info = Some(TokenInfo { line: token_line, col: token_col });
                return Ok(Token::Symbol(symbol.to_string()));
            }
        }
        
        Err(FormatError::new(format!("Unexpected character at position {}", self.pos)))
    }

    fn expect_keyword(&mut self, keyword: &str) -> Result<(), FormatError> {
        let token = self.next()?;
        match token {
            Token::Word(w) if w.to_uppercase() == keyword.to_uppercase() => Ok(()),
            _ => Err(FormatError::new(format!("Expected keyword {}, got {:?}", keyword, token))),
        }
    }

    fn is_keyword(&mut self, keyword: &str) -> Result<bool, FormatError> {
        let token = self.peek()?;
        Ok(matches!(token, Token::Word(w) if w.to_uppercase() == keyword.to_uppercase()))
    }
    
    fn parse_identifier(&mut self) -> Result<String, FormatError> {
        let token = self.next()?;
        match token {
            Token::Word(w) => Ok(w), // Return original casing
            _ => Err(FormatError::new(format!("Expected identifier, got {:?}", token))),
        }
    }

    fn expect_symbol(&mut self, symbol: &str) -> Result<(), FormatError> {
        let token = self.next()?;
        match token {
            Token::Symbol(s) if s == symbol => Ok(()),
            _ => Err(FormatError::new(format!("Expected symbol {}, got {:?}", symbol, token))),
        }
    }
}

fn parse_statement(lexer: &mut Lexer) -> Result<Statement, FormatError> {
    // Check for WITH clause
    let with_clause = if lexer.is_keyword("WITH")? {
        Some(parse_with_clause(lexer)?)
    } else {
        None
    };
    
    // Parse the main SELECT
    let select = parse_select_query(lexer, with_clause)?;
    
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
        if matches!(token, Token::Symbol(s) if s == ",") {
            lexer.next()?;
        } else {
            break;
        }
    }
    
    Ok(WithClause { ctes })
}

fn parse_select_query(lexer: &mut Lexer, with_clause: Option<WithClause>) -> Result<SelectQuery, FormatError> {
    lexer.expect_keyword("SELECT")?;
    
    // Collect any leading comments that appeared before SELECT
    let mut leading_comments = Vec::new();
    for comment in &lexer.comments {
        if !comment.is_hint {
            leading_comments.push(Comment {
                text: comment.text.clone(),
                is_line_comment: comment.is_line_comment,
                attachment: CommentAttachment::Leading,
            });
        }
    }
    lexer.comments.clear();
    
    let distinct = if lexer.is_keyword("DISTINCT")? {
        lexer.expect_keyword("DISTINCT")?;
        true
    } else {
        false
    };
    
    // NOW check for hint comment - it appears after SELECT but before the select list
    // When we peek/parse the next token, any hint will be collected
    let select_list = parse_select_list_with_comments(lexer)?;
    
    // Extract hint comment if any was collected
    let hint_comment = lexer.comments.iter()
        .find(|c| c.is_hint)
        .map(|c| format_hint_comment(&c.text));
    
    // Clear all comments after extracting hint
    lexer.comments.clear();
    
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
                Token::Word(_) => {
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
        let has_comma = matches!(token, Token::Symbol(s) if s == ",");
        
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
    // Find and remove the first line comment that's on the same line
    if let Some(idx) = lexer.comments.iter().position(|c| {
        c.is_line_comment && c.line == line
    }) {
        let comment = lexer.comments.remove(idx);
        return Some(Comment {
            text: comment.text,
            is_line_comment: true,
            attachment: CommentAttachment::TrailingInline,
        });
    }
    None
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
    
    let token = lexer.peek()?;
    if matches!(token, Token::Symbol(s) if matches!(s.as_str(), "=" | "<" | ">" | "<=" | ">=" | "<>" | "!=")) {
        let op = match lexer.next()? {
            Token::Symbol(s) => s,
            _ => unreachable!(),
        };
        let right = parse_additive_expression(lexer)?;
        left = Expression::BinaryOp {
            left: Box::new(left),
            op,
            right: Box::new(right),
        };
    }
    
    Ok(left)
}

fn parse_additive_expression(lexer: &mut Lexer) -> Result<Expression, FormatError> {
    let mut left = parse_multiplicative_expression(lexer)?;
    
    loop {
        let token = lexer.peek()?;
        if matches!(token, Token::Symbol(s) if s == "+" || s == "-") {
            let op = match lexer.next()? {
                Token::Symbol(s) => s,
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
    let mut left = parse_primary_expression(lexer)?;
    
    loop {
        let token = lexer.peek()?;
        if matches!(token, Token::Symbol(s) if s == "*" || s == "/") {
            let op = match lexer.next()? {
                Token::Symbol(s) => s,
                _ => unreachable!(),
            };
            let right = parse_primary_expression(lexer)?;
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

fn parse_primary_expression(lexer: &mut Lexer) -> Result<Expression, FormatError> {
    let token = lexer.peek()?;
    
    match token {
        Token::Symbol(s) if s == "(" => {
            lexer.next()?;
            let expr = parse_expression(lexer)?;
            lexer.expect_symbol(")")?;
            Ok(Expression::Parenthesized(Box::new(expr)))
        }
        Token::StringLiteral(_) | Token::Number(_) => {
            let lit = match lexer.next()? {
                Token::StringLiteral(s) => s,
                Token::Number(n) => n,
                _ => unreachable!(),
            };
            Ok(Expression::Literal(lit))
        }
        Token::Symbol(s) if s == "*" => {
            lexer.next()?;
            Ok(Expression::Star)
        }
        Token::Word(_) => {
            let name = lexer.parse_identifier()?;
            
            // Check for function call or qualified identifier
            let token = lexer.peek()?;
            let is_open_paren = matches!(&token, Token::Symbol(s) if s == "(");
            let is_dot = matches!(&token, Token::Symbol(s) if s == ".");
            
            if is_open_paren {
                lexer.next()?;
                let mut args = Vec::new();
                
                // Check for empty args
                let token = lexer.peek()?;
                if !matches!(token, Token::Symbol(s) if s == ")") {
                    loop {
                        args.push(parse_expression(lexer)?);
                        
                        let token = lexer.peek()?;
                        if matches!(token, Token::Symbol(s) if s == ",") {
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
                if matches!(token, Token::Symbol(s) if s == "*") {
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
    Ok(matches!(token, Token::Word(w) if matches!(w.to_uppercase().as_str(), "INNER" | "LEFT" | "RIGHT" | "FULL" | "CROSS" | "JOIN")))
}

fn parse_join(lexer: &mut Lexer) -> Result<Join, FormatError> {
    let join_type = if lexer.is_keyword("INNER")? {
        lexer.expect_keyword("INNER")?;
        lexer.expect_keyword("JOIN")?;
        JoinType::Inner
    } else if lexer.is_keyword("LEFT")? {
        lexer.expect_keyword("LEFT")?;
        if lexer.is_keyword("OUTER")? {
            lexer.expect_keyword("OUTER")?;
        }
        lexer.expect_keyword("JOIN")?;
        JoinType::Left
    } else if lexer.is_keyword("RIGHT")? {
        lexer.expect_keyword("RIGHT")?;
        if lexer.is_keyword("OUTER")? {
            lexer.expect_keyword("OUTER")?;
        }
        lexer.expect_keyword("JOIN")?;
        JoinType::Right
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
    
    if lexer.is_keyword("ON")? {
        lexer.expect_keyword("ON")?;
        on_conditions = parse_conditions(lexer)?;
    }
    
    Ok(Join {
        join_type,
        table,
        on_conditions,
    })
}

fn parse_table_ref(lexer: &mut Lexer) -> Result<TableRef, FormatError> {
    let name = parse_identifier(lexer)?;
    
    let alias = if lexer.is_keyword("AS")? {
        lexer.expect_keyword("AS")?;
        Some(lexer.parse_identifier()?)
    } else {
        // Check for implicit alias
        let token = lexer.peek()?;
        match token {
            Token::Word(_) => {
                // Make sure it's not a keyword
                if !is_join_keyword(lexer)? && !lexer.is_keyword("ON")? && 
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
    
    Ok(TableRef { name, alias })
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
    let expr = parse_comparison_expression(lexer)?;
    conditions.push(Condition {
        expr,
        logical_op: None,
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
        
        let expr = parse_comparison_expression(lexer)?;
        conditions.push(Condition {
            expr,
            logical_op,
        });
    }
    
    Ok(conditions)
}

fn parse_group_by_clause(lexer: &mut Lexer) -> Result<GroupByClause, FormatError> {
    lexer.expect_keyword("GROUP")?;
    lexer.expect_keyword("BY")?;
    
    let mut items = Vec::new();
    
    loop {
        items.push(parse_expression(lexer)?);
        
        let token = lexer.peek()?;
        if matches!(token, Token::Symbol(s) if s == ",") {
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
        if matches!(token, Token::Symbol(s) if s == ",") {
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
        Token::Number(n) => n,
        _ => return Err(FormatError::new("Expected number after LIMIT")),
    };
    Ok(LimitClause { count })
}
