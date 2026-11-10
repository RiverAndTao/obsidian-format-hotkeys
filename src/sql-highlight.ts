import { RangeSetBuilder, StateEffect, type Extension } from "@codemirror/state";
import {
    Decoration,
    type DecorationSet,
    EditorView,
    ViewPlugin,
    type ViewUpdate,
} from "@codemirror/view";
import { MarkdownView, type App } from "obsidian";

const SQL_LANGS = new Set([
    "sql",
    "mysql",
    "mariadb",
    "pgsql",
    "postgres",
    "postgresql",
    "plsql",
    "tsql",
    "sqlite",
]);

/** SQL / MySQL 过程体常用关键字（含 DELIMITER、控制流） */
const KEYWORDS = new Set(
    [
        "add", "all", "alter", "analyze", "and", "any", "as", "asc", "before", "between",
        "both", "by", "call", "cascade", "case", "change", "check", "collate", "column",
        "comment", "constraint", "contains", "continue", "convert", "create", "cross",
        "current", "current_date", "current_time", "current_timestamp", "current_user",
        "cursor", "database", "databases", "day_hour", "day_microsecond", "day_minute",
        "day_second", "declare", "default", "delayed", "delete", "desc", "describe",
        "deterministic", "distinct", "distinctrow", "div", "do", "drop", "dual", "each",
        "else", "elseif", "enclosed", "end", "escaped", "exists", "exit", "explain",
        "false", "fetch", "for", "force", "foreign", "from", "full", "fulltext",
        "function", "grant", "group", "having", "high_priority", "hour_microsecond",
        "hour_minute", "hour_second", "if", "ignore", "in", "index", "infile", "inner",
        "inout", "insert", "intersect", "into", "is", "iterate", "join", "key", "keys",
        "kill", "leading", "leave", "left", "like", "limit", "linear", "lines", "load",
        "localtime", "localtimestamp", "lock", "loop", "low_priority", "match",
        "minute_microsecond", "minute_second", "mod", "modifies", "natural", "not",
        "no_write_to_binlog", "null", "on", "optimize", "option", "optionally", "or",
        "order", "out", "outer", "outfile", "over", "partition", "precision", "primary",
        "procedure", "purge", "range", "read", "reads", "references", "regexp", "release",
        "rename", "repeat", "replace", "require", "resignal", "restrict", "return",
        "returns", "revoke", "right", "rlike", "schema", "schemas", "second_microsecond",
        "select", "set", "show", "signal", "separator", "sql", "sqlexception", "sqlstate",
        "sqlwarning", "sql_big_result", "sql_calc_found_rows", "sql_small_result",
        "ssl", "starting", "straight_join", "table", "terminated", "then", "to",
        "trailing", "trigger", "true", "undo", "union", "unique", "unlock", "unsigned",
        "update", "usage", "use", "using", "values", "when", "where", "while", "with",
        "write", "xor", "year_month", "zerofill",
        "begin", "delimiter", "handler", "open", "close", "deallocate", "prepare",
        "execute", "temporary", "view", "event", "engine", "charset", "character",
        "collation", "offset", "fetch", "next", "only", "rows", "row", "first", "last",
        "recursive", "lateral", "window", "filter", "within", "excluding", "ties",
        "nulls", "last", "first", "generated", "always", "stored", "virtual", "asensitive",
        "insensitive", "specific", "language", "sqlsecurity", "definer", "invoker",
        "no", "sql", "data", "contains", "reads", "modifies", "deterministic",
        "commit", "rollback", "savepoint", "transaction", "start", "work",
        "exclusive", "share", "mode", "nowait", "wait", "skip", "locked",
        "interval", "ascii", "unicode", "binary", "both", "leading", "trailing",
        "cast", "extract", "trim", "position", "substring", "concat",
    ].map((k) => k.toLowerCase())
);

/** 类型 / 内建类型名 */
const TYPES = new Set(
    [
        "bit", "bool", "boolean", "tinyint", "smallint", "mediumint", "int", "integer",
        "bigint", "decimal", "dec", "numeric", "fixed", "float", "double", "real",
        "date", "datetime", "timestamp", "time", "year",
        "char", "varchar", "binary", "varbinary", "tinyblob", "blob", "mediumblob",
        "longblob", "tinytext", "text", "mediumtext", "longtext", "enum", "set",
        "json", "geometry", "point", "linestring", "polygon", "multipoint",
        "multilinestring", "multipolygon", "geometrycollection",
        "serial", "uuid", "money", "smallmoney", "nchar", "nvarchar", "ntext",
        "uniqueidentifier", "xml", "sql_variant", "hierarchyid", "image",
        "clob", "nclob", "bfile", "raw", "long", "rowid", "urowid", "number",
        "pls_integer", "binary_integer", "varchar2", "nvarchar2",
    ].map((k) => k.toLowerCase())
);

