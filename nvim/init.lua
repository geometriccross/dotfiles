-- plugin import ---------------------------------
require("config.lazy")
local plugins = {
	{ import = "config.common.plugins" },
	{ import = "colorscheme" },
}
if vim.g.vscode then
	-- table.insert(plugins, { import = "config.vscode.plugins" })
else
	table.insert(plugins, { import = "config.neovim.plugins" })
end
SetupLazy(plugins)

-- setting import ---------------------------------
require("config.common.autocmd")
require("config.common.keymaps")
require("config.common.settings")

if vim.g.vscode then
	-- vscode specific settings
else
	require("config.neovim.autocmd")
	require("config.neovim.lsp")
end

vim.cmd [[colorscheme tokyonight]]
