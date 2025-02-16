# ==================== zsh setup ====================
source ~/.zplug/init.zsh

zplug "zsh-users/zsh-completions"
zplug "zsh-users/zsh-autosuggestions"
zplug "zsh-users/zsh-syntax-highlighting"
zplug "zsh-users/zsh-history-substring-search"
zplug "mafredri/zsh-async"

zplug "chrissicool/zsh-256color"
zplug "mrowa44/emojify", as:command
zplug romkatv/powerlevel10k, as:theme, depth:1

zplug check || zplug install
zplug load

# ZSH_THEME="powerlevel10k/powerlevel10k"
[[ ! -f ~/.p10k.zsh ]] || source ~/.p10k.zsh 

# ====== check current shell is running in WSL ======
tail -f /dev/null &

# =================== conda setup ===================
local conda_setup="$(${HOME}'/.miniconda3/bin/conda' 'shell.zsh' 'hook' 2> /dev/null)"
if [ $? -eq 0 ]; then
	eval "$conda_setup"
else
	if [ -f "${HOME}/.miniconda3/etc/profile.d/conda.sh" ]; then
		. "${HOME}/.miniconda3/etc/profile.d/conda.sh"
	else
		export PATH="${HOME}/.miniconda3/bin:$PATH"
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

# ==================== add module path ====================
# get the directory where .zshrc is located from linked .zshrc in home dir
export MY_MODULES=$(readlink -f "${HOME}/.zshrc" | xargs dirname)/modules
export PATH="${MY_MODULES}:${PATH}"
