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

source ~/.env # SET MANUALY

# ====== check current shell is running in WSL ======
tail -f /dev/null &

# ================== micromamba setup ===================
# !! Contents within this block are managed by 'micromamba shell init' !!
unalias micromamba 2>/dev/null
export MAMBA_EXE='/home/geometriccross/.local/bin/micromamba';
export MAMBA_ROOT_PREFIX='/home/geometriccross/.micromamba';
__mamba_setup="$("$MAMBA_EXE" shell hook --shell zsh --root-prefix "$MAMBA_ROOT_PREFIX" 2> /dev/null)"
if [ $? -eq 0 ]; then
    eval "$__mamba_setup"
else
    alias micromamba="$MAMBA_EXE"  # Fallback on help from micromamba activate
fi
unset __mamba_setup

# ================ ssh editor setup =================
if [[ -n $SSH_CONNECTION ]]; then
	export EDITOR='vim'
else
	export EDITOR='nvim'
fi

# ================= lang setup ==================
export LANG="en_US.UTF-8"

# ==================== alias ====================
alias src="source ~/.zshrc"

alias v="nvim"
alias vi="nvim"
alias vim="nvim"

alias mamba="micromamba"
alias conda="micromamba"

alias c=". c.sh"
alias cec=". cec.sh"
alias pop=". pop.sh"
alias push=". push.sh"
alias newfile=". newfile.sh"
alias update-nvim=". update-nvim.sh"

# ==================== add path ====================
# get the directory where .zshrc is located from linked .zshrc in home dir
export MY_MODULES=$(readlink -f "${HOME}/.zshrc" | xargs dirname | xargs dirname)/modules
export PATH="${MY_MODULES}:${PATH}"
export PATH="$PATH:/opt/nvim/" # globally expose nvim
export BROWSER="/mnt/c/Program Files/Google/Chrome/Application/chrome.exe"
