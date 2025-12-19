/// Internal representation of a SQL statement
#[derive(Debug, Clone, PartialEq)]
pub enum Statement {
    Select(SelectQuery),
    SetOperation(SetOperation),
    // DDL
    CreateTable(CreateTableStmt),
    CreateView(CreateViewStmt),
    DropTable(DropTableStmt),
    DropView(DropViewStmt),
    AlterTable(AlterTableStmt),
    TruncateTable(TruncateTableStmt),
    Describe(DescribeStmt),
    ShowTables(ShowTablesStmt),
    ShowDatabases(ShowDatabasesStmt),
    ShowViews(ShowViewsStmt),
    ShowColumns(ShowColumnsStmt),
    // DML
    InsertInto(InsertIntoStmt),
    InsertOverwrite(InsertOverwriteStmt),
    InsertValues(InsertValuesStmt),
    Update(UpdateStmt),
    DeleteFrom(DeleteFromStmt),
    Merge(MergeStmt),
    // Utility
    Explain(ExplainStmt),
    Refresh(RefreshStmt),
    CacheTable(CacheTableStmt),
    UncacheTable(UncacheTableStmt),
    ClearCache(ClearCacheStmt),
    AnalyzeTable(AnalyzeTableStmt),
    // Session
    SetConfig(SetConfigStmt),
    Reset(ResetStmt),
    UseDatabase(UseDatabaseStmt),
}

/// CREATE TABLE statement
#[derive(Debug, Clone, PartialEq)]
pub struct CreateTableStmt {
    pub table_name: String,
    pub columns: Vec<ColumnDef>,
    pub leading_comments: Vec<Comment>,
}

#[derive(Debug, Clone, PartialEq)]
pub struct ColumnDef {
    pub name: String,
    pub data_type: String,
}

/// DROP TABLE statement
#[derive(Debug, Clone, PartialEq)]
pub struct DropTableStmt {
    pub table_name: String,
    pub if_exists: bool,
    pub leading_comments: Vec<Comment>,
}

/// DESCRIBE statement
#[derive(Debug, Clone, PartialEq)]
pub struct DescribeStmt {
    pub extended: bool,
    pub table_name: String,
    pub leading_comments: Vec<Comment>,
}

/// SHOW TABLES statement
#[derive(Debug, Clone, PartialEq)]
pub struct ShowTablesStmt {
    pub in_database: Option<String>,
    pub leading_comments: Vec<Comment>,
}

/// INSERT INTO statement
#[derive(Debug, Clone, PartialEq)]
pub struct InsertIntoStmt {
    pub table_name: String,
    pub query: Box<Statement>,
    pub leading_comments: Vec<Comment>,
}

/// DELETE FROM statement
#[derive(Debug, Clone, PartialEq)]
pub struct DeleteFromStmt {
    pub table_name: String,
    pub where_clause: Option<WhereClause>,
    pub leading_comments: Vec<Comment>,
}

/// SET configuration statement
#[derive(Debug, Clone, PartialEq)]
pub struct SetConfigStmt {
    pub key: String,
    pub value: String,
    pub leading_comments: Vec<Comment>,
}

/// USE database statement
#[derive(Debug, Clone, PartialEq)]
pub struct UseDatabaseStmt {
    pub database_name: String,
    pub leading_comments: Vec<Comment>,
}

/// Comment with anchoring information
#[derive(Debug, Clone, PartialEq)]
pub struct Comment {
    pub text: String,
    pub is_line_comment: bool,
    pub attachment: CommentAttachment,
}

#[derive(Debug, Clone, PartialEq)]
pub enum CommentAttachment {
    /// Line comment on same line as code
    TrailingInline,
    /// Comment on own line immediately above
    TrailingOwnLine,
    /// Comment on own line immediately before
    Leading,
}

#[derive(Debug, Clone, PartialEq)]
pub struct SetOperation {
    pub left: Box<SelectQuery>,
    pub op: SetOperator,
    pub right: Box<Statement>,
}

#[derive(Debug, Clone, PartialEq)]
pub enum SetOperator {
    Union,
    UnionAll,
}

#[derive(Debug, Clone, PartialEq)]
pub struct SelectQuery {
    pub with_clause: Option<WithClause>,
    pub distinct: bool,
    pub select_list: Vec<SelectItem>,
    pub from: Option<FromClause>,
    pub where_clause: Option<WhereClause>,
    pub group_by: Option<GroupByClause>,
    pub having: Option<HavingClause>,
    pub order_by: Option<OrderByClause>,
    pub limit: Option<LimitClause>,
    pub leading_comments: Vec<Comment>,
    pub hint_comment: Option<String>, // Query hint: /*+ ... */
}

