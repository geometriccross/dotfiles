export XDG_DATA_HOME=${XDG_DATA_HOME:-$HOME/.local/share}
export XDG_CONFIG_HOME=${XDG_CONFIG_HOME:-$HOME/.config}
export XDG_STATE_HOME=${XDG_STATE_HOME:-$HOME/.local/state}
export XDG_CACHE_HOME=${XDG_CACHE_HOME:-$HOME/.cache}
export ZDOTDIR=${ZDOTDIR:-$XDG_CONFIG_HOME/zsh}

# Locale must be available before login/interactive hooks launch Nix programs.
# Preserve an explicit archive (e.g. one supplied by a Nix development shell).
if [[ -z ${LOCALE_ARCHIVE:-} && -r "$HOME/.nix-profile/lib/locale/locale-archive" ]]; then
	export LOCALE_ARCHIVE="$HOME/.nix-profile/lib/locale/locale-archive"
fi
export LANG=ja_JP.UTF-8
export LANGUAGE=ja:en
# Do not let an inherited LC_ALL override LANG or per-category settings.
unset LC_ALL

export OLLAMA_CONTEXT_LENGTH=128000
