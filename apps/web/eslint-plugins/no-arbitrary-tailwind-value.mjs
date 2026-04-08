/**
 * ESLint rule: no-arbitrary-tailwind-value
 *
 * Bans arbitrary dimension values in Tailwind classes like:
 *   text-[10px], w-[200px], h-[3rem], p-[1.5em], max-h-[90vh]
 *
 * Allows:
 *   CSS functions:  bg-[oklch(...)], grid-cols-[1fr_2fr], max-h-[min(92vh,900px)]
 *   CSS variables:  text-[var(--custom)]
 *   Colors:         bg-[#fff], text-[red]
 *   Bare numbers:   z-[999], opacity-[0.5]
 *   Calc:           w-[calc(100%-2rem)]
 *
 * Rationale: Arbitrary dimension values bypass the design token system
 * defined in globals.css @theme. Extend @theme instead.
 */

// Matches: text-[10px], w-[200px], hover:h-[3rem], sm:p-[1.5em], dark:md:gap-[20vh]
// The class may have variant prefixes like "hover:", "sm:", "dark:md:" etc.
const ARBITRARY_DIMENSION_RE =
  /(?:^|\s)(?:[\w-]+:)*[\w-]+-\[\d+(?:\.\d+)?(?:px|rem|em|%|vh|vw|dvh|svh|lvh|cm|mm|in|pt|pc|ex|ch|lh|rlh|vi|vb|vmin|vmax|cqw|cqh|cqi|cqb|cqmin|cqmax)\]/g;

// Utility function call names to also lint
const UTILITY_CALLEES = new Set(["cn", "cva", "clsx", "twMerge", "twJoin"]);

/**
 * Extract all arbitrary dimension matches from a string.
 * @param {string} value
 * @returns {string[]} matched class fragments
 */
function findViolations(value) {
  if (!value || typeof value !== "string") return [];
  const matches = value.match(ARBITRARY_DIMENSION_RE);
  if (!matches) return [];
  return matches.map((m) => m.trim());
}

/** @type {import('eslint').Rule.RuleModule} */
const rule = {
  meta: {
    type: "problem",
    docs: {
      description:
        "Disallow arbitrary dimension values in Tailwind CSS classes. Extend @theme in globals.css instead.",
    },
    messages: {
      noArbitraryValue:
        "Arbitrary dimension value '{{ value }}' — use Tailwind theme tokens. Extend @theme in globals.css if needed.",
    },
    schema: [],
  },

  create(context) {
    /**
     * Report violations found in a string literal node.
     * @param {import('estree').Node} node - the AST node to report on
     * @param {string} value - the string content to check
     */
    function check(node, value) {
      const violations = findViolations(value);
      for (const v of violations) {
        context.report({
          node,
          messageId: "noArbitraryValue",
          data: { value: v },
        });
      }
    }

    /**
     * Check a JSX attribute value (string literal or expression with string/template).
     * @param {import('estree').Node} valueNode
     */
    function checkJSXValue(valueNode) {
      if (!valueNode) return;

      // className="text-[10px]"
      if (valueNode.type === "Literal" && typeof valueNode.value === "string") {
        check(valueNode, valueNode.value);
        return;
      }

      // className={`text-[10px] ${...}`}
      if (
        valueNode.type === "JSXExpressionContainer" &&
        valueNode.expression.type === "TemplateLiteral"
      ) {
        for (const quasi of valueNode.expression.quasis) {
          check(quasi, quasi.value.raw);
        }
        return;
      }

      // className={"text-[10px]"}
      if (
        valueNode.type === "JSXExpressionContainer" &&
        valueNode.expression.type === "Literal" &&
        typeof valueNode.expression.value === "string"
      ) {
        check(valueNode.expression, valueNode.expression.value);
      }
    }

    /**
     * Recursively check call expression arguments for string literals and templates.
     * Handles: cn("text-[10px]"), cn("a", condition && "text-[10px]")
     * @param {import('estree').Node[]} args
     */
    function checkCallArgs(args) {
      for (const arg of args) {
        if (arg.type === "Literal" && typeof arg.value === "string") {
          check(arg, arg.value);
        } else if (arg.type === "TemplateLiteral") {
          for (const quasi of arg.quasis) {
            check(quasi, quasi.value.raw);
          }
        } else if (arg.type === "LogicalExpression") {
          // condition && "text-[10px]"
          checkCallArgs([arg.right]);
        } else if (arg.type === "ConditionalExpression") {
          // condition ? "text-[10px]" : "text-sm"
          checkCallArgs([arg.consequent, arg.alternate]);
        } else if (arg.type === "ArrayExpression") {
          checkCallArgs(arg.elements.filter(Boolean));
        }
      }
    }

    return {
      // className="..." or class="..."
      JSXAttribute(node) {
        const name = node.name?.name;
        if (name !== "className" && name !== "class") return;
        checkJSXValue(node.value);
      },

      // cn(...), cva(...), clsx(...), twMerge(...)
      CallExpression(node) {
        const callee = node.callee;
        let name;

        if (callee.type === "Identifier") {
          name = callee.name;
        } else if (
          callee.type === "MemberExpression" &&
          callee.property.type === "Identifier"
        ) {
          name = callee.property.name;
        }

        if (name && UTILITY_CALLEES.has(name)) {
          checkCallArgs(node.arguments);
        }
      },
    };
  },
};

const plugin = {
  meta: { name: "eslint-plugin-design-system", version: "1.0.0" },
  rules: { "no-arbitrary-tailwind-value": rule },
};

export default plugin;