#[derive(Debug, Clone, PartialEq)]
pub struct WithClause {
    pub ctes: Vec<Cte>,
}

#[derive(Debug, Clone, PartialEq)]
pub struct Cte {
    pub name: String,
    pub query: Box<Statement>,
}

#[derive(Debug, Clone, PartialEq)]
pub struct SelectItem {
    pub expr: Expression,
    pub alias: Option<String>,
    pub trailing_comment: Option<Comment>,
}

#[derive(Debug, Clone, PartialEq)]
pub enum Expression {
    // === PRIMITIVES ===
    Identifier(String),
    QuotedIdentifier(String),      // `col` or "col"
    Star,
    QualifiedStar(String),
    Literal(String),
    
    // === GENERIC (scalable) ===
    FunctionCall {
        name: String,
        args: Vec<Expression>,
    },
    BinaryOp {
        left: Box<Expression>,
        op: String,
        right: Box<Expression>,
    },
    UnaryOp {
        op: String,
        expr: Box<Expression>,
    },
    Parenthesized(Box<Expression>),
    
    // === SPECIAL SYNTAX (need custom formatting) ===
    Case {
        operand: Option<Box<Expression>>,
        when_clauses: Vec<WhenClause>,
        else_clause: Option<Box<Expression>>,
    },
    Cast {
        expr: Box<Expression>,
        data_type: String,
    },
    WindowFunction {
        function: Box<Expression>,
        partition_by: Vec<Expression>,
        order_by: Vec<OrderByItem>,
        frame: Option<WindowFrame>,
    },
    Between {
        expr: Box<Expression>,
        low: Box<Expression>,
        high: Box<Expression>,
        negated: bool,
    },
    InList {
        expr: Box<Expression>,
        list: Vec<Expression>,
        negated: bool,
    },
    InSubquery {
        expr: Box<Expression>,
        subquery: Box<Statement>,
        negated: bool,
    },
    IsNull {
        expr: Box<Expression>,
        negated: bool,
    },
    Like {
        expr: Box<Expression>,
        pattern: Box<Expression>,
        escape: Option<Box<Expression>>,
        negated: bool,
        regex: bool,               // RLIKE variant
    },
    Subquery(Box<Statement>),
    Exists {
        subquery: Box<Statement>,
        negated: bool,
    },
    ArrayAccess {
        array: Box<Expression>,
        index: Box<Expression>,
    },
    
    // === FALLBACK (graceful degradation) ===
    Raw(Vec<Token>),
}

#[derive(Debug, Clone, PartialEq)]
pub struct WhenClause {
    pub condition: Expression,
    pub result: Expression,
}

#[derive(Debug, Clone, PartialEq)]
pub struct WindowFrame {
    pub unit: String,              // ROWS, RANGE
    pub start: String,             // UNBOUNDED PRECEDING, CURRENT ROW, etc.
    pub end: Option<String>,
}

// Token type for Raw expressions (re-exported from parser)
#[derive(Debug, Clone, PartialEq)]
pub enum Token {
    Word(String),
    Symbol(String),
    Number(String),
    StringLiteral(String),
    QuotedIdentifier(String),
    Eof,
}

#[derive(Debug, Clone, PartialEq)]
pub struct FromClause {
    pub table: TableRef,
    pub joins: Vec<Join>,
}

#[derive(Debug, Clone, PartialEq)]
pub struct TableRef {
    pub name: String,
    pub alias: Option<String>,
}

#[derive(Debug, Clone, PartialEq)]
pub struct Join {
    pub join_type: JoinType,
    pub table: TableRef,
    pub on_conditions: Vec<Condition>,
}

#[derive(Debug, Clone, PartialEq)]
pub enum JoinType {
    Inner,
    Left,
    Right,
    Full,
    Cross,
}

#[derive(Debug, Clone, PartialEq)]
pub struct Condition {
    pub expr: Expression,
    pub logical_op: Option<LogicalOp>,
}

#[derive(Debug, Clone, PartialEq)]
pub enum LogicalOp {
    And,
    Or,
}

#[derive(Debug, Clone, PartialEq)]
pub struct WhereClause {
    pub conditions: Vec<Condition>,
}

#[derive(Debug, Clone, PartialEq)]
pub struct HavingClause {
    pub conditions: Vec<Condition>,
}

#[derive(Debug, Clone, PartialEq)]
pub struct GroupByClause {
    pub items: Vec<Expression>,
}

#[derive(Debug, Clone, PartialEq)]
pub struct OrderByClause {
    pub items: Vec<OrderByItem>,
}

