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

-- -- カスタムLSP設定
-- local lspconfig = require('lspconfig')
-- local configs = require('lspconfig.configs')
-- -- q2lsp をカスタムサーバーとして登録
-- if not configs.q2lsp then
-- 	configs.q2lsp = {
-- 		default_config = {
-- 			cmd = { 'python', '-m', 'q2lsp', '--debug', '--log-file', '/tmp/q2lsp.log' },
-- 			filetypes = { 'sh', 'bash', 'zsh' },
-- 			root_dir = function(fname)
-- 				return lspconfig.util.find_git_ancestor(fname) or vim.fn.getcwd()
-- 			end,
-- 			settings = {},
-- 		},
-- 	}
-- end
-- -- サーバーを有効化
-- lspconfig.q2lsp.setup({})

vim.cmd [[colorscheme tokyonight]]
