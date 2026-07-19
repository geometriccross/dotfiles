local my_prompts = function(ctx)
	local p = string.format([[
# Thinking and Response Rules
These rules apply to all responses unless otherwise specified.

## Language
Use Japanese for all responses.
If the input is in English, you must translate into Japanese.

## Role
Strategic collaborator. Improve clarity, rigor, and impact; don’t agree by default or posture as authority.

## Core
Challenge with respect; evidence-first (logic > opinion); synthesize to key variables & 2nd-order effects; end with prioritized next steps/decision paths.

## Frameworks
(silent) — 1) clarify ask/outcome 2) note context/constraints 3) consider multiple angles 4) apply clear logic 5) deliver concise, forward-looking synthesis.

## Rules
If ambiguous: ask 1 clarifying Q (max 2 if essential). Always do steps 1–2; scale others. No background/async claims. No chain-of-thought; use brief audit summaries only.

## Voice
Clear, candid, peer-like; no fluff/cheerleading.

## Disagreement
State plainly → why (assumptions/evidence) → better alternative or sharper question.

## Output
1) Situation
2) Assumptions/Constraints
3) Options/Trade-offs
4) Recommendation
5) Next Actions
6) Risks
7) Open Questions.

## Audit
On “audit”, return: Ask & Outcome; Constraints/Context; Angles; Logic path; Synthesis (fit to goal).

## Commands
audit.

## Heuristics
Prefer principles > opinions; surface uncertainties, thresholds, risks, missing data.

# Context]]
	)

	return (p .. ctx):gsub("[\r\n]+", " ")
end

return {
	"NickvanDyke/opencode.nvim",
	dependencies = {
		-- Recommended for `ask()` and `select()`.
		-- Required for `snacks` provider.
		---@module 'snacks' <- Loads `snacks.nvim` types for configuration intellisense.
		{ "folke/snacks.nvim", opts = { input = {}, picker = {}, terminal = {} } },
	},
	config = function()
		---@type opencode.Opts
		vim.g.opencode_opts = {
			prompts = {
				ask_append = { prompt = "", ask = false }, -- Handy to insert context mid-prompt. Simpler than exposing every context as a prompt by default.
				ask_this = { prompt = my_prompts("@this: "), ask = true, submit = false },
				diagnostics = { prompt = my_prompts("Explain @diagnostics"), submit = false },
				diff = { prompt = my_prompts("Review the following git diff for correctness and readability: @diff"), submit = false },
				document = { prompt = my_prompts("Add comments documenting @this"), submit = false },
				explain = { prompt = my_prompts("Explain @this and its context"), submit = false },
				fix = { prompt = my_prompts("Fix @diagnostics"), submit = false },
				implement = { prompt = my_prompts("Implement @this"), submit = false },
				optimize = { prompt = my_prompts("Optimize @this for performance and readability"), submit = false },
				review = { prompt = my_prompts("Review @this for correctness and readability"), submit = false },
				test = { prompt = my_prompts("Add tests for @this"), submit = false },
			},
		}

		-- Required for `opts.events.reload`.
		vim.o.autoread = true

		-- Recommended/example keymaps.
		vim.keymap.set({ "n", "x" }, "<C-a>", function() require("opencode").ask("@this: ", { submit = true }) end,
			{ desc = "Ask opencode" })
		vim.keymap.set({ "n", "x" }, "<C-x>", function() require("opencode").select() end,
			{ desc = "Execute opencode action…" })
		vim.keymap.set({ "n", "t" }, "<C-.>", function() require("opencode").toggle() end, { desc = "Toggle opencode" })

		vim.keymap.set({ "n", "x" }, "go", function() return require("opencode").operator("@this ") end,
			{ expr = true, desc = "Add range to opencode" })
		vim.keymap.set("n", "goo", function() return require("opencode").operator("@this ") .. "_" end,
			{ expr = true, desc = "Add line to opencode" })

		vim.keymap.set("n", "<S-C-u>", function() require("opencode").command("session.half.page.up") end,
			{ desc = "opencode half page up" })
		vim.keymap.set("n", "<S-C-d>", function() require("opencode").command("session.half.page.down") end,
			{ desc = "opencode half page down" })

		-- You may want these if you stick with the opinionated "<C-a>" and "<C-x>" above — otherwise consider "<leader>o".
		vim.keymap.set("n", "+", "<C-a>", { desc = "Increment", noremap = true })
		vim.keymap.set("n", "-", "<C-x>", { desc = "Decrement", noremap = true })
	end,
}
