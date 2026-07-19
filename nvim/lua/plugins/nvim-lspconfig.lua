local servers = {
	"bashls",
	"csharp_ls",
	"lua_ls",
	"powershell_es",
	"pyright",
	"ruff",
}

return {
	{
		"mason-org/mason-lspconfig.nvim",
		dependencies = {
			{ "mason-org/mason.nvim", opts = {} },
			"neovim/nvim-lspconfig",
		},
		opts = {
			ensure_installed = vim.list_extend(vim.deepcopy(servers), { "copilot" }),
			automatic_enable = servers,
		},
	},
}
