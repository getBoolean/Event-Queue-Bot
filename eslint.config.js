import js from "@eslint/js";
import stylistic from "@stylistic/eslint-plugin";
import simpleImportSort from "eslint-plugin-simple-import-sort";
import unusedImports from "eslint-plugin-unused-imports";
import globals from "globals";
import tseslint from "typescript-eslint";

export default tseslint.config(
	{
		ignores: ["node_modules/**", "data/**", "logs/**"],
	},
	{
		files: ["src/**/*.ts", "patch-notes/**/*.ts", "*.config.ts"],
		extends: [
			js.configs.recommended,
			...tseslint.configs.recommended,
		],
		plugins: {
			"@stylistic": stylistic,
			"simple-import-sort": simpleImportSort,
			"unused-imports": unusedImports,
		},
		languageOptions: {
			parserOptions: {
				project: "tsconfig.json",
				sourceType: "module",
			},
			globals: {
				...globals.node,
			},
		},
		rules: {
			// TypeScript Specific Rules
			// `no-namespace` and `no-explicit-any` are intentionally off: util files
			// (MemberUtils, Queries, DisplayUtils, …) are namespace-based by design and
			// `any` is used at interaction-typing seams (tsconfig has `noImplicitAny:
			// false`). The rest of `tseslint.configs.recommended` is left enabled.
			"@typescript-eslint/no-namespace": "off",
			"@typescript-eslint/no-explicit-any": "off",
			"@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_" }],

			// `no-undef` and `no-unused-vars` are turned off per typescript-eslint convention
			// (TS itself catches undefined refs; the @typescript-eslint/no-unused-vars rule
			// supersedes the core one). All other `eslint:recommended` rules stay on.
			"no-undef": "off",
			"no-unused-vars": "off",

			// Plugin rules
			"unused-imports/no-unused-imports": "error",
			"simple-import-sort/imports": "error",

			// Additional core rules (not in recommended) carried over from the legacy config
			"no-empty-function": ["error", { allow: ["constructors"] }],
			"no-lonely-if": "error",
			"no-var": "error",
			"prefer-const": "error",
			"max-nested-callbacks": ["error", { max: 4 }],
			"curly": ["error", "multi-line", "consistent"],
			"yoda": ["error", "never"],

			// Formatting and Stylistic Rules (moved from core to @stylistic)
			"@stylistic/brace-style": ["error", "stroustrup", { allowSingleLine: true }],
			// Trailing commas are optional: allowed in multiline lists, forbidden on
			// single-line ones (so `[1, 2,]` is still caught).
			"@stylistic/comma-dangle": ["error", "only-multiline"],
			"@stylistic/comma-spacing": ["error", { before: false, after: true }],
			"@stylistic/comma-style": ["error", "last"],
			"@stylistic/dot-location": ["error", "property"],
			"@stylistic/indent": ["error", "tab", { SwitchCase: 1 }],
			"@stylistic/max-statements-per-line": ["error", { max: 2 }],
			"@stylistic/no-floating-decimal": "error",
			"@stylistic/no-multi-spaces": "error",
			"@stylistic/no-multiple-empty-lines": ["error", { max: 2, maxEOF: 0, maxBOF: 0 }],
			"@stylistic/no-trailing-spaces": "error",
			"@stylistic/object-curly-spacing": ["error", "always"],
			"@stylistic/quotes": ["error", "double", { avoidEscape: true, allowTemplateLiterals: "always" }],
			"@stylistic/semi": ["error", "always"],
			"@stylistic/space-before-blocks": "error",
			"@stylistic/space-before-function-paren": ["error", {
				anonymous: "never",
				named: "never",
				asyncArrow: "always",
			}],
			"@stylistic/space-infix-ops": "error",
			"@stylistic/space-unary-ops": "error",
			"@stylistic/spaced-comment": ["error", "always", {
				line: { markers: ["/"], exceptions: ["-", "+"] },
				block: { balanced: true },
			}],
		},
	},
);
