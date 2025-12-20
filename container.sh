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


# --- Dotfiles -------------------------------
XDG_CONFIG_HOME=$HOME/.config
DOTFILES_DIR=$XDG_CONFIG_HOME/dotfiles

mkdir -p $DOTFILES_DIR

log_info "Cloning dotfiles repository..." &&
	[ -d $DOTFILES_DIR ] &&
	git clone git@github.com:geometriccross/dotfiles.git $DOTFILES_DIR ||
	git clone https://github.com/geometriccross/dotfiles.git $DOTFILES_DIR

log_info "Add path to /etc/zsh/zshenv for ZDOTDIR..." &&
	grep -q "export ZDOTDIR=$DOTFILES_DIR" /etc/zsh/zshenv ||
	echo "export ZDOTDIR=$DOTFILES_DIR" | sudo tee -a /etc/zsh/zshenv >/dev/null

log_info "Sync zsh files" &&
	cp -rsv $DOTFILES_DIR/zsh $XDG_CONFIG_HOME


# --- install aqua packages -------------------------------
log_info "Installing aqua..." &&
	[[ -e $HOME/.local/share/aquaproj-aqua/bin/aqua ]] ||
	curl -sSfL https://raw.githubusercontent.com/aquaproj/aqua-installer/v4.0.2/aqua-installer | bash
