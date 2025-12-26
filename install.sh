#!/bin/bash


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


# --- install common packages -------------------------------
log_info "Installing common packages..." &&
	sudo apt-get update &&
	sudo apt-get install -y \
		zsh \
		wget \
		curl \
		git \
		locales-all

# zinit
bash -c "$(curl --fail --show-error --silent --location https://raw.githubusercontent.com/zdharma-continuum/zinit/HEAD/scripts/install.sh)"

# starship
sudo curl -sS https://starship.rs/install.sh | sh

# --- System Setup -------------------------------
USER=$(whoami)

log_info "Adding zsh to /etc/shells..." &&
	grep -q "^/usr/bin/zsh$" /etc/shells ||
	echo "/usr/bin/zsh" | tee -a /etc/shells >/dev/null

log_info "Changing default shell to zsh..." &&
	[[ "$SHELL" == *"zsh"* ]] ||
	sudo chsh -s /usr/bin/zsh

SUDOERS_FILE="/etc/sudoers.d/$USER"
log_info "Adding user to sudoers..." &&
	[ -f "$SUDOERS_FILE" ] ||
	echo "$USER    ALL=NOPASSWD: ALL" | tee "$SUDOERS_FILE" >/dev/null &&
	chmod 440 "$SUDOERS_FILE"


# --- Dotfiles -------------------------------
XDG_CONFIG_HOME=$HOME/.config
DOTFILES_DIR=$XDG_CONFIG_HOME/dotfiles

mkdir -p $DOTFILES_DIR

log_info "Cloning dotfiles repository..." &&
	[ -d $DOTFILES_DIR ] &&
	git clone git@github.com:geometriccross/dotfiles.git $DOTFILES_DIR ||
	git clone https://github.com/geometriccross/dotfiles.git $DOTFILES_DIR

log_info "Add path to /etc/zsh/zshenv for ZDOTDIR..." &&
	grep -q "export ZDOTDIR=$XDG_CONFIG_HOME/zsh" /etc/zsh/zshenv ||
	echo "export ZDOTDIR=$XDG_CONFIG_HOME/zsh" | sudo tee -a /etc/zsh/zshenv >/dev/null

log_info "Sync zsh files" &&
	cp -rsv $DOTFILES_DIR/zsh $XDG_CONFIG_HOME


# --- install aqua packages -------------------------------
log_info "Installing aqua..." &&
	[[ -e $HOME/.local/share/aquaproj-aqua/bin/aqua ]] ||
	curl -sSfL https://raw.githubusercontent.com/aquaproj/aqua-installer/v4.0.2/aqua-installer | bash

${AQUA_ROOT_DIR:-${XDG_DATA_HOME:-$HOME/.local/share}/aquaproj-aqua}/bin/aqua i -a -c $DOTFILES_DIR/aqua.yaml

