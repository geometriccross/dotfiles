return {
	"okuuva/auto-save.nvim",
	version = "^1.0.0",
	opts = {
		trigger_events = {
			immediate_save = { "BufLeave", "FocusLost" },
			defer_save = { "InsertLeave", "TextChanged" },
			cancel_deferred_save = { "InsertEnter" },
		},
		debounce_delay = 1000,
	},
}
