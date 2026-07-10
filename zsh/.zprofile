# ================ language =================
export LANGUAGE=en_US.UTF-8
export LANG=en_US.UTF-8
export LC_ALL=en_US.UTF-8

# ================ editor setup =================
if [[ -n $SSH_CONNECTION ]]; then
	export EDITOR='vim'
else
	export EDITOR='nvim'
fi

# export NVM_DIR="$HOME/.nvm"
# [ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"  # This loads nvm
# [ -s "$NVM_DIR/bash_completion" ] && \. "$NVM_DIR/bash_completion"  # This loads nvm bash_completion

if command -v direnv >/dev/null 2>&1; then
	eval "$(direnv hook zsh)"
fi


# ================ modules =================
# get the directory where .zshrc is located from linked .zshrc in home dir
export MY_MODULES=$XDG_CONFIG_HOME/dotfiles/modules
export PATH="${MY_MODULES}:${PATH}"
for script in $MY_MODULES/**/*.sh; do
    name=$(basename "$script" .sh)
    alias "$name"=". $script"
done


# ================ other path =================
# web browser
BROWSER_32="/mnt/c/Program Files (x86)/Google/Chrome/Application/chrome.exe"
BROWSER_64="/mnt/c/Program Files/Google/Chrome/Application/chrome.exe"
if [ -x "$BROWSER_64" ]; then
    export BROWSER="$BROWSER_64"
elif [ -x "$BROWSER_32" ]; then
    export BROWSER="$BROWSER_32"
fi

export PATH=$HOME/.opencode/bin:$PATH # opencode

[[ -f "$HOME/.env" ]] && source "$HOME/.env" # SET MANUALY
[[ -f "$HOME/.local/bin/env" ]] && . "$HOME/.local/bin/env"

# homebrew
if [[ -x /opt/homebrew/bin/brew ]]; then
	eval "$(/opt/homebrew/bin/brew shellenv zsh)"
fi

# beads
export PATH="$PATH:$HOME/.local/bin"

# devbox global
if command -v devbox >/dev/null 2>&1; then
	eval "$(devbox global shellenv)"
fi

# pnpm
export PNPM_HOME="$HOME/.local/share/pnpm"
for pnpm_path in "$PNPM_HOME" "$PNPM_HOME/bin"; do
  case ":$PATH:" in
    *":$pnpm_path:"*) ;;
    *) export PATH="$pnpm_path:$PATH" ;;
  esac
done
unset pnpm_path

# bun
export PATH="$HOME/.cache/.bun/bin:$PATH"

# micromamba
export MAMBA_EXE='/opt/homebrew/bin/micromamba'
export MAMBA_ROOT_PREFIX=$XDG_DATA_HOME/mamba
if [[ -x "$MAMBA_EXE" ]]; then
	__mamba_setup="$("$MAMBA_EXE" shell hook --shell zsh --root-prefix "$MAMBA_ROOT_PREFIX" 2>/dev/null)"
	if [ $? -eq 0 ]; then
		eval "$__mamba_setup"
	else
		alias micromamba="$MAMBA_EXE" # Fallback on help from micromamba activate
	fi
	unset __mamba_setup
fi

# flutter
export PATH="$PATH:$HOME/.local/bin/flutter/bin"

export PATH="$PATH:$HOME/.local/share/npm-global/bin/"
