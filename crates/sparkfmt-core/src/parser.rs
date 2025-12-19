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
    
    // TODO: Anchor comments to statement nodes
    // For now, comments are extracted but not yet anchored/printed
    // This is a foundation for the full comment anchoring system
    
    Ok(statement)
}

#[derive(Debug, Clone, PartialEq)]
enum Token {
    Word(String), // Unified token for keywords and identifiers (preserves original casing)
    Symbol(String),
    Number(String),
    StringLiteral(String),
    HintComment(String), // Query hint: /*+ ... */
    Eof,
}

struct Lexer {
    input: String,
    pos: usize,
    peeked: Option<Token>,
    comments: Vec<(String, bool)>, // (text, is_line_comment)
}

impl Lexer {
    fn new(input: &str) -> Self {
        Self {
            input: input.to_string(),
            pos: 0,
            peeked: None,
            comments: Vec::new(),
        }
    }

    fn skip_whitespace(&mut self) {
        while self.pos < self.input.len() {
            let remaining = &self.input[self.pos..];
            
            // Collect single-line comments
            if remaining.starts_with("--") {
                if let Some(newline_pos) = remaining.find('\n') {
                    let comment_text = remaining[..newline_pos].to_string();
                    self.comments.push((comment_text, true));
                    self.pos += newline_pos + 1;
                } else {
                    let comment_text = remaining.to_string();
                    self.comments.push((comment_text, true));
                    self.pos = self.input.len();
                }
                continue;
            }
            
            // Collect hint comments (/*+ ... */)
            if remaining.starts_with("/*+") {
                if let Some(end_pos) = remaining.find("*/") {
                    let comment_text = remaining[..end_pos + 2].to_string();
                    self.comments.push((comment_text, false)); // Store as comment for now
                    self.pos += end_pos + 2;
                } else {
                    let comment_text = remaining.to_string();
                    self.comments.push((comment_text, false));
                    self.pos = self.input.len();
                }
                continue;
            }
            
            // Collect multi-line comments (regular /* ... */)
            if remaining.starts_with("/*") {
                if let Some(end_pos) = remaining.find("*/") {
                    let comment_text = remaining[..end_pos + 2].to_string();
                    self.comments.push((comment_text, false));
                    self.pos += end_pos + 2;
                } else {
                    let comment_text = remaining.to_string();
                    self.comments.push((comment_text, false));
                    self.pos = self.input.len();
                }
                continue;
            }
            
            // Skip whitespace
            if let Some(m) = WHITESPACE.find(remaining) {
                self.pos += m.end();
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
        
        if self.pos >= self.input.len() {
            return Ok(Token::Eof);
        }
        
        let remaining = &self.input[self.pos..];
        
        // Try string literal
        if let Some(m) = STRING_LITERAL.find(remaining) {
            let token = Token::StringLiteral(m.as_str().to_string());
            self.pos += m.end();
            return Ok(token);
        }
        
        // Try number
        if let Some(m) = NUMBER.find(remaining) {
            let token = Token::Number(m.as_str().to_string());
            self.pos += m.end();
            return Ok(token);
        }
        
        // Try identifier or keyword - store with original casing
        if let Some(m) = IDENTIFIER.find(remaining) {
            let text = m.as_str().to_string();
            self.pos += m.end();
            return Ok(Token::Word(text)); // Preserve original casing
        }
        
        // Try multi-char operators first (longest match first)
        for symbol in &["<=", ">=", "<>", "!=", "||"] {
            if remaining.starts_with(symbol) {
                self.pos += symbol.len();
                return Ok(Token::Symbol(symbol.to_string()));
            }
        }
        
        // Try single-char symbols
        for symbol in &["(", ")", ",", ".", "*", "=", "<", ">", "!", "+", "-", "/", "|"] {
            if remaining.starts_with(symbol) {
                self.pos += symbol.len();
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
    
    let distinct = if lexer.is_keyword("DISTINCT")? {
        lexer.expect_keyword("DISTINCT")?;
        true
    } else {
        false
    };
    
    let select_list = parse_select_list(lexer)?;
    
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
    })
}

fn parse_select_list(lexer: &mut Lexer) -> Result<Vec<SelectItem>, FormatError> {
    let mut items = Vec::new();
    
    loop {
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
        
        items.push(SelectItem { expr, alias });
        
        // Check for comma
        let token = lexer.peek()?;
        if matches!(token, Token::Symbol(s) if s == ",") {
            lexer.next()?;
        } else {
            break;
        }
    }
    
    Ok(items)
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
