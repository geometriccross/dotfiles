# ==================== zsh setup ====================
# right is a path when install zplug with package manager
source ~/.zplug/init.zsh || source /usr/share/zplug/init.zsh

zplug "zsh-users/zsh-completions"
zplug "zsh-users/zsh-autosuggestions"
zplug "zsh-users/zsh-syntax-highlighting"
zplug "zsh-users/zsh-history-substring-search"
zplug "mafredri/zsh-async"

zplug "chrissicool/zsh-256color"
zplug "mrowa44/emojify", as:command

zplug 'zplug/zplug', hook-build:'zplug --self-manage'

zplug check || zplug install
zplug load

. "$HOME/.local/bin/env"
eval "$(starship init zsh)"

export XDG_DATA_HOME=$HOME/.local/share
export XDG_CONFIG_HOME=$HOME/.config
export XDG_STATE_HOME=$HOME/.local/state
export XDG_CACHE_HOME=$HOME/.cache

for file in $XDG_CONFIG_HOME/zsh/.*; do
	[[ $file != *".zshrc"* ]] && source $file
done
