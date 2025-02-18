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

[[ ! -f ~/.p10k.zsh ]] || source ~/.p10k.zsh 

# ====== check current shell is running in WSL ======
tail -f /dev/null &

# ================== conda setup ===================
local conda_setup_without_env_activate="$('/home/geometriccross/.miniconda3/bin/conda' 'shell.zsh' 'hook' | head -n -1  2> /dev/null)"
if [ $? -eq 0 ]; then
	echo evaled
    eval "$conda_setup_without_env_activate"
else
    if [ -f "/home/geometriccross/.miniconda3/etc/profile.d/conda.sh" ]; then
		echo profile
        . "/home/geometriccross/.miniconda3/etc/profile.d/conda.sh"
    else
		echo exported
        export PATH="/home/geometriccross/.miniconda3/bin:$PATH"
    fi
fi

# ================ ssh editor setup =================
if [[ -n $SSH_CONNECTION ]]; then
	export EDITOR='vim'
else
	export EDITOR='nvim'
fi

# ================= lang setup ==================
export LANG="en_US.UTF-8"

# ==================== alias ====================
alias v="nvim"
alias vi="nvim"
alias vim="nvim"

alias c=". c.sh"
alias cec=". cec.sh"
alias pop=". pop.sh"
alias push=". push.sh"

# ==================== add module path ====================
# get the directory where .zshrc is located from linked .zshrc in home dir
export MY_MODULES=$(readlink -f "${HOME}/.zshrc" | xargs dirname | xargs dirname)/modules
export PATH="${MY_MODULES}:${PATH}"
