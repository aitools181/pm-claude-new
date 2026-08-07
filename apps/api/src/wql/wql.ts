/* Safe Work Query Language. The parser emits an AST only; the service maps whitelisted fields to parameterised SQL. */
export type Comparison = { type: "cmp"; field: string; op: string; value: string | number | string[] | { fn: string } };
export type Group = { type: "and" | "or"; nodes: Node[] };
export type Not = { type: "not"; node: Node };
export type Node = Comparison | Group | Not;

export const WQL_FIELDS = ["status", "status_category", "priority", "title", "description", "owner", "reporter", "project", "parent", "key", "type", "created", "updated", "due", "start", "progress", "estimate", "story_points", "sprint", "has_children", "blocked", "changed_by"] as const;
const OPS = ["!=", ">=", "<=", "=", ">", "<", "~"];
type Tok = { t: "id" | "str" | "num" | "op" | "kw" | "lparen" | "rparen" | "comma" | "fn" | "lbracket" | "rbracket"; v: string };

function tokenize(input: string): Tok[] {
  const toks: Tok[] = []; let i = 0; const isIdChar = (c: string) => /[A-Za-z0-9_]/.test(c);
  while (i < input.length) {
    const c = input[i];
    if (/\s/.test(c)) { i++; continue; }
    if (c === "(") { toks.push({ t: "lparen", v: c }); i++; continue; }
    if (c === ")") { toks.push({ t: "rparen", v: c }); i++; continue; }
    if (c === "[") { toks.push({ t: "lbracket", v: c }); i++; continue; }
    if (c === "]") { toks.push({ t: "rbracket", v: c }); i++; continue; }
    if (c === ",") { toks.push({ t: "comma", v: c }); i++; continue; }
    if (c === '"' || c === "'") { const q = c; let s = ""; i++; while (i < input.length && input[i] !== q) { if (input[i] === "\\" && i + 1 < input.length) i++; s += input[i++]; } if (input[i] !== q) throw new Error("Unterminated string"); i++; toks.push({ t: "str", v: s }); continue; }
    const two = input.slice(i, i + 2); if (OPS.includes(two)) { toks.push({ t: "op", v: two }); i += 2; continue; }
    if (OPS.includes(c)) { toks.push({ t: "op", v: c }); i++; continue; }
    if ((c === "-" && /[0-9]/.test(input[i + 1] ?? "")) || /[0-9]/.test(c)) { let s = c; i++; while (i < input.length && /[0-9dhw.]/.test(input[i])) s += input[i++]; toks.push({ t: "num", v: s }); continue; }
    if (isIdChar(c)) { let s = ""; while (i < input.length && isIdChar(input[i])) s += input[i++]; const up = s.toUpperCase(); if (["AND", "OR", "NOT", "IN"].includes(up)) toks.push({ t: "kw", v: up }); else if (input[i] === "(") toks.push({ t: "fn", v: s }); else toks.push({ t: "id", v: s }); continue; }
    throw new Error(`Unexpected character '${c}' in query`);
  }
  return toks;
}

export function parseWql(input: string): Node {
  if (!input.trim()) throw new Error("Query is empty");
  const toks = tokenize(input); let p = 0; const peek = () => toks[p];
  const eat = (t?: string) => { const tok = toks[p]; if (!tok) throw new Error("Unexpected end of query"); if (t && tok.t !== t && tok.v !== t) throw new Error(`Expected ${t}`); p++; return tok; };
  function parseValue(): Comparison["value"] {
    const tok = peek(); if (!tok) throw new Error("Expected value");
    if (tok.t === "fn") { eat(); eat("lparen"); eat("rparen"); return { fn: tok.v }; }
    if (tok.t === "lbracket") { eat(); const arr: string[] = []; while (peek() && peek().t !== "rbracket") { const v = eat(); if (["str", "id", "num"].includes(v.t)) arr.push(v.v); else throw new Error("Invalid list value"); if (peek()?.t === "comma") eat(); } eat("rbracket"); return arr; }
    if (["str", "id", "num"].includes(tok.t)) { eat(); return tok.v; }
    throw new Error("Invalid value");
  }
  function parseCmp(): Node {
    if (peek()?.t === "lparen") { eat(); const n = parseOr(); eat("rparen"); return n; }
    if (peek()?.t === "kw" && peek()?.v === "NOT") { eat(); return { type: "not", node: parseCmp() }; }
    const fieldTok = eat(); if (fieldTok.t !== "id") throw new Error(`Expected a field name, got '${fieldTok.v}'`);
    const field = fieldTok.v.toLowerCase(); if (!WQL_FIELDS.includes(field as (typeof WQL_FIELDS)[number])) throw new Error(`Unknown or inaccessible field '${field}'`);
    const opTok = peek(); if (opTok?.t === "kw" && opTok.v === "IN") { eat(); const value = parseValue(); if (!Array.isArray(value)) throw new Error("IN expects a [list]"); return { type: "cmp", field, op: "IN", value }; }
    if (opTok?.t !== "op") throw new Error(`Expected an operator after '${field}'`); eat(); return { type: "cmp", field, op: opTok.v, value: parseValue() };
  }
  function parseAnd(): Node { let n = parseCmp(); while (peek()?.t === "kw" && peek()?.v === "AND") { eat(); n = { type: "and", nodes: [n, parseCmp()] }; } return n; }
  function parseOr(): Node { let n = parseAnd(); while (peek()?.t === "kw" && peek()?.v === "OR") { eat(); n = { type: "or", nodes: [n, parseAnd()] }; } return n; }
  const ast = parseOr(); if (p !== toks.length) throw new Error("Unexpected trailing tokens in query"); return ast;
}
