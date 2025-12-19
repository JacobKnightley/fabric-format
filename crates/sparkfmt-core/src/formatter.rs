use crate::ir::*;
use crate::functions;

const BASE_INDENT: usize = 4;
const FIRST_ITEM_INDENT: usize = 5;

pub fn format(statement: &Statement) -> String {
    let mut output = String::new();
    format_statement(statement, &mut output, 0);
    
    // Remove trailing whitespace and ensure no trailing newline
    output = output.trim_end().to_string();
    
    output
}

fn format_statement(statement: &Statement, output: &mut String, indent: usize) {
    match statement {
        Statement::Select(query) => format_select_query(query, output, indent),
        Statement::SetOperation(op) => format_set_operation(op, output, indent),
    }
}

fn format_set_operation(op: &SetOperation, output: &mut String, indent: usize) {
    format_select_query(&op.left, output, indent);
    output.push('\n');
    
    match op.op {
        SetOperator::Union => output.push_str("UNION"),
        SetOperator::UnionAll => output.push_str("UNION ALL"),
    }
    output.push('\n');
    
    format_statement(&op.right, output, indent);
}

fn format_select_query(query: &SelectQuery, output: &mut String, indent: usize) {
    // Format WITH clause
    if let Some(ref with_clause) = query.with_clause {
        format_with_clause(with_clause, output, indent);
    }
    
    // Format leading comments
    for comment in &query.leading_comments {
        format_comment(comment, output, indent);
    }
    
    // SELECT keyword
    if query.distinct {
        output.push_str("SELECT DISTINCT");
    } else {
        output.push_str("SELECT");
    }
    
    // Format hint comment immediately after SELECT
    if let Some(ref hint) = query.hint_comment {
        output.push(' ');
        output.push_str(hint);
    }
    
    output.push('\n');
    
    // Select list (comma-first style)
    format_select_list(&query.select_list, output, indent);
    
    // FROM clause
    if let Some(ref from) = query.from {
        format_from_clause(from, output, indent);
    }
    
    // WHERE clause
    if let Some(ref where_clause) = query.where_clause {
        output.push('\n');
        format_where_clause(where_clause, output, indent);
    }
    
    // GROUP BY clause
    if let Some(ref group_by) = query.group_by {
        output.push('\n');
        format_group_by_clause(group_by, output, indent);
    }
    
    // HAVING clause
    if let Some(ref having) = query.having {
        output.push('\n');
        format_having_clause(having, output, indent);
    }
    
    // ORDER BY clause
    if let Some(ref order_by) = query.order_by {
        output.push('\n');
        format_order_by_clause(order_by, output, indent);
    }
    
    // LIMIT clause
    if let Some(ref limit) = query.limit {
        output.push('\n');
        format_limit_clause(limit, output, indent);
    }
}

fn format_comment(comment: &Comment, output: &mut String, indent: usize) {
    match comment.attachment {
        CommentAttachment::TrailingInline => {
            // Will be handled inline with the code
        }
        CommentAttachment::TrailingOwnLine | CommentAttachment::Leading => {
            output.push_str(&" ".repeat(indent));
            output.push_str(&comment.text);
            output.push('\n');
        }
    }
}

fn format_with_clause(with_clause: &WithClause, output: &mut String, indent: usize) {
    output.push_str("WITH ");
    
    for (i, cte) in with_clause.ctes.iter().enumerate() {
        if i > 0 {
            output.push('\n');
            output.push(',');
        }
        
        output.push_str(&cte.name);
        output.push_str(" AS (");
        output.push('\n');
        
        format_statement(&cte.query, output, indent + BASE_INDENT);
        
        output.push('\n');
        output.push(')');
    }
    output.push('\n');
}

fn format_select_list(items: &[SelectItem], output: &mut String, _indent: usize) {
    for (i, item) in items.iter().enumerate() {
        if i == 0 {
            // First item: indent with FIRST_ITEM_INDENT spaces
            output.push_str(&" ".repeat(FIRST_ITEM_INDENT));
        } else {
            // Subsequent items: comma-first with BASE_INDENT
            output.push_str(&" ".repeat(BASE_INDENT));
            output.push(',');
        }
        
        format_expression(&item.expr, output);
        
        // Always use AS for column aliases
        if let Some(ref alias) = item.alias {
            output.push_str(" AS ");
            output.push_str(alias);
        }
        
        // Format trailing inline comment
        if let Some(ref comment) = item.trailing_comment {
            if matches!(comment.attachment, CommentAttachment::TrailingInline) {
                output.push(' ');
                output.push_str(&comment.text);
            }
        }
        
        output.push('\n');
    }
}

fn format_expression(expr: &Expression, output: &mut String) {
    match expr {
        Expression::Identifier(id) => output.push_str(id),
        Expression::Star => output.push('*'),
        Expression::QualifiedStar(qualifier) => {
            output.push_str(qualifier);
            output.push_str(".*");
        }
        Expression::FunctionCall { name, args } => {
            // Built-in functions are UPPERCASE, user-defined functions preserve casing
            let formatted_name = if functions::is_builtin_function(name) {
                name.to_uppercase()
            } else {
                name.clone()
            };
            output.push_str(&formatted_name);
            output.push('(');
            for (i, arg) in args.iter().enumerate() {
                if i > 0 {
                    output.push(',');
                }
                format_expression(arg, output);
            }
            output.push(')');
        }
        Expression::BinaryOp { left, op, right } => {
            format_expression(left, output);
            // Don't add spaces around operators - keep them compact
            output.push_str(op);
            format_expression(right, output);
        }
        Expression::Literal(lit) => output.push_str(lit),
        Expression::Parenthesized(expr) => {
            output.push('(');
            format_expression(expr, output);
            output.push(')');
        }
    }
}

