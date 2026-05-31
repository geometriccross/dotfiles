export PATH="$HOME/.local/bin:$PATH"


# ==================== zsh setup ====================
ZINIT_HOME="${XDG_DATA_HOME:-${HOME}/.local/share}/zinit/zinit.git"
if [[ -r "$ZINIT_HOME/zinit.zsh" ]]; then
	source "${ZINIT_HOME}/zinit.zsh"

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
fi

autoload -Uz compinit
compinit
if command -v zinit >/dev/null 2>&1; then
	# Zinitが読み込んだ補完定義を確実に反映させるコマンド（推奨）
	zinit cdreplay -q
fi

# prompt setting
if command -v starship >/dev/null 2>&1; then
	eval "$(starship init zsh)"
fi


# ==================== load my custom files  ====================
[[ -f "$HOME/.local/bin/env" ]] && . "$HOME/.local/bin/env"

[[ -f "${ZDOTDIR:-$XDG_CONFIG_HOME/zsh}/.alias" ]] && source "${ZDOTDIR:-$XDG_CONFIG_HOME/zsh}/.alias"

