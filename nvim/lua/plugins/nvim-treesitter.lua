return {
	"nvim-treesitter/nvim-treesitter",
	lazy = false,
	build = ":TSUpdate",
	dependencies = { "RRethy/nvim-treesitter-endwise" },
	config = function()
		require("nvim-treesitter").install({
			"lua",
			"vim",
			"vimdoc",
			"query",
			"markdown",
			"markdown_inline",
			"css",
			"html",
			"javascript",
			"latex",
			"norg",
			"scss",
			"svelte",
			"tsx",
			"typst",
			"vue",
			"python",
			"bash",
			"zsh",
		})

		vim.api.nvim_create_autocmd("FileType", {
			callback = function()
				pcall(vim.treesitter.start)
			end,
		})
	end,
}