const BUILTINS = new Set(
    [
        "count", "sum", "avg", "min", "max", "coalesce", "nullif", "ifnull", "isnull",
        "nvl", "greatest", "least", "abs", "ceil", "ceiling", "floor", "round", "trunc",
        "mod", "power", "sqrt", "exp", "ln", "log", "sign",
        "length", "char_length", "character_length", "octet_length", "bit_length",
        "lower", "upper", "ucase", "lcase", "trim", "ltrim", "rtrim", "substr",
        "substring", "replace", "reverse", "concat", "concat_ws", "left", "right",
        "mid", "locate", "instr", "position", "find_in_set", "format",
        "now", "curdate", "curtime", "sysdate", "current_date", "current_time",
        "current_timestamp", "date_add", "date_sub", "datediff", "timestampdiff",
        "date_format", "str_to_date", "year", "month", "day", "hour", "minute",
        "second", "week", "weekday", "quarter", "extract",
        "cast", "convert", "ascii", "ord", "char", "hex", "unhex", "bin",
        "md5", "sha1", "sha2", "uuid", "rand", "sleep", "benchmark",
        "row_number", "rank", "dense_rank", "ntile", "lag", "lead",
        "first_value", "last_value", "nth_value",
        "group_concat", "string_agg", "array_agg", "json_object", "json_array",
        "json_extract", "json_unquote", "json_set", "json_insert", "json_replace",
    ].map((k) => k.toLowerCase())
);

const decoCache = new Map<string, Decoration>();

function tokenMark(type: string): Decoration {
    let deco = decoCache.get(type);
    if (!deco) {
        deco = Decoration.mark({ class: `cm-${type}` });
        decoCache.set(type, deco);
    }
    return deco;
}

