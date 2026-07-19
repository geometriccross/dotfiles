return {
	-- cmp settings are in lua/config/cmp.lua
	"saghen/blink.cmp",
	version = "*",
	dependencies = {
		"rafamadriz/friendly-snippets",
		"L3MON4D3/LuaSnip",
		"giuxtaposition/blink-cmp-copilot",
	},
	opts = {
		keymap = {
			preset = "super-tab",
		},
		sources = {
			default = { "lsp", "path", "snippets", "buffer", "copilot" },
			providers = {
				copilot = {
					name = "copilot",
					module = "blink-cmp-copilot",
					score_offset = 100,
					async = true,
				},
			},
		},
		snippets = { preset = "luasnip" },
	},
	config = function(_, opts)
		require("blink.cmp").setup(opts)
		local luasnip = require("luasnip")
		if not vim.fn.has("win32") then
			require("luasnip.loaders.from_vscode").lazy_load({
				paths = {
					os.getenv("HOME") .. "/.local/share/nvim/lazy/friendly-snippets",
				},
			})
		end
	end,
}
