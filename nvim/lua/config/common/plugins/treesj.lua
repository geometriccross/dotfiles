return {
	"Wansmer/treesj",
	event = "InsertEnter",
	keys = { "<leader>m", "<leader>j", "<leader>s" },
	dependencies = { "nvim-treesitter/nvim-treesitter" },
	config = function()
		require("treesj").setup({})
	end,
}