function isSqlLang(info: string): boolean {
    const lang = info.trim().toLowerCase().split(/[\s:{]/)[0] ?? "";
    return SQL_LANGS.has(lang);
}

function fenceLang(text: string): string | null {
    const trimmed = text.trimStart();
    if (!trimmed.startsWith("```")) {
        return null;
    }
    return trimmed.slice(3).trim();
}

/** 标识符：英文/下划线/中文等字母数字 */
const IDENT_RE = /^[\p{L}_][\p{L}\p{N}_$]*/u;
const NUMBER_RE = /^(?:0x[0-9a-fA-F]+|\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)/;
const DELIMITER_MARK_RE = /^\$\$/;

function tokenizeLine(from: number, text: string, builder: RangeSetBuilder<Decoration>): void {
    let i = 0;
    const n = text.length;

    const add = (start: number, end: number, type: string): void => {
        if (end > start) {
            builder.add(from + start, from + end, tokenMark(type));
        }
    };

    while (i < n) {
        const ch = text[i];
        if (ch === " " || ch === "\t") {
            i++;
            continue;
        }

        // 行注释 --
        if (ch === "-" && text[i + 1] === "-") {
            add(i, n, "comment");
            return;
        }

        // 井号注释（MySQL）
        if (ch === "#") {
            add(i, n, "comment");
            return;
        }

        // 块注释 /* ... */（单行内）
        if (ch === "/" && text[i + 1] === "*") {
            const close = text.indexOf("*/", i + 2);
            if (close >= 0) {
                add(i, close + 2, "comment");
                i = close + 2;
            } else {
                add(i, n, "comment");
                return;
            }
            continue;
        }

        // 单引号 / 双引号字符串（含 '' / "" 转义）
        if (ch === "'" || ch === '"') {
            const quote = ch;
            let j = i + 1;
            while (j < n) {
                if (text[j] === "\\") {
                    j += 2;
                    continue;
                }
                if (text[j] === quote) {
                    if (text[j + 1] === quote) {
                        j += 2;
                        continue;
                    }
                    j++;
                    break;
                }
                j++;
            }
            add(i, j, "string");
            i = j;
            continue;
        }

        // 反引号标识符
        if (ch === "`") {
            let j = i + 1;
            while (j < n && text[j] !== "`") {
                j++;
            }
            if (j < n) {
                j++;
            }
            add(i, j, "variable-2");
            i = j;
            continue;
        }

        // [bracket] 标识符（T-SQL）
        if (ch === "[") {
            const close = text.indexOf("]", i + 1);
            if (close > i) {
                add(i, close + 1, "variable-2");
                i = close + 1;
                continue;
            }
        }

        const rest = text.slice(i);

        // MySQL DELIMITER 常用 $$
        if (DELIMITER_MARK_RE.test(rest)) {
            add(i, i + 2, "meta");
            i += 2;
            continue;
        }

        const num = rest.match(NUMBER_RE);
        if (num && (i === 0 || !/[\p{L}_]/u.test(text[i - 1] ?? ""))) {
            // 避免把标识符中间的数字吃掉；前面已用 IDENT 优先
            add(i, i + num[0].length, "number");
            i += num[0].length;
            continue;
        }

        const ident = rest.match(IDENT_RE);
        if (ident) {
            const raw = ident[0];
            const core = raw.toLowerCase();
            if (KEYWORDS.has(core)) {
                add(i, i + raw.length, "keyword");
            } else if (TYPES.has(core)) {
                add(i, i + raw.length, "builtin");
            } else if (BUILTINS.has(core)) {
                add(i, i + raw.length, "def");
            } else {
                add(i, i + raw.length, "variable");
            }
            i += raw.length;
            continue;
        }

        if ("=<>!+-*/%&|^~".includes(ch)) {
            // 双字符运算符
            const two = text.slice(i, i + 2);
            if (["<>", "!=", "<=", ">=", "||", "&&", "<<", ">>", ":="].includes(two)) {
                add(i, i + 2, "operator");
                i += 2;
            } else {
                add(i, i + 1, "operator");
                i++;
            }
            continue;
        }

        if ("(),.;:".includes(ch)) {
            add(i, i + 1, "operator");
            i++;
            continue;
        }

        i++;
    }
}

function buildDecorations(view: EditorView): DecorationSet {
    const builder = new RangeSetBuilder<Decoration>();
    const doc = view.state.doc;
    let lang: string | null = null;

    for (let lineNo = 1; lineNo <= doc.lines; lineNo++) {
        const line = doc.line(lineNo);
        const info = fenceLang(line.text);
        if (info !== null) {
            if (lang === null) {
                lang = info;
            } else {
                lang = null;
            }
            continue;
        }
        if (lang !== null && isSqlLang(lang)) {
            tokenizeLine(line.from, line.text, builder);
        }
    }

    return builder.finish();
}

export const refreshSqlHighlightEffect = StateEffect.define<null>();

const sqlHighlightPlugin = ViewPlugin.fromClass(
    class {
        decorations: DecorationSet;

        constructor(view: EditorView) {
            this.decorations = buildDecorations(view);
        }

        update(update: ViewUpdate) {
            const forced = update.transactions.some((tr) =>
                tr.effects.some((e) => e.is(refreshSqlHighlightEffect))
            );
            if (update.docChanged || update.viewportChanged || forced) {
                this.decorations = buildDecorations(update.view);
            }
        }
    },
    {
        decorations: (v) => v.decorations,
    }
);

export function createSqlHighlightExtension(): Extension {
    return sqlHighlightPlugin;
}

export function refreshSqlHighlight(app: App): void {
    app.workspace.iterateAllLeaves((leaf) => {
        const view = leaf.view;
        if (!(view instanceof MarkdownView) || view.getMode() !== "source") {
            return;
        }
        const cm = (view.editor as unknown as { cm?: EditorView }).cm;
        if (cm) {
            cm.dispatch({ effects: refreshSqlHighlightEffect.of(null) });
        }
    });
}

interface PrismLike {
    languages: Record<string, unknown>;
}

/** 阅读视图：给 Prism 补上 sql 方言别名（Obsidian 通常已有 sql） */
export function registerSqlPrismLanguages(prism: PrismLike): void {
    const existing = prism.languages.sql;
    const grammar =
        existing ??
        ({
            comment: {
                pattern: /(^|[^\\])(?:\/\*[\s\S]*?\*\/|(?:--|\#).*)/,
                lookbehind: true,
            },
            string: {
                pattern: /'(?:''|[^'])*'|"(?:""|[^"])*"|`(?:``|[^`])*`/,
                greedy: true,
            },
            keyword: new RegExp(
                `\\b(?:${[...KEYWORDS].sort((a, b) => b.length - a.length).join("|")})\\b`,
                "i"
            ),
            boolean: /\b(?:true|false|null)\b/i,
            number: /\b0x[\da-f]+\b|\b\d+(?:\.\d+)?(?:e[+-]?\d+)?\b/i,
            operator: /[-+*/=%^~]|&&?|\|\|?|!=?|<>|<<|>>|<=?|>=?|:=/,
            punctuation: /[;[\](),.]/,
            function: new RegExp(
                `\\b(?:${[...BUILTINS].sort((a, b) => b.length - a.length).join("|")})(?=\\s*\\()`,
                "i"
            ),
        } as Record<string, unknown>);

    for (const lang of SQL_LANGS) {
        if (!prism.languages[lang]) {
            prism.languages[lang] = grammar;
        }
    }
}
