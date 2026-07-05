require("mason").setup()

local capabilities = vim.lsp.protocol.make_client_capabilities()

require("mason-lspconfig").setup({
	automatic_installation = true,
	ensure_installed = {
		"bashls",
		"lua_ls",
		"powershell_es",
		"copilot",
		"pyright",
	},
	handlers = {
		function(server_name)
			vim.lsp.config(server_name, {
				capabilities = capabilities,
			})
			vim.lsp.enable(server_name)
		end,

		["ruff"] = function()
			vim.lsp.config("ruff", {
				capabilities = vim.tbl_deep_extend("force", capabilities, {
					offsetEncoding = { "utf-16" },
				}),
				on_attach = function(client, _)
					client.server_capabilities.hoverProvider = false
				end,
			})
			vim.lsp.enable("ruff")
		end,

		["pyright"] = function()
			vim.lsp.config("pyright", {
				capabilities = capabilities,
				settings = {
					python = {
						analysis = {
							autoSearchPaths = true,
							diagnosticMode = "openFilesOnly",
							useLibraryCodeForTypes = true,
							typeCheckingMode = "standard",
						},
					},
				},
			})
			vim.lsp.enable("pyright")
		end,

		["powershell_es"] = function()
			vim.lsp.config("powershell_es", {
				capabilities = capabilities,
				on_attach = function(_, bufnr)
					vim.api.nvim_buf_set_option(bufnr, "omnifunc", "v:lua.vim.lsp.omnifunc")
				end,
				filetypes = { "ps1", "psm1", "psd1" },
				bundle_path = vim.fn.expand(
					vim.fn.stdpath("data") .. "/mason/packages/powershell-editor-services"
				),
				settings = { powershell = { codeFormatting = { Preset = "OTBS" } } },
			})
			vim.lsp.enable("powershell_es")
		end,
	},
})

vim.lsp.config("racket_langserver", {
	cmd = { "racket", "--lib", "racket-langserver" },
	filetypes = { "racket", "rkt" },
	root_markers = { "info.rkt", ".git" },
	capabilities = capabilities,
})
vim.lsp.enable("racket_langserver")

require("conform").setup({
	formatters_by_ft = {
		lua = { "stylua" },
		python = { "ruff_format" },
		javascript = { "prettierd", "prettier", stop_after_first = true },
	},
	format_on_save = {
		timeout_ms = 2000,
		lsp_format = "fallback",
	},
})

vim.api.nvim_create_user_command("Format", function(args)
	local range = nil
	if args.count ~= -1 then
		local end_line = vim.api.nvim_buf_get_lines(0, args.line2 - 1, args.line2, true)[1]
		range = {
			start = { args.line1, 0 },
			["end"] = { args.line2, end_line:len() },
		}
	end
	require("conform").format({ async = true, lsp_format = "fallback", range = range })
end, { range = true })

vim.keymap.set("n", "<space>e", vim.diagnostic.open_float, { desc = "Open diagnostic float" })
vim.keymap.set("n", "[d", vim.diagnostic.goto_prev, { desc = "Go to previous diagnostic" })
vim.keymap.set("n", "]d", vim.diagnostic.goto_next, { desc = "Go to next diagnostic" })
vim.keymap.set("n", "<space>q", vim.diagnostic.setloclist, { desc = "Set diagnostic loclist" })

vim.api.nvim_create_autocmd("LspAttach", {
	group = vim.api.nvim_create_augroup("UserLspConfig", {}),
	callback = function(ev)
		local client = vim.lsp.get_client_by_id(ev.data.client_id)
		local opts = { buffer = ev.buf }

		vim.keymap.set("n", "K", vim.lsp.buf.hover, vim.tbl_extend("force", opts, { desc = "LSP Hover" }))
		vim.keymap.set(
			"n",
			"<C-k>",
			vim.lsp.buf.signature_help,
			vim.tbl_extend("force", opts, { desc = "LSP Signature Help" })
		)
		vim.keymap.set(
			"n",
			"<space>wa",
			vim.lsp.buf.add_workspace_folder,
			vim.tbl_extend("force", opts, { desc = "Add workspace folder" })
		)
		vim.keymap.set(
			"n",
			"<space>wr",
			vim.lsp.buf.remove_workspace_folder,
			vim.tbl_extend("force", opts, { desc = "Remove workspace folder" })
		)
		vim.keymap.set("n", "<space>wl", function()
			print(vim.inspect(vim.lsp.buf.list_workspace_folders()))
		end, vim.tbl_extend("force", opts, { desc = "List workspace folders" }))
		vim.keymap.set(
			"n",
			"<space>rn",
			vim.lsp.buf.rename,
			vim.tbl_extend("force", opts, { desc = "LSP Rename" })
		)
		vim.keymap.set(
			"n",
			"<space>ca",
			vim.lsp.buf.code_action,
			vim.tbl_extend("force", opts, { desc = "LSP Code Action" })
		)
		vim.keymap.set({ "n", "v" }, "<space>f", function()
			require("conform").format({ async = true, lsp_format = "fallback" })
		end, vim.tbl_extend("force", opts, { desc = "Format file" }))
	end,
})