#[derive(Debug, Clone, PartialEq)]
pub struct OrderByItem {
    pub expr: Expression,
    pub direction: Option<OrderDirection>,
}

#[derive(Debug, Clone, PartialEq)]
pub enum OrderDirection {
    Asc,
    Desc,
}

#[derive(Debug, Clone, PartialEq)]
pub struct LimitClause {
    pub count: String,
}

/// CREATE VIEW statement
#[derive(Debug, Clone, PartialEq)]
pub struct CreateViewStmt {
    pub or_replace: bool,
    pub temporary: bool,
    pub view_name: String,
    pub query: Box<Statement>,
    pub leading_comments: Vec<Comment>,
}

/// DROP VIEW statement
#[derive(Debug, Clone, PartialEq)]
pub struct DropViewStmt {
    pub view_name: String,
    pub if_exists: bool,
    pub leading_comments: Vec<Comment>,
}

/// ALTER TABLE statement
#[derive(Debug, Clone, PartialEq)]
pub struct AlterTableStmt {
    pub table_name: String,
    pub action: String, // Simplified: store rest of statement as string
    pub leading_comments: Vec<Comment>,
}

/// TRUNCATE TABLE statement
#[derive(Debug, Clone, PartialEq)]
pub struct TruncateTableStmt {
    pub table_name: String,
    pub leading_comments: Vec<Comment>,
}

/// SHOW DATABASES statement
#[derive(Debug, Clone, PartialEq)]
pub struct ShowDatabasesStmt {
    pub leading_comments: Vec<Comment>,
}

/// SHOW VIEWS statement
#[derive(Debug, Clone, PartialEq)]
pub struct ShowViewsStmt {
    pub in_database: Option<String>,
    pub leading_comments: Vec<Comment>,
}

/// SHOW COLUMNS statement
#[derive(Debug, Clone, PartialEq)]
pub struct ShowColumnsStmt {
    pub table_name: String,
    pub leading_comments: Vec<Comment>,
}

/// INSERT OVERWRITE statement
#[derive(Debug, Clone, PartialEq)]
pub struct InsertOverwriteStmt {
    pub table_name: String,
    pub query: Box<Statement>,
    pub leading_comments: Vec<Comment>,
}

/// INSERT VALUES statement
#[derive(Debug, Clone, PartialEq)]
pub struct InsertValuesStmt {
    pub table_name: String,
    pub values: Vec<Vec<String>>, // List of row values
    pub leading_comments: Vec<Comment>,
}

/// UPDATE statement
#[derive(Debug, Clone, PartialEq)]
pub struct UpdateStmt {
    pub table_name: String,
    pub assignments: Vec<(String, String)>, // (column, value) pairs
    pub where_clause: Option<WhereClause>,
    pub leading_comments: Vec<Comment>,
}

/// MERGE statement
#[derive(Debug, Clone, PartialEq)]
pub struct MergeStmt {
    pub target_table: String,
    pub target_alias: Option<String>,
    pub source_table: String,
    pub source_alias: Option<String>,
    pub on_condition: String,
    pub when_matched: Option<String>,
    pub when_not_matched: Option<String>,
    pub leading_comments: Vec<Comment>,
}

/// EXPLAIN statement
#[derive(Debug, Clone, PartialEq)]
pub struct ExplainStmt {
    pub mode: Option<String>, // EXTENDED, CODEGEN, COST, etc.
    pub query: Box<Statement>,
    pub leading_comments: Vec<Comment>,
}

/// REFRESH TABLE statement
#[derive(Debug, Clone, PartialEq)]
pub struct RefreshStmt {
    pub table_name: String,
    pub leading_comments: Vec<Comment>,
}

/// CACHE TABLE statement
#[derive(Debug, Clone, PartialEq)]
pub struct CacheTableStmt {
    pub lazy: bool,
    pub table_name: String,
    pub query: Option<Box<Statement>>,
    pub leading_comments: Vec<Comment>,
}

/// UNCACHE TABLE statement
#[derive(Debug, Clone, PartialEq)]
pub struct UncacheTableStmt {
    pub table_name: String,
    pub leading_comments: Vec<Comment>,
}

/// CLEAR CACHE statement
#[derive(Debug, Clone, PartialEq)]
pub struct ClearCacheStmt {
    pub leading_comments: Vec<Comment>,
}

/// ANALYZE TABLE statement
#[derive(Debug, Clone, PartialEq)]
pub struct AnalyzeTableStmt {
    pub table_name: String,
    pub leading_comments: Vec<Comment>,
}

/// RESET statement
#[derive(Debug, Clone, PartialEq)]
pub struct ResetStmt {
    pub leading_comments: Vec<Comment>,
}
