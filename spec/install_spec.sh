Include ./install.sh

empty_dir_status() {
	local tmp
	tmp="$(mktemp -d)"
	is_empty_dir "$tmp"
	local status=$?
	rm -rf "$tmp"
	return "$status"
}

non_empty_dir_status() {
	local tmp
	tmp="$(mktemp -d)"
	touch "$tmp/file"
	is_empty_dir "$tmp"
	local status=$?
	rm -rf "$tmp"
	return "$status"
}

symlink_points_to_source() {
	local tmp
	local status
	tmp="$(mktemp -d)"
	mkdir "$tmp/source"
	ensure_symlink "$tmp/source" "$tmp/target" >/dev/null
	[[ -L "$tmp/target" ]] && [[ "$(resolve_path "$tmp/target")" == "$(resolve_path "$tmp/source")" ]]
	status=$?
	rm -rf "$tmp"
	return "$status"
}

symlink_replaces_wrong_symlink() {
	local tmp
	local status
	tmp="$(mktemp -d)"
	mkdir "$tmp/source" "$tmp/old-source"
	ln -s "$tmp/old-source" "$tmp/target"
	ensure_symlink "$tmp/source" "$tmp/target" >/dev/null
	[[ -L "$tmp/target" ]] && [[ "$(resolve_path "$tmp/target")" == "$(resolve_path "$tmp/source")" ]]
	status=$?
	rm -rf "$tmp"
	return "$status"
}

symlink_moves_existing_directory() {
	local tmp
	local backup
	local status
	tmp="$(mktemp -d)"
	mkdir "$tmp/source" "$tmp/target"
	touch "$tmp/target/file"
	ensure_symlink "$tmp/source" "$tmp/target" >/dev/null
	backup="$(find "$tmp" -maxdepth 1 -type d -name 'target.bak.*' -print -quit)"
	[[ -L "$tmp/target" ]] && [[ -n "$backup" ]] && [[ -f "$backup/file" ]]
	status=$?
	rm -rf "$tmp"
	return "$status"
}

symlink_keeps_correct_existing_link() {
	local tmp
	local target_before
	local target_after
	local backup
	local status
	tmp="$(mktemp -d)"
	mkdir "$tmp/source"
	ln -s "$tmp/source" "$tmp/target"
	target_before="$(readlink "$tmp/target")"
	ensure_symlink "$tmp/source" "$tmp/target" >/dev/null
	target_after="$(readlink "$tmp/target")"
	backup="$(find "$tmp" -maxdepth 1 -name 'target.bak.*' -print -quit)"
	[[ "$target_after" == "$target_before" ]] && [[ -z "$backup" ]]
	status=$?
	rm -rf "$tmp"
	return "$status"
}

symlink_missing_source_fails() {
	local tmp
	local status
	tmp="$(mktemp -d)"
	ensure_symlink "$tmp/missing" "$tmp/target" >/dev/null 2>&1
	status=$?
	rm -rf "$tmp"
	return "$status"
}

parse_default_mode_selected() {
	parse_args >/dev/null
	[[ "$INSTALL_MODE" == "full" ]] && [[ "$HELP_REQUESTED" == "false" ]]
}

parse_container_mode_selected() {
	parse_args --container >/dev/null
	[[ "$INSTALL_MODE" == "container" ]] && [[ "$HELP_REQUESTED" == "false" ]]
}

parse_unknown_option_fails() {
	parse_args --unknown >/dev/null 2>&1
}

Describe 'install.sh source behavior'
	It 'does not execute main when sourced'
		When run bash -c 'source ./install.sh'
		The status should be success
		The stdout should equal ""
		The stderr should equal ""
	End
End

Describe 'parse_args'
	It 'uses full mode by default'
		When call parse_default_mode_selected
		The status should be success
	End

	It 'selects container mode'
		When call parse_container_mode_selected
		The status should be success
	End

	It 'rejects unknown options'
		When call parse_unknown_option_fails
		The status should be failure
	End
End

Describe 'main --container'
	It 'skips full-mode setup steps'
		When run bash -c 'source ./install.sh; install_common_packages(){ echo full:packages; }; ensure_zinit(){ echo full:zinit; }; ensure_zsh_shell(){ echo full:zsh_shell; }; ensure_dotfiles_repo(){ echo common:repo; }; ensure_symlink(){ echo common:symlink:$1:$2; }; ensure_aqua(){ echo common:aqua; }; main --container'
		The status should be success
		The stdout should include "common:repo"
		The stdout should include "common:symlink:"
		The stdout should include ".zshenv"
		The stdout should include "common:aqua"
		The stdout should not include "full:"
	End
End

Describe 'is_empty_dir'
	It 'returns success for empty directories'
		When call empty_dir_status
		The status should be success
	End

	It 'returns failure for non-empty directories'
		When call non_empty_dir_status
		The status should be failure
	End
End

Describe 'ensure_symlink'
	It 'creates a symlink to the source directory'
		When call symlink_points_to_source
		The status should be success
	End

	It 'replaces a symlink pointing elsewhere'
		When call symlink_replaces_wrong_symlink
		The status should be success
	End

	It 'moves an existing directory aside before linking'
		When call symlink_moves_existing_directory
		The status should be success
	End

	It 'keeps an existing correct symlink unchanged'
		When call symlink_keeps_correct_existing_link
		The status should be success
	End

	It 'returns failure when the source is missing'
		When call symlink_missing_source_fails
		The status should be failure
	End
End
