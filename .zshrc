# ==================== zsh setup ====================
ZSH_THEME="powerlevel10k/powerlevel10k"
[[ ! -f ~/.p10k.zsh ]] || source ~/.p10k.zsh 

# setup oh-my-zsh
# this segment need to run after setup of powerlevel10k
export ZSH="$HOME/.oh-my-zsh"
plugins=(git)
source $ZSH/oh-my-zsh.sh

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
export LANG=ja_JP.UTF-8
export LANGUAGE="ja_JP:ja"

# ==================== alias ====================
alias v="nvim"
alias vi="nvim"
alias vim="nvim"

# ==================== add module path ====================
# get the directory where .zshrc is located from linked .zshrc in home dir
export MY_MODULES=$(readlink -f "${HOME}/.zshrc" | xargs dirname)/modules
export PATH="${MY_MODULES}:${PATH}"
