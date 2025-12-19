/// Internal representation of a SQL query
#[derive(Debug, Clone, PartialEq)]
pub enum Statement {
    Select(SelectQuery),
    SetOperation(SetOperation),
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
    Identifier(String),
    Star,
    QualifiedStar(String),
    FunctionCall {
        name: String,
        args: Vec<Expression>,
    },
    BinaryOp {
        left: Box<Expression>,
        op: String,
        right: Box<Expression>,
    },
    Literal(String),
    Parenthesized(Box<Expression>),
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
