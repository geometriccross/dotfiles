#!/usr/bin/env bash

if [[ "${BASH_SOURCE[0]}" == "$0" ]]; then
	set -Eeuo pipefail
	trap 'log_error "Failed at line $LINENO"' ERR
fi

# 色付き出力用
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

log_info() {
	printf "%b[INFO]%b %s\n" "$GREEN" "$NC" "$1"
}

log_warn() {
	printf "%b[WARN]%b %s\n" "$YELLOW" "$NC" "$1"
}

log_error() {
	printf "%b[ERROR]%b %s\n" "$RED" "$NC" "$1" >&2
}

XDG_CONFIG_HOME="${XDG_CONFIG_HOME:-$HOME/.config}"
XDG_DATA_HOME="${XDG_DATA_HOME:-$HOME/.local/share}"
DOTFILES_DIR="$XDG_CONFIG_HOME/dotfiles"
DOTFILES_SOURCE_DIR=""
DOTFILES_REPO_SSH="git@github.com:geometriccross/dotfiles.git"
DOTFILES_REPO_HTTPS="https://github.com/geometriccross/dotfiles.git"
INSTALL_MODE="full"
HELP_REQUESTED="false"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" >/dev/null 2>&1 && pwd -P || true)"

usage() {
	cat <<'EOF'
Usage: install.sh [--container] [--help]

Modes:
  full         Install packages and configure the host user environment. (default)
  container    Use the current dotfiles checkout; do not install apt packages or edit /etc.
EOF
}

parse_args() {
	INSTALL_MODE="full"
	HELP_REQUESTED="false"

	while (($# > 0)); do
		case "$1" in
			--container)
				INSTALL_MODE="container"
				;;
			--help | -h)
				usage
				HELP_REQUESTED="true"
				return
				;;
			*)
				log_error "Unknown option: $1"
				usage >&2
				return 1
				;;
		esac
		shift
	done
}

is_container_mode() {
	[[ "$INSTALL_MODE" == "container" ]]
}

as_root() {
	if [[ "$(id -u)" -eq 0 ]]; then
		"$@"
	elif command -v sudo >/dev/null 2>&1; then
		sudo "$@"
	else
		log_error "sudo is required when running as a non-root user."
		return 127
	fi
}

backup_path() {
	local path="$1"
	local backup="${path}.bak.$(date +%Y%m%d%H%M%S)"

	while [[ -e "$backup" ]]; do
		backup="${path}.bak.$(date +%Y%m%d%H%M%S).$RANDOM"
	done

	printf "%s" "$backup"
}

is_empty_dir() {
	[[ -d "$1" ]] && [[ -z "$(find "$1" -mindepth 1 -maxdepth 1 -print -quit)" ]]
}

resolve_path() {
	if command -v realpath >/dev/null 2>&1; then
		realpath "$1"
	elif readlink -f "$1" >/dev/null 2>&1; then
		readlink -f "$1"
	elif command -v python3 >/dev/null 2>&1; then
		python3 -c 'import os, sys; print(os.path.realpath(sys.argv[1]))' "$1"
	else
		(cd "$(dirname "$1")" && printf "%s/%s\n" "$(pwd -P)" "$(basename "$1")")
	fi
}

valid_dotfiles_checkout() {
	[[ -d "$1/zsh" && -f "$1/aqua.yaml" ]]
}

select_container_source_dir() {
	if valid_dotfiles_checkout "$SCRIPT_DIR"; then
		DOTFILES_SOURCE_DIR="$SCRIPT_DIR"
	elif valid_dotfiles_checkout "$PWD"; then
		DOTFILES_SOURCE_DIR="$PWD"
	else
		log_error "Container mode must run from a dotfiles checkout containing zsh/ and aqua.yaml."
		return 1
	fi
}