fn format_from_clause(from: &FromClause, output: &mut String, indent: usize) {
    output.push_str("FROM ");
    output.push_str(&from.table.name);
    
    // Table aliases never use AS
    if let Some(ref alias) = from.table.alias {
        output.push(' ');
        output.push_str(alias);
    }
    
    // Format joins
    for join in &from.joins {
        output.push('\n');
        format_join(join, output, indent);
    }
}

fn format_join(join: &Join, output: &mut String, _indent: usize) {
    // JOIN keywords start at column 0
    match join.join_type {
        JoinType::Inner => output.push_str("INNER JOIN "),
        JoinType::Left => output.push_str("LEFT JOIN "),
        JoinType::Right => output.push_str("RIGHT JOIN "),
        JoinType::Full => output.push_str("FULL JOIN "),
        JoinType::Cross => output.push_str("CROSS JOIN "),
    }
    
    output.push_str(&join.table.name);
    
    // Table aliases never use AS
    if let Some(ref alias) = join.table.alias {
        output.push(' ');
        output.push_str(alias);
    }
    
    // Format ON conditions
    if !join.on_conditions.is_empty() {
        for (i, condition) in join.on_conditions.iter().enumerate() {
            output.push('\n');
            output.push_str(&" ".repeat(BASE_INDENT));
            
            if i == 0 {
                output.push_str("ON ");
            } else {
                // Operator-leading for AND/OR
                if let Some(ref logical_op) = condition.logical_op {
                    match logical_op {
                        LogicalOp::And => output.push_str("AND "),
                        LogicalOp::Or => output.push_str("OR "),
                    }
                }
            }
            
            format_expression(&condition.expr, output);
        }
    }
}

fn format_where_clause(where_clause: &WhereClause, output: &mut String, _indent: usize) {
    // If there's only one condition (no AND/OR), keep inline
    if where_clause.conditions.len() == 1 {
        output.push_str("WHERE ");
        format_expression(&where_clause.conditions[0].expr, output);
    } else {
        // Multiple conditions: each on its own line
        output.push_str("WHERE");
        for (i, condition) in where_clause.conditions.iter().enumerate() {
            output.push('\n');
            output.push_str(&" ".repeat(BASE_INDENT));
            
            if i > 0 {
                // Operator-leading for AND/OR
                if let Some(ref logical_op) = condition.logical_op {
                    match logical_op {
                        LogicalOp::And => output.push_str("AND "),
                        LogicalOp::Or => output.push_str("OR "),
                    }
                }
            }
            
            format_expression(&condition.expr, output);
        }
    }
}

fn format_having_clause(having: &HavingClause, output: &mut String, _indent: usize) {
    // If there's only one condition (no AND/OR), keep inline
    if having.conditions.len() == 1 {
        output.push_str("HAVING ");
        format_expression(&having.conditions[0].expr, output);
    } else {
        // Multiple conditions: each on its own line
        output.push_str("HAVING");
        for (i, condition) in having.conditions.iter().enumerate() {
            output.push('\n');
            output.push_str(&" ".repeat(BASE_INDENT));
            
            if i > 0 {
                // Operator-leading for AND/OR
                if let Some(ref logical_op) = condition.logical_op {
                    match logical_op {
                        LogicalOp::And => output.push_str("AND "),
                        LogicalOp::Or => output.push_str("OR "),
                    }
                }
            }
            
            format_expression(&condition.expr, output);
        }
    }
}

fn format_group_by_clause(group_by: &GroupByClause, output: &mut String, _indent: usize) {
    output.push_str("GROUP BY");
    
    for (i, item) in group_by.items.iter().enumerate() {
        output.push('\n');
        
        if i == 0 {
            // First item: indent with FIRST_ITEM_INDENT spaces
            output.push_str(&" ".repeat(FIRST_ITEM_INDENT));
        } else {
            // Subsequent items: comma-first with BASE_INDENT
            output.push_str(&" ".repeat(BASE_INDENT));
            output.push(',');
        }
        
        format_expression(item, output);
    }
}

fn format_order_by_clause(order_by: &OrderByClause, output: &mut String, _indent: usize) {
    output.push_str("ORDER BY");
    
    for (i, item) in order_by.items.iter().enumerate() {
        output.push('\n');
        
        if i == 0 {
            // First item: indent with FIRST_ITEM_INDENT spaces
            output.push_str(&" ".repeat(FIRST_ITEM_INDENT));
        } else {
            // Subsequent items: comma-first with BASE_INDENT
            output.push_str(&" ".repeat(BASE_INDENT));
            output.push(',');
        }
        
        format_expression(&item.expr, output);
        
        // Preserve existing ASC/DESC
        if let Some(ref direction) = item.direction {
            match direction {
                OrderDirection::Asc => output.push_str(" ASC"),
                OrderDirection::Desc => output.push_str(" DESC"),
            }
        }
    }
}

fn format_limit_clause(limit: &LimitClause, output: &mut String, _indent: usize) {
    output.push_str("LIMIT ");
    output.push_str(&limit.count);
}
