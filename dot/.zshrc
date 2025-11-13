if [[ -d ~/.zsh.d ]]
then
	ZDOTDIR=~/.zsh.d
fi

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
zplug romkatv/powerlevel10k, as:theme, depth:1

zplug 'zplug/zplug', hook-build:'zplug --self-manage'

zplug check || zplug install
zplug load

[[ ! -f ~/.zsh.d/.p10k.zsh ]] || source ~/.zsh.d/.p10k.zsh 
