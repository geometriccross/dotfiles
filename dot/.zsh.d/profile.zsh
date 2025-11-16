# ================ language =================
export LANG="en_US.UTF-8"


# ================ editor setup =================
export PATH="$PATH:/opt/nvim/" # globally expose nvim
if [[ -n $SSH_CONNECTION ]]; then
	export EDITOR='vim'
else
	export EDITOR='nvim'
fi

export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"  # This loads nvm
[ -s "$NVM_DIR/bash_completion" ] && \. "$NVM_DIR/bash_completion"  # This loads nvm bash_completion

eval "$(direnv hook zsh)"


# ================ modules =================
# get the directory where .zshrc is located from linked .zshrc in home dir
export MY_MODULES=$(readlink -f "${HOME}/.zshrc" | xargs dirname | xargs dirname)/modules
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

export PATH=${AQUA_ROOT_DIR:-${XDG_DATA_HOME:-$HOME/.local/share}/aquaproj-aqua}/bin:$PATH # aqua
export PATH="/home/geometriccross/.pixi/bin:$PATH" # pixi
source ~/.env # SET MANUALY

