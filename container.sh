#!/bin/bash

set -e

# 色付き出力用
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

log_info() {
	echo -e "${GREEN}[INFO]${NC} $1"
}

log_warn() {
	echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
	echo -e "${RED}[ERROR]${NC} $1"
}

DOTFILES_DIR="$HOME/.dotfiles"

# --- Dotfiles -------------------------------
log_info "Cloning dotfiles repository..." &&
	[ -d "$DOTFILES_DIR" ] ||
	git clone https://github.com/geometriccross/dotfiles.git "$DOTFILES_DIR"

ln -sf "$DOTFILES_DIR"/dot/.zshrc "$HOME/.zshrc" && log_info "Created symlink: $SOURCE_DIR/.zshrc -> $HOME/.zshrc"
ln -sf "$DOTFILES_DIR"/dot/.bashrc "$HOME/.bashrc" && log_info "Created symlink: $SOURCE_DIR/.bashrc -> $HOME/.bashrc"
ln -sf "$DOTFILES_DIR"/dot/.zsh.d "$HOME/.zsh.d" && log_info "Created symlink: $SOURCE_DIR/.zsh.d -> $HOME/.zsh.d"

# --- install aqua packages -------------------------------
log_info "Installing aqua..." &&
	[[ -e $HOME/.local/share/aquaproj-aqua/bin/aqua ]] ||
	curl -sSfL https://raw.githubusercontent.com/aquaproj/aqua-installer/v4.0.2/aqua-installer | bash
