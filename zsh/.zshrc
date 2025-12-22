export XDG_DATA_HOME=$HOME/.local/share
export XDG_CONFIG_HOME=$HOME/.config
export XDG_STATE_HOME=$HOME/.local/state
export XDG_CACHE_HOME=$HOME/.cache


# ==================== zsh setup ====================
ZINIT_HOME="${XDG_DATA_HOME:-${HOME}/.local/share}/zinit/zinit.git"
[ ! -d $ZINIT_HOME ] && mkdir -p "$(dirname $ZINIT_HOME)"
[ ! -d $ZINIT_HOME/.git ] && git clone https://github.com/zdharma-continuum/zinit.git "$ZINIT_HOME"
source "${ZINIT_HOME}/zinit.zsh"
autoload -Uz _zinit
(( ${+_comps} )) && _comps[zinit]=_zinit

zinit light-mode for \
    zdharma-continuum/zinit-annex-as-monitor \
    zdharma-continuum/zinit-annex-bin-gem-node \
    zdharma-continuum/zinit-annex-patch-dl \
    zdharma-continuum/zinit-annex-rust

zinit load "mafredri/zsh-async"
zinit load "zsh-users/zsh-completions"
zinit load "zsh-users/zsh-autosuggestions"
zinit load "zsh-users/zsh-syntax-highlighting"
zinit load "zsh-users/zsh-history-substring-search"
zinit load "chrissicool/zsh-256color"
zinit load "mrowa44/emojify"

zinit self-update

# prompt setting
eval "$(starship init zsh)"
# ==================== load my custom files  ====================
. "$HOME/.local/bin/env"

for file in $XDG_CONFIG_HOME/zsh/.*; do
	[[ $file != *".zshrc"* ]] && source $file
done

