"use client";

import { PrismLight as SyntaxHighlighter } from "react-syntax-highlighter";
import { vs } from "react-syntax-highlighter/dist/cjs/styles/prism";
import { vscDarkPlus } from "react-syntax-highlighter/dist/cjs/styles/prism";

/* register the most common code-block languages to avoid loading all ~200 */
import tsx from "react-syntax-highlighter/dist/cjs/languages/prism/tsx";
import typescript from "react-syntax-highlighter/dist/cjs/languages/prism/typescript";
import javascript from "react-syntax-highlighter/dist/cjs/languages/prism/javascript";
import python from "react-syntax-highlighter/dist/cjs/languages/prism/python";
import bash from "react-syntax-highlighter/dist/cjs/languages/prism/bash";
import json from "react-syntax-highlighter/dist/cjs/languages/prism/json";
import css from "react-syntax-highlighter/dist/cjs/languages/prism/css";
import markup from "react-syntax-highlighter/dist/cjs/languages/prism/markup";
import sql from "react-syntax-highlighter/dist/cjs/languages/prism/sql";
import yaml from "react-syntax-highlighter/dist/cjs/languages/prism/yaml";
import go from "react-syntax-highlighter/dist/cjs/languages/prism/go";
import rust from "react-syntax-highlighter/dist/cjs/languages/prism/rust";
import java from "react-syntax-highlighter/dist/cjs/languages/prism/java";
import markdown from "react-syntax-highlighter/dist/cjs/languages/prism/markdown";

SyntaxHighlighter.registerLanguage("tsx", tsx);
SyntaxHighlighter.registerLanguage("typescript", typescript);
SyntaxHighlighter.registerLanguage("javascript", javascript);
SyntaxHighlighter.registerLanguage("python", python);
SyntaxHighlighter.registerLanguage("bash", bash);
SyntaxHighlighter.registerLanguage("json", json);
SyntaxHighlighter.registerLanguage("css", css);
SyntaxHighlighter.registerLanguage("html", markup);
SyntaxHighlighter.registerLanguage("sql", sql);
SyntaxHighlighter.registerLanguage("yaml", yaml);
SyntaxHighlighter.registerLanguage("go", go);
SyntaxHighlighter.registerLanguage("rust", rust);
SyntaxHighlighter.registerLanguage("java", java);
SyntaxHighlighter.registerLanguage("markdown", markdown);

export function SyntaxHighlighterBlock({
  code,
  lang,
  isDark,
}: {
  code: string;
  lang: string;
  isDark: boolean;
}) {
  return (
    <SyntaxHighlighter
      language={lang || "text"}
      style={isDark ? vscDarkPlus : vs}
      showLineNumbers
      lineNumberStyle={{ color: "var(--text-dim)", fontStyle: "normal" }}
      customStyle={{
        margin: 0,
        padding: "10px 12px",
        fontSize: 13,
        lineHeight: 1.6,
        borderRadius: 0,
        background: "var(--bg)",
      }}
      codeTagProps={{ style: { fontFamily: "var(--font-mono)" } }}
    >
      {code}
    </SyntaxHighlighter>
  );
}