install_common_packages() {
	local packages=(zsh git curl wget build-essential unzip python3-venv python3-pip)
	local missing=()

	for cmd in "${packages[@]}"; do
		command -v "$cmd" >/dev/null || missing+=("$cmd")
	done

	if ((${#missing[@]} == 0)); then
		log_info "All prerequisites already installed."
		return
	fi

	log_info "Missing packages: ${missing[*]}"

	if command -v brew >/dev/null; then
		brew install "${missing[@]}"
	elif command -v apt-get >/dev/null; then
		as_root apt-get update
		as_root apt-get install -y "${missing[@]}" locales-all
	else
		log_error "No supported package manager found (brew or apt-get)."
		return 1
	fi
}

ensure_zinit() {
	local zinit_home="${ZINIT_HOME:-$XDG_DATA_HOME/zinit/zinit.git}"

	if [[ -r "$zinit_home/zinit.zsh" ]]; then
		log_info "zinit already installed."
		return
	fi

	log_info "Installing zinit..."
	mkdir -p "$(dirname "$zinit_home")"
	git clone https://github.com/zdharma-continuum/zinit.git "$zinit_home"
}

ensure_zsh_shell() {
	local zsh_path
	zsh_path="$(command -v zsh)"

	if grep -Fxq "$zsh_path" /etc/shells 2>/dev/null; then
		log_info "$zsh_path already listed in /etc/shells."
	else
		log_info "Adding $zsh_path to /etc/shells..."
		printf "%s\n" "$zsh_path" | as_root tee -a /etc/shells >/dev/null
	fi

	if [[ "$SHELL" != "$zsh_path" ]]; then
		log_info "Changing default shell to zsh..."
		chsh -s "$zsh_path"
	fi
}

clone_dotfiles() {
	mkdir -p "$(dirname "$DOTFILES_DIR")"

	log_info "Cloning dotfiles repository..."
	if GIT_SSH_COMMAND="ssh -o BatchMode=yes -o ConnectTimeout=5" git clone "$DOTFILES_REPO_SSH" "$DOTFILES_DIR"; then
		return
	fi

	log_warn "SSH clone failed. Falling back to HTTPS."
	git clone "$DOTFILES_REPO_HTTPS" "$DOTFILES_DIR"
}

ensure_dotfiles_repo() {
	local backup

	mkdir -p "$(dirname "$DOTFILES_DIR")"

	if is_container_mode; then
		select_container_source_dir
		if [[ "$(resolve_path "$DOTFILES_SOURCE_DIR")" == "$(resolve_path "$DOTFILES_DIR" 2>/dev/null || printf '%s' "$DOTFILES_DIR")" ]]; then
			log_info "Dotfiles checkout already at stable path: $DOTFILES_DIR"
		else
			ensure_symlink "$DOTFILES_SOURCE_DIR" "$DOTFILES_DIR"
		fi
		return
	fi

	if valid_dotfiles_checkout "$DOTFILES_DIR"; then
		log_info "Dotfiles repository already available: $DOTFILES_DIR"
		return
	fi

	if [[ -e "$DOTFILES_DIR" ]] && ! is_empty_dir "$DOTFILES_DIR"; then
		backup="$(backup_path "$DOTFILES_DIR")"
		log_warn "$DOTFILES_DIR exists but is not a valid dotfiles checkout. Moving to $backup"
		mv "$DOTFILES_DIR" "$backup"
	fi

	clone_dotfiles
}

ensure_symlink() {
	local source="$1"
	local target="$2"
	local current_target=""
	local source_target=""
	local backup

	if [[ ! -e "$source" ]]; then
		log_error "Symlink source not found: $source"
		return 1
	fi

	mkdir -p "$(dirname "$target")"
	source_target="$(resolve_path "$source")"

	if [[ -L "$target" ]]; then
		current_target="$(resolve_path "$target" 2>/dev/null || true)"
		if [[ -n "$current_target" && "$current_target" == "$source_target" ]]; then
			log_info "Symlink already configured: $target -> $source"
			return
		fi

		log_warn "Replacing symlink: $target -> $(readlink "$target")"
		rm "$target"
	elif [[ -e "$target" ]]; then
		backup="$(backup_path "$target")"
		log_warn "$target already exists. Moving to $backup"
		mv "$target" "$backup"
	fi

	log_info "Creating symlink: $target -> $source"
	ln -s "$source" "$target"
}

ensure_aqua() {
	local aqua_bin="${AQUA_ROOT_DIR:-$XDG_DATA_HOME/aquaproj-aqua}/bin/aqua"

	if [[ -x "$aqua_bin" ]]; then
		log_info "aqua already installed."
	else
		log_info "Installing aqua..."
		curl -sSfL https://raw.githubusercontent.com/aquaproj/aqua-installer/v4.0.2/aqua-installer | bash
	fi

	log_info "Installing aqua packages..."
	"$aqua_bin" i -a -c "$DOTFILES_DIR/aqua.yaml"
}

main() {
	parse_args "$@"
	if [[ "$HELP_REQUESTED" == "true" ]]; then
		return
	fi

	if ! is_container_mode; then
		install_common_packages
		ensure_zinit
		ensure_zsh_shell
	fi

	ensure_dotfiles_repo
	ensure_symlink "$DOTFILES_DIR/zsh" "$XDG_CONFIG_HOME/zsh"
	ensure_symlink "$DOTFILES_DIR/zsh/.zshenv" "$HOME/.zshenv"
	ensure_aqua
}

if [[ "${BASH_SOURCE[0]}" == "$0" ]]; then
	main "$@"
fi
