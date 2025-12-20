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
        Statement::CreateTable(stmt) => format_create_table(stmt, output, indent),
        Statement::CreateView(stmt) => format_create_view(stmt, output, indent),
        Statement::DropTable(stmt) => format_drop_table(stmt, output, indent),
        Statement::DropView(stmt) => format_drop_view(stmt, output, indent),
        Statement::AlterTable(stmt) => format_alter_table(stmt, output, indent),
        Statement::TruncateTable(stmt) => format_truncate_table(stmt, output, indent),
        Statement::Describe(stmt) => format_describe(stmt, output, indent),
        Statement::ShowTables(stmt) => format_show_tables(stmt, output, indent),
        Statement::ShowDatabases(stmt) => format_show_databases(stmt, output, indent),
        Statement::ShowViews(stmt) => format_show_views(stmt, output, indent),
        Statement::ShowColumns(stmt) => format_show_columns(stmt, output, indent),
        Statement::InsertInto(stmt) => format_insert_into(stmt, output, indent),
        Statement::InsertOverwrite(stmt) => format_insert_overwrite(stmt, output, indent),
        Statement::InsertValues(stmt) => format_insert_values(stmt, output, indent),
        Statement::Update(stmt) => format_update(stmt, output, indent),
        Statement::DeleteFrom(stmt) => format_delete_from(stmt, output, indent),
        Statement::Merge(stmt) => format_merge(stmt, output, indent),
        Statement::Explain(stmt) => format_explain(stmt, output, indent),
        Statement::Refresh(stmt) => format_refresh(stmt, output, indent),
        Statement::CacheTable(stmt) => format_cache_table(stmt, output, indent),
        Statement::UncacheTable(stmt) => format_uncache_table(stmt, output, indent),
        Statement::ClearCache(stmt) => format_clear_cache(stmt, output, indent),
        Statement::AnalyzeTable(stmt) => format_analyze_table(stmt, output, indent),
        Statement::SetConfig(stmt) => format_set_config(stmt, output, indent),
        Statement::Reset(stmt) => format_reset(stmt, output, indent),
        Statement::UseDatabase(stmt) => format_use_database(stmt, output, indent),
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
    
    // SELECT keyword with indentation
    output.push_str(&" ".repeat(indent));
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
    
    // Emit fallback comments (unconsumed comments from this query)
    for comment in &query.fallback_comments {
        output.push('\n');
        format_comment(comment, output, indent);
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

fn format_select_list(items: &[SelectItem], output: &mut String, indent: usize) {
    for (i, item) in items.iter().enumerate() {
        if i == 0 {
            // First item: indent + FIRST_ITEM_INDENT spaces
            output.push_str(&" ".repeat(indent + FIRST_ITEM_INDENT));
        } else {
            // Subsequent items: comma-first with indent + BASE_INDENT
            output.push_str(&" ".repeat(indent + BASE_INDENT));
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
        Expression::QuotedIdentifier(name) => {
            output.push('`');
            output.push_str(name);
            output.push('`');
        }
        Expression::Star => output.push('*'),
        Expression::QualifiedStar(qualifier) => {
            output.push_str(qualifier);
            output.push_str(".*");
        }
        Expression::FunctionCall { name, args } => {
            // Empty name means it's just a comma-separated list (used in GROUPING SETS)
            if name.is_empty() {
                for (i, arg) in args.iter().enumerate() {
                    if i > 0 {
                        output.push(',');
                    }
                    format_expression(arg, output);
                }
            } else {
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
        }
        Expression::BinaryOp { left, op, right } => {
            format_expression(left, output);
            // Add spaces around multi-word operators like IS DISTINCT FROM
            if op.contains(" ") {
                output.push(' ');
                output.push_str(op);
                output.push(' ');
            } else {
                // Don't add spaces around regular operators - keep them compact
                output.push_str(op);
            }
            format_expression(right, output);
        }
        Expression::UnaryOp { op, expr } => {
            output.push_str(op);
            if op == "NOT" {
                output.push(' ');
            }
            format_expression(expr, output);
        }
        Expression::Literal(lit) => output.push_str(lit),
        Expression::TypedLiteral { type_name, value } => {
            // Format as TYPE 'value' or TYPE value unit (for INTERVAL)
            output.push_str(&type_name.to_uppercase());
            output.push(' ');
            // For INTERVAL, uppercase the unit as well
            if type_name.eq_ignore_ascii_case("INTERVAL") && !value.starts_with('\'') {
                // Parse number and unit separately
                let parts: Vec<&str> = value.split_whitespace().collect();
                if parts.len() >= 2 {
                    output.push_str(parts[0]); // number
                    output.push(' ');
                    output.push_str(&parts[1..].join(" ").to_uppercase()); // unit(s)
                } else {
                    output.push_str(value);
                }
            } else {
                output.push_str(value);
            }
        }
        Expression::Parenthesized(expr) => {
            output.push('(');
            format_expression(expr, output);
            output.push(')');
        }
        Expression::Case { operand, when_clauses, else_clause } => {
            output.push_str("CASE");
            if let Some(op) = operand {
                output.push(' ');
                format_expression(op, output);
            }
            for wc in when_clauses {
                output.push_str(" WHEN ");
                format_expression(&wc.condition, output);
                output.push_str(" THEN ");
                format_expression(&wc.result, output);
            }
            if let Some(el) = else_clause {
                output.push_str(" ELSE ");
                format_expression(el, output);
            }
            output.push_str(" END");
        }
        Expression::Cast { expr, data_type, pg_style } => {
            if *pg_style {
                format_expression(expr, output);
                output.push_str("::");
                output.push_str(&data_type.to_uppercase());
            } else {
                output.push_str("CAST(");
                format_expression(expr, output);
                output.push_str(" AS ");
                output.push_str(&data_type.to_uppercase());
                output.push(')');
            }
        }
        Expression::WindowFunction { function, partition_by, order_by, frame } => {
            format_expression(function, output);
            output.push_str(" OVER (");
            
            if !partition_by.is_empty() {
                output.push_str("PARTITION BY ");
                for (i, e) in partition_by.iter().enumerate() {
                    if i > 0 { output.push(','); }
                    format_expression(e, output);
                }
            }
            
            if !order_by.is_empty() {
                if !partition_by.is_empty() { output.push(' '); }
                output.push_str("ORDER BY ");
                for (i, item) in order_by.iter().enumerate() {
                    if i > 0 { output.push(','); }
                    format_expression(&item.expr, output);
                    if let Some(ref direction) = item.direction {
                        match direction {
                            OrderDirection::Asc => output.push_str(" ASC"),
                            OrderDirection::Desc => output.push_str(" DESC"),
                        }
                    }
                }
            }
            
            if let Some(f) = frame {
                output.push(' ');
                output.push_str(&f.unit);
                output.push(' ');
                // Add BETWEEN keyword when there's a range with both start and end
                if f.end.is_some() {
                    output.push_str("BETWEEN ");
                }
                output.push_str(&f.start);
                if let Some(end) = &f.end {
                    output.push_str(" AND ");
                    output.push_str(end);
                }
            }
            
            output.push(')');
        }
        Expression::Between { expr, low, high, negated } => {
            format_expression(expr, output);
            if *negated {
                output.push_str(" NOT BETWEEN ");
            } else {
                output.push_str(" BETWEEN ");
            }
            format_expression(low, output);
            output.push_str(" AND ");
            format_expression(high, output);
        }
        Expression::InList { expr, list, negated } => {
            format_expression(expr, output);
            if *negated {
                output.push_str(" NOT IN (");
            } else {
                output.push_str(" IN (");
            }
            for (i, item) in list.iter().enumerate() {
                if i > 0 { output.push(','); }
                format_expression(item, output);
            }
            output.push(')');
        }
        Expression::InSubquery { expr, subquery, negated } => {
            format_expression(expr, output);
            if *negated {
                output.push_str(" NOT IN (");
            } else {
                output.push_str(" IN (");
            }
            format_statement(subquery, output, 0);
            output.push(')');
        }
        Expression::IsNull { expr, negated } => {
            format_expression(expr, output);
            if *negated {
                output.push_str(" IS NOT NULL");
            } else {
                output.push_str(" IS NULL");
            }
        }
        Expression::Like { expr, pattern, escape, negated, regex } => {
            format_expression(expr, output);
            if *negated { output.push_str(" NOT"); }
            if *regex {
                output.push_str(" RLIKE ");
            } else {
                output.push_str(" LIKE ");
            }
            format_expression(pattern, output);
            if let Some(esc) = escape {
                output.push_str(" ESCAPE ");
                format_expression(esc, output);
            }
        }
        Expression::Subquery(stmt) => {
            output.push('(');
            format_statement(stmt, output, 0);
            output.push(')');
        }
        Expression::Exists { subquery, negated } => {
            if *negated { output.push_str("NOT "); }
            output.push_str("EXISTS (");
            format_statement(subquery, output, 0);
            output.push(')');
        }
        Expression::ArrayAccess { array, index } => {
            format_expression(array, output);
            output.push('[');
            format_expression(index, output);
            output.push(']');
        }
        Expression::Raw(tokens) => {
            for (i, token) in tokens.iter().enumerate() {
                if i > 0 {
                    output.push(' ');
                }
                match token {
                    Token::Word(w) => output.push_str(w),
                    Token::Number(n) => output.push_str(n),
                    Token::StringLiteral(s) => output.push_str(s),
                    Token::Symbol(s) => output.push_str(s),
                    Token::QuotedIdentifier(s) => {
                        output.push('`');
                        output.push_str(s);
                        output.push('`');
                    }
                    Token::Eof => {}
                }
            }
        }
    }
}

fn format_from_clause(from: &FromClause, output: &mut String, indent: usize) {
    output.push_str(&" ".repeat(indent));
    output.push_str("FROM ");
    format_table_ref(&from.table, output, indent);
    
    // Format joins
    for join in &from.joins {
        output.push('\n');
        format_join(join, output, indent);
    }
}

fn format_table_ref(table_ref: &TableRef, output: &mut String, indent: usize) {
    // Format the table source (table name or subquery)
    match &table_ref.source {
        TableSource::Table(name) => output.push_str(name),
        TableSource::Subquery(stmt) => {
            output.push_str("(\n");
            let nested_indent = indent + BASE_INDENT;
            format_statement(stmt, output, nested_indent);
            output.push('\n');
            output.push_str(&" ".repeat(indent));
            output.push(')');
        }
    }
    
    // Table aliases never use AS
    if let Some(ref alias) = table_ref.alias {
        output.push(' ');
        output.push_str(alias);
    }
    
    // Format TABLESAMPLE
    if let Some(ref sample) = table_ref.tablesample {
        output.push_str(" TABLESAMPLE (");
        match &sample.method {
            TableSampleMethod::Percent(p) => {
                output.push_str(p);
                output.push_str(" PERCENT");
            }
            TableSampleMethod::Rows(r) => {
                output.push_str(r);
                output.push_str(" ROWS");
            }
            TableSampleMethod::Bucket(b, t) => {
                output.push_str("BUCKET ");
                output.push_str(b);
                output.push_str(" OUT OF ");
                output.push_str(t);
            }
        }
        output.push(')');
    }
    
    // Format LATERAL VIEWs
    for lateral in &table_ref.lateral_views {
        output.push('\n');
        output.push_str("LATERAL VIEW ");
        if lateral.outer {
            output.push_str("OUTER ");
        }
        format_expression(&lateral.function, output);
        output.push(' ');
        output.push_str(&lateral.table_alias);
        output.push_str(" AS ");
        for (i, col) in lateral.column_aliases.iter().enumerate() {
            if i > 0 {
                output.push(',');
            }
            output.push_str(col);
        }
    }
    
    // Format PIVOT
    if let Some(ref pivot) = table_ref.pivot {
        output.push('\n');
        output.push_str("PIVOT (");
        format_expression(&pivot.aggregate, output);
        output.push_str(" FOR ");
        output.push_str(&pivot.pivot_column);
        output.push_str(" IN (");
        for (i, val) in pivot.pivot_values.iter().enumerate() {
            if i > 0 {
                output.push(',');
            }
            format_expression(val, output);
        }
        output.push_str("))");
    }
    
    // Format UNPIVOT
    if let Some(ref unpivot) = table_ref.unpivot {
        output.push('\n');
        output.push_str("UNPIVOT (");
        output.push_str(&unpivot.value_column);
        output.push_str(" FOR ");
        output.push_str(&unpivot.name_column);
        output.push_str(" IN (");
        for (i, col) in unpivot.unpivot_columns.iter().enumerate() {
            if i > 0 {
                output.push(',');
            }
            output.push_str(col);
        }
        output.push_str("))");
    }
}

fn format_join(join: &Join, output: &mut String, _indent: usize) {
    // JOIN keywords start at column 0
    if join.natural {
        output.push_str("NATURAL ");
    }
    
    match join.join_type {
        JoinType::Inner => {
            // Only output INNER if it's not natural, otherwise just JOIN
            if !join.natural {
                output.push_str("INNER JOIN ");
            } else {
                output.push_str("JOIN ");
            }
        },
        JoinType::Left => output.push_str("LEFT JOIN "),
        JoinType::LeftSemi => output.push_str("LEFT SEMI JOIN "),
        JoinType::LeftAnti => output.push_str("LEFT ANTI JOIN "),
        JoinType::Right => output.push_str("RIGHT JOIN "),
        JoinType::RightSemi => output.push_str("RIGHT SEMI JOIN "),
        JoinType::RightAnti => output.push_str("RIGHT ANTI JOIN "),
        JoinType::Full => output.push_str("FULL JOIN "),
        JoinType::Cross => output.push_str("CROSS JOIN "),
    }
    
    // Format the table reference (could be table or subquery)
    format_table_ref(&join.table, output, _indent);
    
    // Format USING clause
    if !join.using_columns.is_empty() {
        output.push('\n');
        output.push_str(&" ".repeat(BASE_INDENT));
        output.push_str("USING (");
        for (i, col) in join.using_columns.iter().enumerate() {
            if i > 0 {
                output.push(',');
            }
            output.push_str(col);
        }
        output.push(')');
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
            
            // Format trailing inline comment
            if let Some(ref comment) = condition.trailing_comment {
                if matches!(comment.attachment, CommentAttachment::TrailingInline) {
                    output.push(' ');
                    output.push_str(&comment.text);
                }
            }
        }
    }
}

fn format_where_clause(where_clause: &WhereClause, output: &mut String, indent: usize) {
    // If there's only one condition (no AND/OR), keep inline
    if where_clause.conditions.len() == 1 {
        output.push_str(&" ".repeat(indent));
        output.push_str("WHERE ");
        format_expression(&where_clause.conditions[0].expr, output);
        
        // Format trailing inline comment
        if let Some(ref comment) = where_clause.conditions[0].trailing_comment {
            if matches!(comment.attachment, CommentAttachment::TrailingInline) {
                output.push(' ');
                output.push_str(&comment.text);
            }
        }
    } else {
        // Multiple conditions: each on its own line
        output.push_str(&" ".repeat(indent));
        output.push_str("WHERE");
        for (i, condition) in where_clause.conditions.iter().enumerate() {
            output.push('\n');
            output.push_str(&" ".repeat(indent + BASE_INDENT));
            
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
            
            // Format trailing inline comment
            if let Some(ref comment) = condition.trailing_comment {
                if matches!(comment.attachment, CommentAttachment::TrailingInline) {
                    output.push(' ');
                    output.push_str(&comment.text);
                }
            }
        }
    }
}

fn format_having_clause(having: &HavingClause, output: &mut String, indent: usize) {
    // If there's only one condition (no AND/OR), keep inline
    if having.conditions.len() == 1 {
        output.push_str(&" ".repeat(indent));
        output.push_str("HAVING ");
        format_expression(&having.conditions[0].expr, output);
        
        // Format trailing inline comment
        if let Some(ref comment) = having.conditions[0].trailing_comment {
            if matches!(comment.attachment, CommentAttachment::TrailingInline) {
                output.push(' ');
                output.push_str(&comment.text);
            }
        }
    } else {
        // Multiple conditions: each on its own line
        output.push_str(&" ".repeat(indent));
        output.push_str("HAVING");
        for (i, condition) in having.conditions.iter().enumerate() {
            output.push('\n');
            output.push_str(&" ".repeat(indent + BASE_INDENT));
            
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
            
            // Format trailing inline comment
            if let Some(ref comment) = condition.trailing_comment {
                if matches!(comment.attachment, CommentAttachment::TrailingInline) {
                    output.push(' ');
                    output.push_str(&comment.text);
                }
            }
        }
    }
}

fn format_group_by_clause(group_by: &GroupByClause, output: &mut String, indent: usize) {
    output.push_str(&" ".repeat(indent));
    output.push_str("GROUP BY");
    
    for (i, item) in group_by.items.iter().enumerate() {
        output.push('\n');
        
        if i == 0 {
            // First item: indent + FIRST_ITEM_INDENT spaces
            output.push_str(&" ".repeat(indent + FIRST_ITEM_INDENT));
        } else {
            // Subsequent items: comma-first with indent + BASE_INDENT
            output.push_str(&" ".repeat(indent + BASE_INDENT));
            output.push(',');
        }
        
        format_expression(item, output);
    }
}

fn format_order_by_clause(order_by: &OrderByClause, output: &mut String, indent: usize) {
    output.push_str(&" ".repeat(indent));
    output.push_str("ORDER BY");
    
    for (i, item) in order_by.items.iter().enumerate() {
        output.push('\n');
        
        if i == 0 {
            // First item: indent + FIRST_ITEM_INDENT spaces
            output.push_str(&" ".repeat(indent + FIRST_ITEM_INDENT));
        } else {
            // Subsequent items: comma-first with indent + BASE_INDENT
            output.push_str(&" ".repeat(indent + BASE_INDENT));
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

fn format_limit_clause(limit: &LimitClause, output: &mut String, indent: usize) {
    output.push_str(&" ".repeat(indent));
    output.push_str("LIMIT ");
    output.push_str(&limit.count);
}

// DDL Statement Formatters

fn format_create_table(stmt: &CreateTableStmt, output: &mut String, indent: usize) {
    // Format leading comments
    for comment in &stmt.leading_comments {
        format_comment(comment, output, indent);
    }
    
    output.push_str("CREATE TABLE ");
    output.push_str(&stmt.table_name);
    output.push_str(" (");
    output.push('\n');
    
    for (i, col) in stmt.columns.iter().enumerate() {
        if i == 0 {
            // First item: 5 spaces
            output.push_str(&" ".repeat(FIRST_ITEM_INDENT));
        } else {
            // Subsequent items: 4 spaces + comma
            output.push_str(&" ".repeat(BASE_INDENT));
            output.push(',');
        }
        output.push_str(&col.name);
        output.push(' ');
        output.push_str(&col.data_type.to_uppercase());
        output.push('\n');
    }
    
    output.push(')');
}

fn format_drop_table(stmt: &DropTableStmt, output: &mut String, indent: usize) {
    // Format leading comments
    for comment in &stmt.leading_comments {
        format_comment(comment, output, indent);
    }
    
    output.push_str("DROP TABLE");
    if stmt.if_exists {
        output.push_str(" IF EXISTS");
    }
    output.push(' ');
    output.push_str(&stmt.table_name);
}

fn format_describe(stmt: &DescribeStmt, output: &mut String, indent: usize) {
    // Format leading comments
    for comment in &stmt.leading_comments {
        format_comment(comment, output, indent);
    }
    
    output.push_str("DESCRIBE");
    if stmt.extended {
        output.push_str(" EXTENDED");
    }
    output.push(' ');
    output.push_str(&stmt.table_name);
}

fn format_show_tables(stmt: &ShowTablesStmt, output: &mut String, indent: usize) {
    // Format leading comments
    for comment in &stmt.leading_comments {
        format_comment(comment, output, indent);
    }
    
    output.push_str("SHOW TABLES");
    if let Some(ref db) = stmt.in_database {
        output.push_str(" IN ");
        output.push_str(db);
    }
}

// DML Statement Formatters

fn format_insert_into(stmt: &InsertIntoStmt, output: &mut String, indent: usize) {
    // Format leading comments
    for comment in &stmt.leading_comments {
        format_comment(comment, output, indent);
    }
    
    output.push_str("INSERT INTO ");
    output.push_str(&stmt.table_name);
    output.push('\n');
    
    format_statement(&stmt.query, output, indent);
}

fn format_delete_from(stmt: &DeleteFromStmt, output: &mut String, indent: usize) {
    // Format leading comments
    for comment in &stmt.leading_comments {
        format_comment(comment, output, indent);
    }
    
    output.push_str("DELETE FROM ");
    output.push_str(&stmt.table_name);
    
    if let Some(ref where_clause) = stmt.where_clause {
        output.push('\n');
        format_where_clause(where_clause, output, indent);
    }
}

// Session Statement Formatters

fn format_set_config(stmt: &SetConfigStmt, output: &mut String, indent: usize) {
    // Format leading comments
    for comment in &stmt.leading_comments {
        format_comment(comment, output, indent);
    }
    
    output.push_str("SET ");
    output.push_str(&stmt.key);
    output.push('=');
    output.push_str(&stmt.value);
}

fn format_use_database(stmt: &UseDatabaseStmt, output: &mut String, indent: usize) {
    // Format leading comments
    for comment in &stmt.leading_comments {
        format_comment(comment, output, indent);
    }
    
    output.push_str("USE ");
    output.push_str(&stmt.database_name);
}

fn format_create_view(stmt: &CreateViewStmt, output: &mut String, indent: usize) {
    // Format leading comments
    for comment in &stmt.leading_comments {
        format_comment(comment, output, indent);
    }
    
    output.push_str("CREATE");
    if stmt.or_replace {
        output.push_str(" OR REPLACE");
    }
    if stmt.temporary {
        output.push_str(" TEMPORARY");
    }
    output.push_str(" VIEW ");
    output.push_str(&stmt.view_name);
    output.push_str(" AS");
    output.push('\n');
    
    format_statement(&stmt.query, output, indent);
}

fn format_drop_view(stmt: &DropViewStmt, output: &mut String, indent: usize) {
    // Format leading comments
    for comment in &stmt.leading_comments {
        format_comment(comment, output, indent);
    }
    
    output.push_str("DROP VIEW");
    if stmt.if_exists {
        output.push_str(" IF EXISTS");
    }
    output.push(' ');
    output.push_str(&stmt.view_name);
}

fn format_alter_table(stmt: &AlterTableStmt, output: &mut String, indent: usize) {
    // Format leading comments
    for comment in &stmt.leading_comments {
        format_comment(comment, output, indent);
    }
    
    output.push_str("ALTER TABLE ");
    output.push_str(&stmt.table_name);
    output.push(' ');
    output.push_str(&stmt.action);
}

fn format_truncate_table(stmt: &TruncateTableStmt, output: &mut String, indent: usize) {
    // Format leading comments
    for comment in &stmt.leading_comments {
        format_comment(comment, output, indent);
    }
    
    output.push_str("TRUNCATE TABLE ");
    output.push_str(&stmt.table_name);
}

fn format_show_databases(stmt: &ShowDatabasesStmt, output: &mut String, indent: usize) {
    // Format leading comments
    for comment in &stmt.leading_comments {
        format_comment(comment, output, indent);
    }
    
    output.push_str("SHOW DATABASES");
}

fn format_show_views(stmt: &ShowViewsStmt, output: &mut String, indent: usize) {
    // Format leading comments
    for comment in &stmt.leading_comments {
        format_comment(comment, output, indent);
    }
    
    output.push_str("SHOW VIEWS");
    if let Some(ref db) = stmt.in_database {
        output.push_str(" IN ");
        output.push_str(db);
    }
}

fn format_show_columns(stmt: &ShowColumnsStmt, output: &mut String, indent: usize) {
    // Format leading comments
    for comment in &stmt.leading_comments {
        format_comment(comment, output, indent);
    }
    
    output.push_str("SHOW COLUMNS FROM ");
    output.push_str(&stmt.table_name);
}

fn format_insert_overwrite(stmt: &InsertOverwriteStmt, output: &mut String, indent: usize) {
    // Format leading comments
    for comment in &stmt.leading_comments {
        format_comment(comment, output, indent);
    }
    
    output.push_str("INSERT OVERWRITE ");
    output.push_str(&stmt.table_name);
    output.push('\n');
    
    format_statement(&stmt.query, output, indent);
}

fn format_insert_values(stmt: &InsertValuesStmt, output: &mut String, indent: usize) {
    // Format leading comments
    for comment in &stmt.leading_comments {
        format_comment(comment, output, indent);
    }
    
    output.push_str("INSERT INTO ");
    output.push_str(&stmt.table_name);
    output.push_str(" VALUES");
    
    for (i, row) in stmt.values.iter().enumerate() {
        output.push('\n');
        if i > 0 {
            output.push(',');
        }
        output.push('(');
        for (j, val) in row.iter().enumerate() {
            if j > 0 {
                output.push(',');
            }
            output.push_str(val);
        }
        output.push(')');
    }
}

fn format_update(stmt: &UpdateStmt, output: &mut String, indent: usize) {
    // Format leading comments
    for comment in &stmt.leading_comments {
        format_comment(comment, output, indent);
    }
    
    output.push_str("UPDATE ");
    output.push_str(&stmt.table_name);
    output.push('\n');
    output.push_str("SET");
    
    for (i, (col, val)) in stmt.assignments.iter().enumerate() {
        output.push('\n');
        if i == 0 {
            output.push_str("     ");
        } else {
            output.push_str("    ,");
        }
        output.push_str(col);
        output.push('=');
        output.push_str(val);
    }
    
    if let Some(ref where_clause) = stmt.where_clause {
        output.push('\n');
        format_where_clause(where_clause, output, indent);
    }
}

fn format_merge(stmt: &MergeStmt, output: &mut String, indent: usize) {
    // Format leading comments
    for comment in &stmt.leading_comments {
        format_comment(comment, output, indent);
    }
    
    output.push_str("MERGE INTO ");
    output.push_str(&stmt.target_table);
    if let Some(ref alias) = stmt.target_alias {
        output.push(' ');
        output.push_str(alias);
    }
    output.push('\n');
    output.push_str("USING ");
    output.push_str(&stmt.source_table);
    if let Some(ref alias) = stmt.source_alias {
        output.push(' ');
        output.push_str(alias);
    }
    output.push('\n');
    output.push_str("ON ");
    output.push_str(&stmt.on_condition);
    
    if let Some(ref matched) = stmt.when_matched {
        output.push('\n');
        output.push_str(matched);
    }
    
    if let Some(ref not_matched) = stmt.when_not_matched {
        output.push('\n');
        output.push_str(not_matched);
    }
}

fn format_explain(stmt: &ExplainStmt, output: &mut String, indent: usize) {
    // Format leading comments
    for comment in &stmt.leading_comments {
        format_comment(comment, output, indent);
    }
    
    output.push_str("EXPLAIN");
    if let Some(ref mode) = stmt.mode {
        output.push(' ');
        output.push_str(mode);
    }
    output.push('\n');
    
    format_statement(&stmt.query, output, indent);
}

fn format_refresh(stmt: &RefreshStmt, output: &mut String, indent: usize) {
    // Format leading comments
    for comment in &stmt.leading_comments {
        format_comment(comment, output, indent);
    }
    
    output.push_str("REFRESH TABLE ");
    output.push_str(&stmt.table_name);
}

fn format_cache_table(stmt: &CacheTableStmt, output: &mut String, indent: usize) {
    // Format leading comments
    for comment in &stmt.leading_comments {
        format_comment(comment, output, indent);
    }
    
    output.push_str("CACHE");
    if stmt.lazy {
        output.push_str(" LAZY");
    }
    output.push_str(" TABLE ");
    output.push_str(&stmt.table_name);
    
    if let Some(ref query) = stmt.query {
        output.push_str(" AS");
        output.push('\n');
        format_statement(query, output, indent);
    }
}

fn format_uncache_table(stmt: &UncacheTableStmt, output: &mut String, indent: usize) {
    // Format leading comments
    for comment in &stmt.leading_comments {
        format_comment(comment, output, indent);
    }
    
    output.push_str("UNCACHE TABLE ");
    output.push_str(&stmt.table_name);
}

fn format_clear_cache(stmt: &ClearCacheStmt, output: &mut String, indent: usize) {
    // Format leading comments
    for comment in &stmt.leading_comments {
        format_comment(comment, output, indent);
    }
    
    output.push_str("CLEAR CACHE");
}

fn format_analyze_table(stmt: &AnalyzeTableStmt, output: &mut String, indent: usize) {
    // Format leading comments
    for comment in &stmt.leading_comments {
        format_comment(comment, output, indent);
    }
    
    output.push_str("ANALYZE TABLE ");
    output.push_str(&stmt.table_name);
}

fn format_reset(stmt: &ResetStmt, output: &mut String, indent: usize) {
    // Format leading comments
    for comment in &stmt.leading_comments {
        format_comment(comment, output, indent);
    }
    
    output.push_str("RESET");
}
