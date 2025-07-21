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

# ================== pyenv setup =================
export PYENV_ROOT="$HOME/.pyenv"
[[ -d $PYENV_ROOT/bin ]] && export PATH="$PYENV_ROOT/bin:$PATH"
eval "$(pyenv init - zsh)"

# ================ ssh editor setup =================
if [[ -n $SSH_CONNECTION ]]; then
	export EDITOR='vim'
else
	export EDITOR='nvim'
fi

# ================= lang setup ==================
export LANG="en_US.UTF-8"

# ==================== add path ====================
# get the directory where .zshrc is located from linked .zshrc in home dir
export MY_MODULES=$(readlink -f "${HOME}/.zshrc" | xargs dirname | xargs dirname)/modules
export PATH="${MY_MODULES}:${PATH}"
export PATH="$PATH:/opt/nvim/" # globally expose nvim
BROWSER_32="/mnt/c/Program Files (x86)/Google/Chrome/Application/chrome.exe"
BROWSER_64="/mnt/c/Program Files/Google/Chrome/Application/chrome.exe"
if [ -x "$BROWSER_64" ]; then
    export BROWSER="$BROWSER_64"
elif [ -x "$BROWSER_32" ]; then
    export BROWSER="$BROWSER_32"
fi

# ==================== alias ====================
alias s="source $HOME/.zshrc"

alias v="nvim"
alias vi="nvim"
alias vim="nvim"

for script in $MY_MODULES/**/*.sh; do
    name=$(basename "$script" .sh)
    alias "$name"=". $script"
done
